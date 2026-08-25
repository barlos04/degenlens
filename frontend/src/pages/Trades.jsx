import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

function formatDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function Trades({ wallet }) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRecentTrades(wallet, 100).then(setTrades).catch(console.error).finally(() => setLoading(false));
  }, [wallet]);

  if (loading) {
    return <div className="loading"><div className="spinner" />Loading trades...</div>;
  }

  return (
    <div className="panel" style={{ overflow: 'auto' }}>
      <div className="panel-header">
        <div className="panel-title">Recent Trades</div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{trades.length} trades</span>
      </div>
      <table className="trade-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Status</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Size (SOL)</th>
            <th>PnL (SOL)</th>
            <th>Return</th>
            <th>Hold</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const pnl = Number(t.pnlSol);
            return (
              <tr key={t.id}>
                <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{t.symbol}</td>
                <td>
                  <span className={`badge ${t.status === 'open' ? 'badge-open' : pnl >= 0 ? 'badge-win' : 'badge-loss'}`}>
                    {t.status === 'open' ? 'OPEN' : pnl >= 0 ? 'WIN' : 'LOSS'}
                  </span>
                </td>
                <td>{formatTime(t.buyTime)}</td>
                <td>{formatTime(t.sellTime)}</td>
                <td>{t.buySol}</td>
                <td className={t.pnlSol ? (pnl >= 0 ? 'positive' : 'negative') : ''}>
                  {t.pnlSol ? (pnl >= 0 ? '+' : '') + t.pnlSol : '—'}
                </td>
                <td className={t.pnlPercent ? (Number(t.pnlPercent) >= 0 ? 'positive' : 'negative') : ''}>
                  {t.pnlPercent ? (Number(t.pnlPercent) >= 0 ? '+' : '') + t.pnlPercent + '%' : '—'}
                </td>
                <td>{formatDuration(t.holdDuration)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
