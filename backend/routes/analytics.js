import { Router } from 'express';
import pool from '../db/pool.js';
import {
  getDashboardStats,
  getPnlTimeline,
  getHourlyPerformance,
  getPositionSizingAnalysis,
  getHoldTimeDistribution,
  getTokenBreakdown,
  getRecentTrades,
} from '../services/analytics.js';

const router = Router();

// Middleware to resolve wallet → userId
async function resolveUser(req, res, next) {
  const wallet = req.query.wallet || req.params.wallet;
  if (!wallet) return res.status(400).json({ error: 'wallet param required' });

  const result = await pool.query('SELECT id FROM users WHERE wallet_address = $1', [wallet]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Wallet not found' });

  req.userId = result.rows[0].id;
  next();
}

router.use(resolveUser);

// Dashboard overview
router.get('/dashboard', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = await getDashboardStats(req.userId, days);
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// PnL timeline chart data
router.get('/pnl-timeline', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await getPnlTimeline(req.userId, days);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get PnL timeline' });
  }
});

// Hourly performance heatmap
router.get('/hourly', async (req, res) => {
  try {
    const data = await getHourlyPerformance(req.userId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get hourly data' });
  }
});

// Position sizing analysis
router.get('/sizing', async (req, res) => {
  try {
    const data = await getPositionSizingAnalysis(req.userId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get sizing data' });
  }
});

// Hold time distribution
router.get('/hold-times', async (req, res) => {
  try {
    const data = await getHoldTimeDistribution(req.userId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get hold time data' });
  }
});

// Token breakdown
router.get('/tokens', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await getTokenBreakdown(req.userId, days);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get token data' });
  }
});

// Recent trades list
router.get('/trades', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const data = await getRecentTrades(req.userId, limit, offset);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get trades' });
  }
});

export default router;
