import { Router } from 'express';
import pool from '../db/pool.js';
import { fetchAllSwaps } from '../services/helius.js';
import { processAndStoreTrades } from '../services/tradeParser.js';
import { resolveAllTokenNames } from '../services/tokenResolver.js';

const router = Router();

router.post('/connect', async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress || walletAddress.length < 32) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    const userResult = await pool.query(
      `INSERT INTO users (wallet_address) VALUES ($1)
       ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
       RETURNING id, wallet_address, tier, created_at`,
      [walletAddress]
    );
    const user = userResult.rows[0];
    res.json({ user, message: 'Wallet connected. Use /api/wallet/sync to pull trades.' });
  } catch (err) {
    console.error('Connect wallet error:', err);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
});

router.post('/sync', async (req, res) => {
  const { walletAddress } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE wallet_address = $1', [walletAddress]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not connected. Call /connect first.' });
    }
    const userId = userResult.rows[0].id;

    res.json({ status: 'syncing', message: 'Sync started. This may take a minute.' });

    syncWallet(userId, walletAddress).catch(err =>
      console.error('Background sync failed:', err)
    );
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

async function syncWallet(userId, walletAddress) {
  console.log(`Syncing wallet ${walletAddress}...`);
  const trades = await fetchAllSwaps(walletAddress);
  console.log(`Fetched ${trades.length} swaps for ${walletAddress}`);

  if (trades.length > 0) {
    const result = await processAndStoreTrades(userId, trades);
    console.log(`Processed ${result.inserted} new trades`);
  }

  // Resolve token names
  await resolveAllTokenNames(userId);

  await pool.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [userId]);
  console.log('Sync complete');
}

router.get('/status/:walletAddress', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.wallet_address, u.tier, u.updated_at,
        (SELECT COUNT(*) FROM raw_transactions WHERE user_id = u.id) AS total_txns,
        (SELECT COUNT(*) FROM trade_pairs WHERE user_id = u.id) AS total_pairs
       FROM users u WHERE u.wallet_address = $1`,
      [req.params.walletAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.post('/track', async (req, res) => {
  const { walletAddress, trackedWallet, label } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE wallet_address = $1', [walletAddress]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      `INSERT INTO tracked_wallets (user_id, wallet_address, label)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *`,
      [userResult.rows[0].id, trackedWallet, label || null]
    );

    res.json({ tracked: result.rows[0] || { message: 'Already tracking' } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to track wallet' });
  }
});

export default router;
