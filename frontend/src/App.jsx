import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import Dashboard from './pages/Dashboard';
import Trades from './pages/Trades';
import Behavioral from './pages/Behavioral';
import AIReport from './pages/AIReport';

export default function App() {
  const [wallet, setWallet] = useState(localStorage.getItem('dl_wallet') || '');
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (wallet) checkConnection();
  }, [wallet]);

  async function checkConnection() {
    try {
      const s = await api.getWalletStatus(wallet);
      setStatus(s);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }

  async function handleConnect() {
    const addr = inputVal.trim();
    if (!addr || addr.length < 32) {
      setError('Enter a valid Solana wallet address');
      return;
    }
    setError('');
    setSyncing(true);

    try {
      await api.connectWallet(addr);
      await api.syncWallet(addr);
      localStorage.setItem('dl_wallet', addr);
      setWallet(addr);
      setConnected(true);

      // Poll for sync completion
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const s = await api.getWalletStatus(addr);
        setStatus(s);
        if (Number(s.total_txns) > 0 || attempts > 30) {
          clearInterval(poll);
          setSyncing(false);
        }
      }, 3000);
    } catch (err) {
      setError(err.message);
      setSyncing(false);
    }
  }

  function handleDisconnect() {
    localStorage.removeItem('dl_wallet');
    setWallet('');
    setConnected(false);
    setStatus(null);
    setTab('dashboard');
  }

  if (!connected) {
    return (
      <div className="app">
        <div className="connect-screen">
          <h1>
            Degen<span style={{ color: '#a78bfa' }}>Lens</span>
          </h1>
          <p>
            Paste your Solana wallet to see what's actually happening with your
            memecoin trades. Win rates, behavioral patterns, the works.
          </p>
          <div className="wallet-input-group">
            <input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Solana wallet address..."
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
            <button className="btn btn-primary" onClick={handleConnect} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Analyze'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          {syncing && (
            <div className="loading">
              <div className="spinner" />
              Pulling your trades from Solana... this takes a minute.
            </div>
          )}
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'Overview' },
    { id: 'trades', label: 'Trades' },
    { id: 'behavioral', label: 'Patterns' },
    { id: 'report', label: 'AI Report' },
  ];

  return (
    <div className="app">
      <div className="header">
        <div className="logo">
          Degen<span>Lens</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
            {wallet.slice(0, 4)}...{wallet.slice(-4)}
          </span>
          {status && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {status.total_pairs} trades
            </span>
          )}
          <button className="btn btn-secondary" onClick={handleDisconnect} style={{ padding: '8px 14px', fontSize: 12 }}>
            Disconnect
          </button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard wallet={wallet} />}
      {tab === 'trades' && <Trades wallet={wallet} />}
      {tab === 'behavioral' && <Behavioral wallet={wallet} />}
      {tab === 'report' && <AIReport wallet={wallet} />}
    </div>
  );
}
