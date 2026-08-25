import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

function formatSol(val) {
  const n = Number(val);
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export default function Dashboard({ wallet }) {
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [wallet, days]);

  async function load() {
    setLoading(true);
    try {
      const [s, t, tk] = await Promise.all([
        api.getDashboard(wallet, days),
        api.getPnlTimeline(wallet, days),
        api.getTokenBreakdown(wallet, days),
      ]);
      setStats(s);
      setTimeline(t);
      setTokens(tk);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  if (loading) {
    return <div className="loading"><div className="spinner" />Loading dashboard...</div>;
  }

  if (!stats) {
    return <div className="loading">No trade data found. Try syncing your wallet.</div>;
  }

  const pnlClass = Number(stats.totalPnlSol) >= 0 ? 'positive' : 'negative';

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8 }}>
        <div className="period-selector">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              className={`period-btn ${days === d ? 'active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total PnL</div>
          <div className={`value ${pnlClass}`}>{formatSol(stats.totalPnlSol)} SOL</div>
        </div>
        <div className="stat-card">
          <div className="label">Win Rate</div>
          <div className="value neutral">{stats.winRate}%</div>
          <div className="sub">{stats.wins}W / {stats.losses}L</div>
        </div>
        <div className="stat-card">
          <div className="label">Trades</div>
          <div className="value neutral">{stats.closedTrades}</div>
          <div className="sub">{stats.openPositions} open</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg Win</div>
          <div className="value positive">+{stats.avgWinPercent}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg Loss</div>
          <div className="value negative">{stats.avgLossPercent}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg Hold</div>
          <div className="value neutral">{formatDuration(stats.avgHoldSeconds)}</div>
          <div className="sub">
            W: {formatDuration(stats.avgHoldWinners)} / L: {formatDuration(stats.avgHoldLosers)}
          </div>
        </div>
      </div>

      {/* PnL Chart */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Cumulative PnL</div>
        </div>
        {timeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f2233" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#5c6078', fontSize: 11 }}
                tickFormatter={(d) => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                tick={{ fill: '#5c6078', fontSize: 11 }}
                tickFormatter={(v) => `${v} SOL`}
              />
              <Tooltip
                contentStyle={{ background: '#1a1d28', border: '1px solid #2a2d3a', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#8b8fa3' }}
                formatter={(val) => [`${Number(val).toFixed(4)} SOL`, 'Cumulative PnL']}
                labelFormatter={(d) => new Date(d).toLocaleDateString()}
              />
              <Area
                type="monotone"
                dataKey="cumulativePnl"
                stroke="#a78bfa"
                strokeWidth={2}
                fill="url(#pnlGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="loading">No closed trades in this period</div>
        )}
      </div>

      {/* Top tokens */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Token Breakdown</div>
        </div>
        {tokens.length > 0 ? (
          <table className="trade-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Trades</th>
                <th>Win Rate</th>
                <th>PnL (SOL)</th>
                <th>Volume (SOL)</th>
              </tr>
            </thead>
            <tbody>
              {tokens.slice(0, 10).map((t) => (
                <tr key={t.tokenAddress}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {t.symbol}
                  </td>
                  <td>{t.trades}</td>
                  <td>{t.winRate}%</td>
                  <td className={Number(t.totalPnl) >= 0 ? 'positive' : 'negative'}>
                    {formatSol(t.totalPnl)}
                  </td>
                  <td>{Number(t.totalVolume).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="loading">No token data</div>
        )}
      </div>
    </div>
  );
}
