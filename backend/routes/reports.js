import { Router } from 'express';
import pool from '../db/pool.js';
import { generateWeeklyReport, getReports } from '../services/aiReport.js';

const router = Router();

// Generate a new weekly report
router.post('/generate', async (req, res) => {
  const { walletAddress } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE wallet_address = $1', [walletAddress]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const report = await generateWeeklyReport(userResult.rows[0].id);
    res.json({ report });
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get past reports
router.get('/:walletAddress', async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE wallet_address = $1', [req.params.walletAddress]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const reports = await getReports(userResult.rows[0].id);
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

export default router;
