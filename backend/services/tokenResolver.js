import pool from '../db/pool.js';

/**
 * Resolve token names for all unknown tokens in the database.
 * Uses Jupiter token API for name/symbol lookup.
 */
export async function resolveAllTokenNames(userId) {
  // Get all unique token addresses missing names
  const result = await pool.query(
    `SELECT DISTINCT token_address FROM raw_transactions 
     WHERE user_id = $1 AND (token_symbol IS NULL OR token_symbol = '' OR token_symbol = 'Fungible')`,
    [userId]
  );

  const mints = result.rows.map(r => r.token_address);
  console.log(`Resolving names for ${mints.length} tokens...`);

  for (const mint of mints) {
    try {
      const meta = await fetchJupiterToken(mint);
      if (meta && meta.symbol) {
        // Update raw_transactions
        await pool.query(
          `UPDATE raw_transactions SET token_symbol = $1, token_name = $2 
           WHERE user_id = $3 AND token_address = $4`,
          [meta.symbol, meta.name || '', userId, mint]
        );
        // Update trade_pairs
        await pool.query(
          `UPDATE trade_pairs SET token_symbol = $1, token_name = $2 
           WHERE user_id = $3 AND token_address = $4`,
          [meta.symbol, meta.name || '', userId, mint]
        );
        // Upsert token_metadata
        await pool.query(
          `INSERT INTO token_metadata (token_address, symbol, name, decimals, logo_url, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (token_address) DO UPDATE SET symbol = $2, name = $3, logo_url = $5, updated_at = NOW()`,
          [mint, meta.symbol, meta.name || '', meta.decimals || 0, meta.logoURI || null]
        );
        console.log(`  ${mint.slice(0, 8)}... => ${meta.symbol}`);
      }
    } catch (err) {
      console.log(`  Failed to resolve ${mint.slice(0, 8)}...: ${err.message}`);
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Token name resolution complete');
}

async function fetchJupiterToken(mint) {
  try {
    const res = await fetch(`https://api.jup.ag/tokens/v1/${mint}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data || null;
  } catch {
    return null;
  }
}
