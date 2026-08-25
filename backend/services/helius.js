const HELIUS_BASE = 'https://api.helius.xyz';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Known non-memecoin tokens to skip
const SKIP_TOKENS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // JitoSOL
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',  // bSOL
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
  'So11111111111111111111111111111111111111112',      // wSOL
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK (major, not memecoin trade)
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',   // JUP
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',   // JTO (Jito)
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',  // PYTH
  'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',   // RNDR
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF (established)
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
  'METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m',  // META
  'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6',  // TNSR
]);

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

function parseTransaction(tx, walletAddress) {
  try {
    const { signature, timestamp, tokenTransfers, accountData, fee, source, events, type } = tx;

    // Skip pure transfers with no swap characteristics
    // A swap involves BOTH a token move AND a SOL move in opposite directions
    // A plain transfer just moves one asset

    // Method 1: Standard SWAP event (Jupiter, Raydium classic)
    if (events?.swap) {
      const result = parseSwapEvent(events.swap, signature, timestamp, walletAddress, source, fee);
      if (result && !SKIP_TOKENS.has(result.token_address)) return result;
    }

    // Method 2: Use accountData + tokenTransfers (Pump.fun, Photon, etc.)
    if (tokenTransfers && tokenTransfers.length > 0 && accountData) {
      const result = parseFromAccountData(tx, walletAddress);
      if (result && !SKIP_TOKENS.has(result.token_address)) return result;
    }

    return null;
  } catch (err) {
    return null;
  }
}

function parseFromAccountData(tx, walletAddress) {
  const { signature, timestamp, tokenTransfers, accountData, fee, source, type } = tx;

  const userAccount = accountData.find(a => a.account === walletAddress);
  if (!userAccount) return null;

  const solChangeRaw = userAccount.nativeBalanceChange || 0;
  const feeAmount = fee || 0;
  const solChangeWithFee = solChangeRaw + feeAmount;
  const solChange = solChangeWithFee / 1e9;

  // Find non-SOL, non-stablecoin token transfers
  const tokensIn = tokenTransfers.filter(t =>
    t.toUserAccount === walletAddress && 
    t.mint !== SOL_MINT && 
    !SKIP_TOKENS.has(t.mint)
  );
  const tokensOut = tokenTransfers.filter(t =>
    t.fromUserAccount === walletAddress && 
    t.mint !== SOL_MINT && 
    !SKIP_TOKENS.has(t.mint)
  );

  // If no relevant token transfers, skip
  if (tokensIn.length === 0 && tokensOut.length === 0) return null;

  // BUY: SOL decreased + token came in
  if (tokensIn.length > 0 && solChange < -0.0005) {
    const token = tokensIn[0];
    const tokenAmount = Number(token.tokenAmount) || 0;
    if (tokenAmount === 0) return null;
    const solSpent = Math.abs(solChange);

    // Skip if SOL amount is tiny (probably just a fee, not a trade)
    if (solSpent < 0.001) return null;

    return {
      tx_signature: signature,
      block_time: new Date(timestamp * 1000),
      wallet_address: walletAddress,
      token_address: token.mint,
      token_symbol: '',
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

  // SELL: SOL increased + token went out
  if (tokensOut.length > 0 && solChange > 0.0005) {
    const token = tokensOut[0];
    const tokenAmount = Number(token.tokenAmount) || 0;
    if (tokenAmount === 0) return null;
    const solReceived = solChange;

    if (solReceived < 0.001) return null;

    return {
      tx_signature: signature,
      block_time: new Date(timestamp * 1000),
      wallet_address: walletAddress,
      token_address: token.mint,
      token_symbol: '',
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
    tokenSymbol = '';
    tokenAmount = tokenOut.rawTokenAmount?.tokenAmount
      ? Number(tokenOut.rawTokenAmount.tokenAmount) / Math.pow(10, tokenOut.rawTokenAmount.decimals || 0)
      : 0;
    solAmount = nativeInput.amount / 1e9;
    pricePerToken = tokenAmount > 0 ? solAmount / tokenAmount : 0;
  } else if (tokenInputs.length > 0 && nativeOutput) {
    side = 'sell';
    const tokenIn = tokenInputs[0];
    tokenAddress = tokenIn.mint;
    tokenSymbol = '';
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
  return null; // Deprecated, using DAS API in tokenResolver instead
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
