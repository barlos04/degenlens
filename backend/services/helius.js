const HELIUS_BASE = 'https://api.helius.xyz';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// Native SOL mint
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Fetch parsed transaction history for a wallet.
 * Returns enriched swap transactions.
 */
export async function fetchWalletSwaps(walletAddress, beforeSignature = null, limit = 100) {
  const url = new URL(`${HELIUS_BASE}/v0/addresses/${walletAddress}/transactions`);
  url.searchParams.set('api-key', HELIUS_API_KEY);
  url.searchParams.set('type', 'SWAP');
  if (limit) url.searchParams.set('limit', limit);
  if (beforeSignature) url.searchParams.set('before', beforeSignature);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Helius API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Pull ALL swap history for a wallet (paginated).
 * Returns normalized trade records.
 */
export async function fetchAllSwaps(walletAddress, maxPages = 20) {
  const allTrades = [];
  let beforeSig = null;

  for (let page = 0; page < maxPages; page++) {
    const txns = await fetchWalletSwaps(walletAddress, beforeSig);
    if (!txns || txns.length === 0) break;

    for (const tx of txns) {
      const parsed = parseSwapTransaction(tx, walletAddress);
      if (parsed) allTrades.push(parsed);
    }

    beforeSig = txns[txns.length - 1].signature;

    // Rate limiting — Helius free tier
    await new Promise(r => setTimeout(r, 100));
  }

  return allTrades;
}

/**
 * Parse a Helius enriched transaction into a normalized trade record.
 */
function parseSwapTransaction(tx, walletAddress) {
  try {
    const { signature, timestamp, events, source, fee } = tx;

    // Helius SWAP events have a "swap" field in events
    const swap = events?.swap;
    if (!swap) return null;

    const tokenInputs = swap.tokenInputs || [];
    const tokenOutputs = swap.tokenOutputs || [];
    const nativeInput = swap.nativeInput;
    const nativeOutput = swap.nativeOutput;

    // Determine if this is a buy or sell
    // Buy: SOL in → Token out
    // Sell: Token in → SOL out
    let side, tokenAddress, tokenSymbol, tokenName, tokenAmount, solAmount, pricePerToken;

    if (nativeInput && tokenOutputs.length > 0) {
      // Bought token with SOL
      side = 'buy';
      const tokenOut = tokenOutputs[0];
      tokenAddress = tokenOut.mint;
      tokenSymbol = tokenOut.tokenStandard || '';
      tokenAmount = tokenOut.rawTokenAmount?.tokenAmount
        ? Number(tokenOut.rawTokenAmount.tokenAmount) / Math.pow(10, tokenOut.rawTokenAmount.decimals || 0)
        : 0;
      solAmount = nativeInput.amount / 1e9;
      pricePerToken = tokenAmount > 0 ? solAmount / tokenAmount : 0;
    } else if (tokenInputs.length > 0 && nativeOutput) {
      // Sold token for SOL
      side = 'sell';
      const tokenIn = tokenInputs[0];
      tokenAddress = tokenIn.mint;
      tokenSymbol = tokenIn.tokenStandard || '';
      tokenAmount = tokenIn.rawTokenAmount?.tokenAmount
        ? Number(tokenIn.rawTokenAmount.tokenAmount) / Math.pow(10, tokenIn.rawTokenAmount.decimals || 0)
        : 0;
      solAmount = nativeOutput.amount / 1e9;
      pricePerToken = tokenAmount > 0 ? solAmount / tokenAmount : 0;
    } else if (tokenInputs.length > 0 && tokenOutputs.length > 0) {
      // Token-to-token swap — treat relative to SOL value
      // We'll mark the output as a buy for now
      side = 'buy';
      const tokenOut = tokenOutputs[0];
      tokenAddress = tokenOut.mint;
      tokenAmount = tokenOut.rawTokenAmount?.tokenAmount
        ? Number(tokenOut.rawTokenAmount.tokenAmount) / Math.pow(10, tokenOut.rawTokenAmount.decimals || 0)
        : 0;
      // Estimate SOL value from fee context (rough)
      solAmount = 0;
      pricePerToken = 0;
    } else {
      return null;
    }

    // Skip if it's just SOL wrapping/unwrapping
    if (tokenAddress === SOL_MINT) return null;

    return {
      tx_signature: signature,
      block_time: new Date(timestamp * 1000),
      wallet_address: walletAddress,
      token_address: tokenAddress,
      token_symbol: tokenSymbol,
      token_name: tokenName || '',
      side,
      token_amount: tokenAmount,
      sol_amount: solAmount,
      price_per_token: pricePerToken,
      fee_sol: (fee || 0) / 1e9,
      source: source || 'unknown',
      raw_data: tx,
    };
  } catch (err) {
    console.error('Failed to parse swap tx:', err.message);
    return null;
  }
}

/**
 * Fetch token metadata from Helius DAS API
 */
export async function fetchTokenMetadata(mintAddress) {
  const url = `${HELIUS_BASE}/v0/token-metadata?api-key=${HELIUS_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mintAccounts: [mintAddress],
      includeOffChain: true,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] || null;
}

/**
 * Fetch current token price from Jupiter Price API (free, no key needed)
 */
export async function fetchTokenPrice(mintAddress) {
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${mintAddress}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[mintAddress]?.price || null;
  } catch {
    return null;
  }
}
