import pool from '../db/pool.js';

/**
 * Store raw transactions and run FIFO trade matching.
 */
export async function processAndStoreTrades(userId, trades) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert raw transactions (skip duplicates)
    const insertedIds = [];
    for (const t of trades) {
      const result = await client.query(
        `INSERT INTO raw_transactions 
          (user_id, wallet_address, tx_signature, block_time, token_address, 
           token_symbol, token_name, side, token_amount, sol_amount, 
           price_per_token, fee_sol, source, raw_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (tx_signature) DO NOTHING
         RETURNING id`,
        [
          userId, t.wallet_address, t.tx_signature, t.block_time,
          t.token_address, t.token_symbol, t.token_name, t.side,
          t.token_amount, t.sol_amount, t.price_per_token,
          t.fee_sol, t.source, JSON.stringify(t.raw_data),
        ]
      );
      if (result.rows[0]) insertedIds.push(result.rows[0].id);
    }

    // 2. Run FIFO matching for this user's wallet
    if (insertedIds.length > 0) {
      const wallets = [...new Set(trades.map(t => t.wallet_address))];
      for (const wallet of wallets) {
        await matchTradesFIFO(client, userId, wallet);
      }
    }

    await client.query('COMMIT');
    return { inserted: insertedIds.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * FIFO trade matching:
 * For each token, match buys to sells in chronological order.
 * Handles partial fills — a buy can be split across multiple sells.
 */
async function matchTradesFIFO(client, userId, walletAddress) {
  // Delete existing pairs for re-matching
  await client.query(
    'DELETE FROM trade_pairs WHERE user_id = $1 AND wallet_address = $2',
    [userId, walletAddress]
  );

  // Get all unique tokens traded
  const tokensResult = await client.query(
    `SELECT DISTINCT token_address FROM raw_transactions 
     WHERE user_id = $1 AND wallet_address = $2`,
    [userId, walletAddress]
  );

  for (const { token_address } of tokensResult.rows) {
    // Get all buys and sells for this token, ordered by time
    const buysResult = await client.query(
      `SELECT id, block_time, token_amount, sol_amount, price_per_token, token_symbol, token_name
       FROM raw_transactions 
       WHERE user_id = $1 AND wallet_address = $2 AND token_address = $3 AND side = 'buy'
       ORDER BY block_time ASC`,
      [userId, walletAddress, token_address]
    );

    const sellsResult = await client.query(
      `SELECT id, block_time, token_amount, sol_amount, price_per_token
       FROM raw_transactions 
       WHERE user_id = $1 AND wallet_address = $2 AND token_address = $3 AND side = 'sell'
       ORDER BY block_time ASC`,
      [userId, walletAddress, token_address]
    );

    const buys = buysResult.rows.map(b => ({ ...b, remaining: Number(b.token_amount) }));
    const sells = sellsResult.rows.map(s => ({ ...s, remaining: Number(s.token_amount) }));

    let sellIdx = 0;

    for (const buy of buys) {
      if (buy.remaining <= 0) continue;

      // Try to match with sells
      while (sellIdx < sells.length && buy.remaining > 0) {
        const sell = sells[sellIdx];
        if (sell.remaining <= 0) { sellIdx++; continue; }

        // Only match sells that happened after this buy
        if (new Date(sell.block_time) < new Date(buy.block_time)) {
          sellIdx++;
          continue;
        }

        const matchedAmount = Math.min(buy.remaining, sell.remaining);
        const buyProportion = matchedAmount / Number(buy.token_amount);
        const sellProportion = matchedAmount / Number(sell.token_amount);
        const buySol = Number(buy.sol_amount) * buyProportion;
        const sellSol = Number(sell.sol_amount) * sellProportion;
        const pnlSol = sellSol - buySol;
        const pnlPercent = buySol > 0 ? (pnlSol / buySol) * 100 : 0;
        const holdSeconds = Math.floor(
          (new Date(sell.block_time) - new Date(buy.block_time)) / 1000
        );

        await client.query(
          `INSERT INTO trade_pairs 
            (user_id, wallet_address, token_address, token_symbol, token_name,
             buy_tx_id, sell_tx_id, buy_time, sell_time, buy_price, sell_price,
             buy_amount, sell_amount, buy_sol, sell_sol, pnl_sol, pnl_percent,
             hold_duration_seconds, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'closed')`,
          [
            userId, walletAddress, token_address,
            buy.token_symbol, buy.token_name,
            buy.id, sell.id, buy.block_time, sell.block_time,
            buy.price_per_token, sell.price_per_token,
            matchedAmount, matchedAmount, buySol, sellSol,
            pnlSol, pnlPercent, holdSeconds,
          ]
        );

        buy.remaining -= matchedAmount;
        sell.remaining -= matchedAmount;

        if (sell.remaining <= 0) sellIdx++;
      }

      // If buy has remaining tokens, it's an open position
      if (buy.remaining > 0) {
        const buyProportion = buy.remaining / Number(buy.token_amount);
        const buySol = Number(buy.sol_amount) * buyProportion;

        await client.query(
          `INSERT INTO trade_pairs
            (user_id, wallet_address, token_address, token_symbol, token_name,
             buy_tx_id, buy_time, buy_price, buy_amount, buy_sol, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open')`,
          [
            userId, walletAddress, token_address,
            buy.token_symbol, buy.token_name,
            buy.id, buy.block_time, buy.price_per_token,
            buy.remaining, buySol,
          ]
        );
      }
    }
  }
}
