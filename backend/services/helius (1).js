const HELIUS_BASE = 'https://api.helius.xyz';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function fetchWalletSwaps(walletAddress, beforeSignature = null, limit = 100) {
  const url = new URL(`${HELIUS_BASE}/v0/addresses/${walletAddress}/transactions`);
  url.searchParams.set('api-key', HELIUS_API_KEY);
  if (limit) url.searchParams.set('limit', limit);
  if (beforeSignature) url.searchParams.set('before', beforeSignature);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Helius API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function fetchAllSwaps(walletAddress, maxPages = 50) {
  const allTrades = [];
  let beforeSig = null;

  for (let page = 0; page < maxPages; page++) {
    const txns = await fetchWalletSwaps(walletAddress, beforeSig);
    if (!txns || txns.length === 0) break;

    for (const tx of txns) {
      const parsed = parseTransaction(tx, walletAddress);
      if (parsed) allTrades.push(parsed);
    }

    beforeSig = txns[txns.length - 1].signature;
    await new Promise(r => setTimeout(r, 150));
    console.log(`Page ${page + 1}: found ${allTrades.length} swaps so far`);
  }

  return allTrades;
}

/**
 * Main parser — detects swaps from any source (Jupiter, Pump.fun, Raydium, Photon, etc.)
 * Uses accountData.nativeBalanceChange + tokenTransfers to detect buys/sells.
 */
function parseTransaction(tx, walletAddress) {
  try {
    const { signature, timestamp, tokenTransfers, accountData, fee, source, events } = tx;

    // Method 1: Standard SWAP event (Jupiter, Raydium classic)
    if (events?.swap) {
      const result = parseSwapEvent(events.swap, signature, timestamp, walletAddress, source, fee);
      if (result) return result;
    }

    // Method 2: Use accountData + tokenTransfers (catches Pump.fun, Photon, etc.)
    if (tokenTransfers && tokenTransfers.length > 0 && accountData) {
      const result = parseFromAccountData(tx, walletAddress);
      if (result) return result;
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Parse using accountData.nativeBalanceChange — the most reliable method.
 * The user's accountData entry shows net SOL change (positive = received, negative = spent).
 * Combined with token transfers, we can detect any buy/sell.
 */
function parseFromAccountData(tx, walletAddress) {
  const { signature, timestamp, tokenTransfers, accountData, fee, source } = tx;

  // Find user's SOL balance change
  const userAccount = accountData.find(a => a.account === walletAddress);
  if (!userAccount) return null;

  const solChangeRaw = userAccount.nativeBalanceChange || 0;
  // Add back the fee to get the true trade SOL amount
  const feeAmount = fee || 0;
  const solChangeWithFee = solChangeRaw + feeAmount;
  const solChange = solChangeWithFee / 1e9;

  // Find non-SOL token transfers involving this wallet
  const tokensIn = tokenTransfers.filter(t =>
    t.toUserAccount === walletAddress && t.mint !== SOL_MINT
  );
  const tokensOut = tokenTransfers.filter(t =>
    t.fromUserAccount === walletAddress && t.mint !== SOL_MINT
  );

  // BUY: SOL decreased (solChange negative) + token came in
  if (tokensIn.length > 0 && solChange < -0.0005) {
    const token = tokensIn[0];
    const tokenAmount = Number(token.tokenAmount) || 0;
    if (tokenAmount === 0) return null;
    const solSpent = Math.abs(solChange);

    return {
      tx_signature: signature,
      block_time: new Date(timestamp * 1000),
      wallet_address: walletAddress,
      token_address: token.mint,
      token_symbol: token.tokenStandard || '',
      token_name: '',
      side: 'buy',
      token_amount: tokenAmount,
      sol_amount: solSpent,
      price_per_token: solSpent / tokenAmount,
      fee_sol: feeAmount / 1e9,
      source: source || 'unknown',
      raw_data: tx,
    };
  }

  // SELL: SOL increased (solChange positive) + token went out
  if (tokensOut.length > 0 && solChange > 0.0005) {
    const token = tokensOut[0];
    const tokenAmount = Number(token.tokenAmount) || 0;
    if (tokenAmount === 0) return null;
    const solReceived = solChange;

    return {
      tx_signature: signature,
      block_time: new Date(timestamp * 1000),
      wallet_address: walletAddress,
      token_address: token.mint,
      token_symbol: token.tokenStandard || '',
      token_name: '',
      side: 'sell',
      token_amount: tokenAmount,
      sol_amount: solReceived,
      price_per_token: solReceived / tokenAmount,
      fee_sol: feeAmount / 1e9,
      source: source || 'unknown',
      raw_data: tx,
    };
  }

  return null;
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

export async function fetchTokenMetadata(mintAddress) {
  const url = `${HELIUS_BASE}/v0/token-metadata?api-key=${HELIUS_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mintAccounts: [mintAddress], includeOffChain: true }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] || null;
}

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
