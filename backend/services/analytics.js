import pool from '../db/pool.js';

/**
 * Core dashboard stats for a user
 */
export async function getDashboardStats(userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'closed') AS total_closed,
      COUNT(*) FILTER (WHERE status = 'open') AS total_open,
      COUNT(*) FILTER (WHERE pnl_sol > 0) AS wins,
      COUNT(*) FILTER (WHERE pnl_sol <= 0 AND status = 'closed') AS losses,
      COALESCE(SUM(pnl_sol) FILTER (WHERE status = 'closed'), 0) AS total_pnl_sol,
      COALESCE(AVG(pnl_percent) FILTER (WHERE status = 'closed'), 0) AS avg_pnl_percent,
      COALESCE(AVG(hold_duration_seconds) FILTER (WHERE status = 'closed'), 0) AS avg_hold_seconds,
      COALESCE(AVG(hold_duration_seconds) FILTER (WHERE pnl_sol > 0), 0) AS avg_hold_winners,
      COALESCE(AVG(hold_duration_seconds) FILTER (WHERE pnl_sol <= 0 AND status = 'closed'), 0) AS avg_hold_losers,
      COALESCE(AVG(pnl_percent) FILTER (WHERE pnl_sol > 0), 0) AS avg_win_percent,
      COALESCE(AVG(pnl_percent) FILTER (WHERE pnl_sol <= 0 AND status = 'closed'), 0) AS avg_loss_percent,
      COALESCE(MAX(pnl_sol), 0) AS best_trade_sol,
      COALESCE(MIN(pnl_sol) FILTER (WHERE status = 'closed'), 0) AS worst_trade_sol,
      COALESCE(AVG(buy_sol), 0) AS avg_position_size_sol,
      COALESCE(SUM(buy_sol) FILTER (WHERE status = 'open'), 0) AS open_exposure_sol
    FROM trade_pairs
    WHERE user_id = $1 AND buy_time >= $2
  `, [userId, since]);

  const row = result.rows[0];
  const totalClosed = Number(row.total_closed);
  const wins = Number(row.wins);

  return {
    totalTrades: totalClosed + Number(row.total_open),
    closedTrades: totalClosed,
    openPositions: Number(row.total_open),
    wins,
    losses: Number(row.losses),
    winRate: totalClosed > 0 ? ((wins / totalClosed) * 100).toFixed(1) : 0,
    totalPnlSol: Number(row.total_pnl_sol).toFixed(4),
    avgPnlPercent: Number(row.avg_pnl_percent).toFixed(1),
    avgHoldSeconds: Math.round(Number(row.avg_hold_seconds)),
    avgHoldWinners: Math.round(Number(row.avg_hold_winners)),
    avgHoldLosers: Math.round(Number(row.avg_hold_losers)),
    avgWinPercent: Number(row.avg_win_percent).toFixed(1),
    avgLossPercent: Number(row.avg_loss_percent).toFixed(1),
    bestTradeSol: Number(row.best_trade_sol).toFixed(4),
    worstTradeSol: Number(row.worst_trade_sol).toFixed(4),
    avgPositionSizeSol: Number(row.avg_position_size_sol).toFixed(4),
    openExposureSol: Number(row.open_exposure_sol).toFixed(4),
  };
}

/**
 * PnL over time — daily aggregated
 */
export async function getPnlTimeline(userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const result = await pool.query(`
    SELECT 
      DATE(sell_time) AS date,
      SUM(pnl_sol) AS daily_pnl,
      COUNT(*) AS trade_count,
      COUNT(*) FILTER (WHERE pnl_sol > 0) AS wins,
      COUNT(*) FILTER (WHERE pnl_sol <= 0) AS losses
    FROM trade_pairs
    WHERE user_id = $1 AND status = 'closed' AND sell_time >= $2
    GROUP BY DATE(sell_time)
    ORDER BY date ASC
  `, [userId, since]);

  // Calculate cumulative PnL
  let cumulative = 0;
  return result.rows.map(r => {
    cumulative += Number(r.daily_pnl);
    return {
      date: r.date,
      dailyPnl: Number(r.daily_pnl).toFixed(4),
      cumulativePnl: cumulative.toFixed(4),
      tradeCount: Number(r.trade_count),
      wins: Number(r.wins),
      losses: Number(r.losses),
    };
  });
}

/**
 * Hourly performance — what time of day does the user trade best?
 */
export async function getHourlyPerformance(userId) {
  const result = await pool.query(`
    SELECT 
      EXTRACT(HOUR FROM buy_time) AS hour,
      COUNT(*) AS trades,
      COUNT(*) FILTER (WHERE pnl_sol > 0) AS wins,
      COALESCE(SUM(pnl_sol), 0) AS total_pnl,
      COALESCE(AVG(pnl_percent), 0) AS avg_pnl_percent
    FROM trade_pairs
    WHERE user_id = $1 AND status = 'closed'
    GROUP BY EXTRACT(HOUR FROM buy_time)
    ORDER BY hour
  `, [userId]);

  return result.rows.map(r => ({
    hour: Number(r.hour),
    trades: Number(r.trades),
    wins: Number(r.wins),
    winRate: Number(r.trades) > 0 ? ((Number(r.wins) / Number(r.trades)) * 100).toFixed(1) : 0,
    totalPnl: Number(r.total_pnl).toFixed(4),
    avgPnlPercent: Number(r.avg_pnl_percent).toFixed(1),
  }));
}

/**
 * Position sizing analysis — do bigger bets perform differently?
 */
export async function getPositionSizingAnalysis(userId) {
  // Get avg position size first
  const avgResult = await pool.query(
    `SELECT AVG(buy_sol) AS avg_size FROM trade_pairs WHERE user_id = $1 AND status = 'closed'`,
    [userId]
  );
  const avgSize = Number(avgResult.rows[0]?.avg_size || 0);
  if (avgSize === 0) return { avgSize: 0, belowAvg: {}, aboveAvg: {}, oversized: {} };

  const bucketQuery = async (minMultiple, maxMultiple) => {
    const minSol = avgSize * minMultiple;
    const maxSol = maxMultiple ? avgSize * maxMultiple : 999999;
    const r = await pool.query(`
      SELECT COUNT(*) AS trades,
        COUNT(*) FILTER (WHERE pnl_sol > 0) AS wins,
        COALESCE(AVG(pnl_percent), 0) AS avg_return,
        COALESCE(SUM(pnl_sol), 0) AS total_pnl
      FROM trade_pairs
      WHERE user_id = $1 AND status = 'closed' AND buy_sol >= $2 AND buy_sol < $3
    `, [userId, minSol, maxSol]);
    const row = r.rows[0];
    return {
      trades: Number(row.trades),
      winRate: Number(row.trades) > 0 ? ((Number(row.wins) / Number(row.trades)) * 100).toFixed(1) : 0,
      avgReturn: Number(row.avg_return).toFixed(1),
      totalPnl: Number(row.total_pnl).toFixed(4),
    };
  };

  return {
    avgPositionSol: avgSize.toFixed(4),
    belowAvg: await bucketQuery(0, 0.75),
    average: await bucketQuery(0.75, 1.5),
    aboveAvg: await bucketQuery(1.5, 2.5),
    oversized: await bucketQuery(2.5, null),
  };
}

/**
 * Hold time distribution — bucketed
 */
export async function getHoldTimeDistribution(userId) {
  const buckets = [
    { label: '< 1 min', min: 0, max: 60 },
    { label: '1-5 min', min: 60, max: 300 },
    { label: '5-30 min', min: 300, max: 1800 },
    { label: '30m-2h', min: 1800, max: 7200 },
    { label: '2-8h', min: 7200, max: 28800 },
    { label: '8-24h', min: 28800, max: 86400 },
    { label: '1-7d', min: 86400, max: 604800 },
    { label: '7d+', min: 604800, max: 999999999 },
  ];

  const results = [];
  for (const bucket of buckets) {
    const r = await pool.query(`
      SELECT COUNT(*) AS trades,
        COUNT(*) FILTER (WHERE pnl_sol > 0) AS wins,
        COALESCE(AVG(pnl_percent), 0) AS avg_return
      FROM trade_pairs
      WHERE user_id = $1 AND status = 'closed'
        AND hold_duration_seconds >= $2 AND hold_duration_seconds < $3
    `, [userId, bucket.min, bucket.max]);
    const row = r.rows[0];
    results.push({
      label: bucket.label,
      trades: Number(row.trades),
      winRate: Number(row.trades) > 0 ? ((Number(row.wins) / Number(row.trades)) * 100).toFixed(1) : 0,
      avgReturn: Number(row.avg_return).toFixed(1),
    });
  }

  return results;
}

/**
 * Top tokens traded — by volume and PnL
 */
export async function getTokenBreakdown(userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const result = await pool.query(`
    SELECT 
      token_address,
      token_symbol,
      token_name,
      COUNT(*) AS trade_count,
      COUNT(*) FILTER (WHERE pnl_sol > 0) AS wins,
      COALESCE(SUM(pnl_sol), 0) AS total_pnl,
      COALESCE(SUM(buy_sol), 0) AS total_volume
    FROM trade_pairs
    WHERE user_id = $1 AND status = 'closed' AND buy_time >= $2
    GROUP BY token_address, token_symbol, token_name
    ORDER BY ABS(SUM(pnl_sol)) DESC
    LIMIT 20
  `, [userId, since]);

  return result.rows.map(r => ({
    tokenAddress: r.token_address,
    symbol: r.token_symbol || r.token_address.slice(0, 8),
    name: r.token_name || '',
    trades: Number(r.trade_count),
    wins: Number(r.wins),
    winRate: Number(r.trade_count) > 0 ? ((Number(r.wins) / Number(r.trade_count)) * 100).toFixed(1) : 0,
    totalPnl: Number(r.total_pnl).toFixed(4),
    totalVolume: Number(r.total_volume).toFixed(4),
  }));
}

/**
 * Recent trades list with details
 */
export async function getRecentTrades(userId, limit = 50, offset = 0) {
  const result = await pool.query(`
    SELECT * FROM trade_pairs
    WHERE user_id = $1
    ORDER BY buy_time DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);

  return result.rows.map(r => ({
    id: r.id,
    tokenAddress: r.token_address,
    symbol: r.token_symbol || r.token_address?.slice(0, 8),
    name: r.token_name || '',
    side: r.status === 'open' ? 'HOLD' : 'CLOSED',
    buyTime: r.buy_time,
    sellTime: r.sell_time,
    buyPrice: r.buy_price,
    sellPrice: r.sell_price,
    buySol: Number(r.buy_sol).toFixed(4),
    sellSol: r.sell_sol ? Number(r.sell_sol).toFixed(4) : null,
    pnlSol: r.pnl_sol ? Number(r.pnl_sol).toFixed(4) : null,
    pnlPercent: r.pnl_percent ? Number(r.pnl_percent).toFixed(1) : null,
    holdDuration: r.hold_duration_seconds,
    status: r.status,
  }));
}

/**
 * Compile full analytics snapshot for AI report generation
 */
export async function getFullAnalyticsSnapshot(userId, days = 7) {
  const [stats, pnlTimeline, hourly, sizing, holdTime, tokens] = await Promise.all([
    getDashboardStats(userId, days),
    getPnlTimeline(userId, days),
    getHourlyPerformance(userId),
    getPositionSizingAnalysis(userId),
    getHoldTimeDistribution(userId),
    getTokenBreakdown(userId, days),
  ]);

  return { stats, pnlTimeline, hourly, sizing, holdTime, tokens, periodDays: days };
}
