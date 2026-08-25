const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Wallet
  connectWallet: (walletAddress) =>
    request('/api/wallet/connect', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    }),

  syncWallet: (walletAddress) =>
    request('/api/wallet/sync', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    }),

  getWalletStatus: (walletAddress) =>
    request(`/api/wallet/status/${walletAddress}`),

  // Analytics
  getDashboard: (wallet, days = 30) =>
    request(`/api/analytics/dashboard?wallet=${wallet}&days=${days}`),

  getPnlTimeline: (wallet, days = 30) =>
    request(`/api/analytics/pnl-timeline?wallet=${wallet}&days=${days}`),

  getHourlyPerformance: (wallet) =>
    request(`/api/analytics/hourly?wallet=${wallet}`),

  getPositionSizing: (wallet) =>
    request(`/api/analytics/sizing?wallet=${wallet}`),

  getHoldTimes: (wallet) =>
    request(`/api/analytics/hold-times?wallet=${wallet}`),

  getTokenBreakdown: (wallet, days = 30) =>
    request(`/api/analytics/tokens?wallet=${wallet}&days=${days}`),

  getRecentTrades: (wallet, limit = 50) =>
    request(`/api/analytics/trades?wallet=${wallet}&limit=${limit}`),

  // Reports
  generateReport: (walletAddress) =>
    request('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    }),

  getReports: (walletAddress) =>
    request(`/api/reports/${walletAddress}`),
};
