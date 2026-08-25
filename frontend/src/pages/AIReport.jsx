import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ReactMarkdown from 'react-markdown';

export default function AIReport({ wallet }) {
  const [reports, setReports] = useState([]);
  const [currentReport, setCurrentReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, [wallet]);

  async function loadReports() {
    try {
      const r = await api.getReports(wallet);
      setReports(r);
      if (r.length > 0) setCurrentReport(r[0]);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await api.generateReport(wallet);
      setCurrentReport({ report_text: result.report, created_at: new Date().toISOString() });
      await loadReports();
    } catch (err) {
      console.error(err);
    }
    setGenerating(false);
  }

  if (loading) {
    return <div className="loading"><div className="spinner" />Loading reports...</div>;
  }

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>AI Trading Coach</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Brutally honest analysis of your trading patterns
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? 'Analyzing...' : 'Generate Report'}
        </button>
      </div>

      {generating && (
        <div className="panel" style={{ borderColor: 'var(--accent-dim)' }}>
          <div className="loading">
            <div className="spinner" />
            Claude is analyzing your trades... this takes ~15 seconds.
          </div>
        </div>
      )}

      {currentReport && !generating && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              Weekly Report — {new Date(currentReport.created_at).toLocaleDateString('en', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </div>
          </div>
          <div className="report-content">
            <ReactMarkdown>{currentReport.report_text}</ReactMarkdown>
          </div>
        </div>
      )}

      {!currentReport && !generating && (
        <div className="panel">
          <div className="loading" style={{ flexDirection: 'column', gap: 12 }}>
            <p>No reports yet. Hit "Generate Report" to get your first AI analysis.</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Works best with at least 20+ trades synced.
            </p>
          </div>
        </div>
      )}

      {/* Past reports list */}
      {reports.length > 1 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Past Reports</div>
          </div>
          {reports.map((r) => (
            <div
              key={r.id}
              onClick={() => setCurrentReport(r)}
              style={{
                padding: '12px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13 }}>
                {r.report_type === 'weekly' ? 'Weekly' : 'Daily'} Report
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
