const HELIUS_BASE = 'https://api.helius.xyz';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Fetch parsed transaction history for a wallet.
 * Pulls ALL types now (not just SWAP) to catch Pump.fun, Raydium, etc.
 */
export async function fetchWalletSwaps(walletAddress, beforeSignature = null, limit = 100) {
  const url = new URL(`${HELIUS_BASE}/v0/addresses/${walletAddress}/transactions`);
  url.searchParams.set('api-key', HELIUS_API_KEY);
  // Removed type=SWAP filter — we'll detect swaps ourselves
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
 */
export async function fetchAllSwaps(walletAddress, maxPages = 50) {
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
    await new Promise(r => setTimeout(r, 150));
    
    console.log(`Page ${page + 1}: found ${allTrades.length} swaps so far`);
  }

  return allTrades;
}

/**
 * Parse a Helius enriched transaction into a normalized trade record.
 * Now handles: SWAP events, token transfers (Pump.fun buys/sells), and more.
 */
function parseSwapTransaction(tx, walletAddress) {
  try {
    const { signature, timestamp, events, source, fee, type, tokenTransfers, nativeTransfers } = tx;

    // Method 1: Standard SWAP event
    if (events?.swap) {
      const result = parseSwapEvent(events.swap, signature, timestamp, walletAddress, source, fee);
      if (result) return result;
    }

    // Method 2: Token transfers — catches Pump.fun, direct DEX interactions
    if (tokenTransfers && tokenTransfers.length > 0) {
      const result = parseFromTokenTransfers(tx, walletAddress);
      if (result) return result;
    }

    return null;
  } catch (err) {
    return null;
  }
}

function parseSwapEvent(swap, signature, timestamp, walletAddress, source, fee) {
  const tokenInputs = swap.tokenInputs || [];
  const tokenOutputs = swap.tokenOutputs || [];
  const nativeInput = swap.nativeInput;
  const nativeOutput = swap.nativeOutput;

  let side, tokenAddress, tokenSymbol, tokenAmount, solAmount, pricePerToken;

  if (nativeInput && tokenOutputs.length > 0) {
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
    side = 'buy';
    const tokenOut = tokenOutputs[0];
    tokenAddress = tokenOut.mint;
    tokenAmount = tokenOut.rawTokenAmount?.tokenAmount
      ? Number(tokenOut.rawTokenAmount.tokenAmount) / Math.pow(10, tokenOut.rawTokenAmount.decimals || 0)
      : 0;
    solAmount = 0;
    pricePerToken = 0;
  } else {
    return null;
  }

  if (tokenAddress === SOL_MINT) return null;

  return {
    tx_signature: signature,
    block_time: new Date(timestamp * 1000),
    wallet_address: walletAddress,
    token_address: tokenAddress,
    token_symbol: tokenSymbol,
    token_name: '',
    side,
    token_amount: tokenAmount,
    sol_amount: solAmount,
    price_per_token: pricePerToken,
    fee_sol: (fee || 0) / 1e9,
    source: source || 'unknown',
    raw_data: tx,
  };
}

/**
 * Parse swaps from token transfer patterns.
 * Catches Pump.fun and other platforms where:
 *   BUY = SOL leaves wallet + token enters wallet
 *   SELL = token leaves wallet + SOL enters wallet
 */
function parseFromTokenTransfers(tx, walletAddress) {
  const { signature, timestamp, tokenTransfers, nativeTransfers, fee, source } = tx;
  
  if (!tokenTransfers || tokenTransfers.length === 0) return null;

  // Find token transfers TO and FROM this wallet (excluding SOL)
  const tokensIn = tokenTransfers.filter(t => 
    t.toUserAccount === walletAddress && t.mint !== SOL_MINT
  );
  const tokensOut = tokenTransfers.filter(t => 
    t.fromUserAccount === walletAddress && t.mint !== SOL_MINT
  );

  // Find SOL movement
  let solIn = 0;
  let solOut = 0;
  if (nativeTransfers) {
    solIn = nativeTransfers
      .filter(t => t.toUserAccount === walletAddress)
      .reduce((sum, t) => sum + (t.amount || 0), 0) / 1e9;
    solOut = nativeTransfers
      .filter(t => t.fromUserAccount === walletAddress)
      .reduce((sum, t) => sum + (t.amount || 0), 0) / 1e9;
  }

  // BUY: token comes in, SOL goes out
  if (tokensIn.length > 0 && solOut > 0.001) {
    const token = tokensIn[0];
    const tokenAmount = Number(token.tokenAmount) || 0;
    const solAmount = solOut;
    if (tokenAmount === 0) return null;

    return {
      tx_signature: signature,
      block_time: new Date(timestamp * 1000),
      wallet_address: walletAddress,
      token_address: token.mint,
      token_symbol: token.tokenStandard || '',
      token_name: '',
      side: 'buy',
      token_amount: tokenAmount,
      sol_amount: solAmount,
      price_per_token: solAmount / tokenAmount,
      fee_sol: (fee || 0) / 1e9,
      source: source || 'unknown',
      raw_data: tx,
    };
  }

  // SELL: token goes out, SOL comes in
  if (tokensOut.length > 0 && solIn > 0.001) {
    const token = tokensOut[0];
    const tokenAmount = Number(token.tokenAmount) || 0;
    const solAmount = solIn;
    if (tokenAmount === 0) return null;

    return {
      tx_signature: signature,
      block_time: new Date(timestamp * 1000),
      wallet_address: walletAddress,
      token_address: token.mint,
      token_symbol: token.tokenStandard || '',
      token_name: '',
      side: 'sell',
      token_amount: tokenAmount,
      sol_amount: solAmount,
      price_per_token: solAmount / tokenAmount,
      fee_sol: (fee || 0) / 1e9,
      source: source || 'unknown',
      raw_data: tx,
    };
  }

  return null;
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
 * Fetch current token price from Jupiter Price API
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
