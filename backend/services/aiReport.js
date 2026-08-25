import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/pool.js';
import { getFullAnalyticsSnapshot } from './analytics.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

/**
 * Generate a weekly AI trading report for a user
 */
export async function generateWeeklyReport(userId) {
  const snapshot = await getFullAnalyticsSnapshot(userId, 7);

  // Also get last week's stats for comparison
  const prevSnapshot = await getFullAnalyticsSnapshot(userId, 14);

  const prompt = `You are DegenLens, an AI memecoin trading coach. Analyze this trader's data from the past 7 days and generate a brutally honest but constructive weekly report.

## THIS WEEK'S DATA:
${JSON.stringify(snapshot, null, 2)}

## COMPARISON (past 14 days total, for trend context):
Total PnL (14d): ${prevSnapshot.stats.totalPnlSol} SOL
Win Rate (14d): ${prevSnapshot.stats.winRate}%

## INSTRUCTIONS:
Write a 300-500 word personalized trading report in a direct, no-BS tone. Structure it as:

1. **TLDR** — One sentence summary of the week. Be specific with numbers.

2. **The Good** — What went well. Call out specific winning patterns (best trading hours, good position sizing, tokens that worked).

3. **The Problem** — The #1 thing costing them money. Pick ONE behavioral pattern from the data (late entries, holding losers too long, oversizing, tilt trading at bad hours, chasing a losing token category) and explain it with specific numbers. Show the exact cost in SOL.

4. **The Fix** — One specific, actionable rule they should follow next week. Frame it as "If you had done X this week, you would have saved/made Y SOL." Use their actual data to calculate this.

5. **Watchlist** — Any notable patterns: tokens they should stop trading, hours they should avoid, wallets they should unfollow if copy-trade data exists.

Rules:
- Use actual numbers from the data, never generalize
- Be direct — if they're losing money, say it clearly
- Hold time comparison between winners and losers is usually revealing — comment on it
- If win rate is below 40%, focus on entry quality
- If avg loss is much larger than avg win, focus on exit discipline
- Format for easy mobile reading — short paragraphs, bold key numbers
- Use SOL values, not USD
- Don't be sycophantic — be the coach they need, not the friend they want`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }],
  });

  const reportText = response.content[0].text;

  // Store the report
  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - 7 * 86400000);

  await pool.query(
    `INSERT INTO ai_reports (user_id, report_type, period_start, period_end, report_text, stats_snapshot)
     VALUES ($1, 'weekly', $2, $3, $4, $5)`,
    [userId, periodStart, periodEnd, reportText, JSON.stringify(snapshot)]
  );

  return reportText;
}

/**
 * Get existing reports for a user
 */
export async function getReports(userId, limit = 10) {
  const result = await pool.query(
    `SELECT id, report_type, period_start, period_end, report_text, created_at
     FROM ai_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}
