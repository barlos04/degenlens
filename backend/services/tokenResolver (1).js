import pool from '../db/pool.js';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

export async function resolveAllTokenNames(userId) {
  const result = await pool.query(
    `SELECT DISTINCT token_address FROM raw_transactions 
     WHERE user_id = $1 AND (token_symbol IS NULL OR token_symbol = '' OR token_symbol = 'Fungible')`,
    [userId]
  );

  const mints = result.rows.map(r => r.token_address);
  console.log(`Resolving names for ${mints.length} tokens...`);

  for (const mint of mints) {
    try {
      const meta = await fetchHeliusDAS(mint);
      if (meta && meta.symbol) {
        await pool.query(
          `UPDATE raw_transactions SET token_symbol = $1, token_name = $2 
           WHERE user_id = $3 AND token_address = $4`,
          [meta.symbol, meta.name || '', userId, mint]
        );
        await pool.query(
          `UPDATE trade_pairs SET token_symbol = $1, token_name = $2 
           WHERE user_id = $3 AND token_address = $4`,
          [meta.symbol, meta.name || '', userId, mint]
        );
        await pool.query(
          `INSERT INTO token_metadata (token_address, symbol, name, decimals, logo_url, updated_at)
           VALUES ($1, $2, $3, 0, $4, NOW())
           ON CONFLICT (token_address) DO UPDATE SET symbol = $2, name = $3, logo_url = $4, updated_at = NOW()`,
          [mint, meta.symbol, meta.name || '', meta.image || null]
        );
        console.log(`  ${mint.slice(0, 8)}... => ${meta.symbol}`);
      }
    } catch (err) {
      console.log(`  Failed: ${mint.slice(0, 8)}... ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Token name resolution complete');
}

async function fetchHeliusDAS(mint) {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAsset',
      params: { id: mint },
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const metadata = data.result?.content?.metadata;
  const image = data.result?.content?.links?.image || data.result?.content?.json_uri;

  if (!metadata) return null;
  return {
    name: metadata.name || null,
    symbol: metadata.symbol || null,
    image: image || null,
  };
}
