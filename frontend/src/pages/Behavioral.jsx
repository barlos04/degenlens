import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';

export default function Behavioral({ wallet }) {
  const [hourly, setHourly] = useState([]);
  const [holdTimes, setHoldTimes] = useState([]);
  const [sizing, setSizing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getHourlyPerformance(wallet),
      api.getHoldTimes(wallet),
      api.getPositionSizing(wallet),
    ])
      .then(([h, ht, s]) => {
        setHourly(h);
        setHoldTimes(ht);
        setSizing(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [wallet]);

  if (loading) {
    return <div className="loading"><div className="spinner" />Analyzing patterns...</div>;
  }

  const formatHour = (h) => {
    if (h === 0) return '12a';
    if (h < 12) return `${h}a`;
    if (h === 12) return '12p';
    return `${h - 12}p`;
  };

  // Find best and worst hours
  const hoursWithTrades = hourly.filter((h) => h.trades >= 3);
  const bestHour = hoursWithTrades.length > 0
    ? hoursWithTrades.reduce((a, b) => (Number(a.totalPnl) > Number(b.totalPnl) ? a : b))
    : null;
  const worstHour = hoursWithTrades.length > 0
    ? hoursWithTrades.reduce((a, b) => (Number(a.totalPnl) < Number(b.totalPnl) ? a : b))
    : null;

  const sizingBuckets = sizing ? [
    { label: 'Small', ...sizing.belowAvg },
    { label: 'Average', ...sizing.average },
    { label: 'Large', ...sizing.aboveAvg },
    { label: 'Oversized', ...sizing.oversized },
  ].filter((b) => b.trades > 0) : [];

  return (
    <div className="dashboard">
      {/* Key insights callout */}
      {(bestHour || worstHour) && (
        <div className="panel" style={{ borderColor: 'var(--accent-dim)', background: 'var(--accent-bg)' }}>
          <div className="panel-title" style={{ marginBottom: 10, color: 'var(--accent)' }}>Key Patterns</div>
          <div style={{ fontSize: 14, lineHeight: 1.8 }}>
            {bestHour && (
              <p>
                Your best hour is <strong style={{ color: 'var(--green)' }}>{formatHour(bestHour.hour)}</strong>
                {' '}— {bestHour.winRate}% win rate across {bestHour.trades} trades ({Number(bestHour.totalPnl) >= 0 ? '+' : ''}{Number(bestHour.totalPnl).toFixed(2)} SOL).
              </p>
            )}
            {worstHour && Number(worstHour.totalPnl) < 0 && (
              <p>
                Your worst hour is <strong style={{ color: 'var(--red)' }}>{formatHour(worstHour.hour)}</strong>
                {' '}— {worstHour.winRate}% win rate, costing you {Number(worstHour.totalPnl).toFixed(2)} SOL.
                {' '}Skipping this hour would have saved you that.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hourly performance */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Performance by Hour (UTC)</div>
        </div>
        {hourly.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hourly}>
              <CartesianGrid stroke="#1f2233" strokeDasharray="3 3" />
              <XAxis
                dataKey="hour"
                tick={{ fill: '#5c6078', fontSize: 10 }}
                tickFormatter={formatHour}
              />
              <YAxis tick={{ fill: '#5c6078', fontSize: 10 }} tickFormatter={(v) => `${v}`} />
              <Tooltip
                contentStyle={{ background: '#1a1d28', border: '1px solid #2a2d3a', borderRadius: 8, fontSize: 12 }}
                formatter={(val, name) => {
                  if (name === 'totalPnl') return [`${Number(val).toFixed(3)} SOL`, 'PnL'];
                  return [val, name];
                }}
                labelFormatter={(h) => `${formatHour(h)} UTC`}
              />
              <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]}>
                {hourly.map((entry, i) => (
                  <Cell key={i} fill={Number(entry.totalPnl) >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="loading">Not enough data</div>
        )}
      </div>

      <div className="panel-row">
        {/* Hold time distribution */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Hold Time Performance</div>
          </div>
          {holdTimes.filter((h) => h.trades > 0).map((h) => {
            const maxTrades = Math.max(...holdTimes.map((x) => x.trades));
            const width = maxTrades > 0 ? (h.trades / maxTrades) * 100 : 0;
            const isPositive = Number(h.avgReturn) >= 0;
            return (
              <div className="bar-row" key={h.label}>
                <div className="bar-label">{h.label}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max(width, 8)}%`,
                      background: isPositive ? 'var(--green)' : 'var(--red)',
                      opacity: 0.7,
                    }}
                  >
                    {h.trades}
                  </div>
                </div>
                <div className="bar-value" style={{ color: isPositive ? 'var(--green)' : 'var(--red)' }}>
                  {isPositive ? '+' : ''}{h.avgReturn}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Position sizing */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Position Sizing Impact</div>
          </div>
          {sizing && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Avg position: {sizing.avgPositionSol} SOL
            </div>
          )}
          {sizingBuckets.map((b) => {
            const isPositive = Number(b.totalPnl) >= 0;
            return (
              <div key={b.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {b.trades} trades · {b.winRate}% win rate
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
                  color: isPositive ? 'var(--green)' : 'var(--red)',
                }}>
                  {isPositive ? '+' : ''}{b.totalPnl} SOL
                </div>
              </div>
            );
          })}
          {sizingBuckets.length === 0 && (
            <div className="loading">Not enough data</div>
          )}
        </div>
      </div>
    </div>
  );
}
