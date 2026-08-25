# DegenLens

AI-powered memecoin trade analytics. See what's actually happening with your trading — behavioral patterns, win rates, position sizing impact, and AI-generated coaching reports.

## Architecture

```
Frontend (React/Vite) → Backend (Express/Node.js) → PostgreSQL
                                ↓              ↓
                          Helius API      Claude API
                        (Solana data)   (AI reports)
```

## Setup

### 1. Backend (Railway)

```bash
cd backend
cp .env.example .env
# Fill in your keys:
#   DATABASE_URL    — Railway Postgres (auto-provisioned)
#   HELIUS_API_KEY  — https://dev.helius.xyz (free tier works)
#   ANTHROPIC_API_KEY — your key
#   FRONTEND_URL    — your Vercel URL once deployed

npm install
npm run db:init   # Creates tables
npm start
```

**Railway deploy:** Push `backend/` to a GitHub repo → connect to Railway → add Postgres plugin → set env vars → deploy.

### 2. Frontend (Vercel)

```bash
cd frontend
cp .env.example .env
# Set VITE_API_URL to your Railway backend URL

npm install
npm run dev
```

**Vercel deploy:** Push `frontend/` to GitHub → import in Vercel → set `VITE_API_URL` env var → deploy.

### 3. Get API Keys

- **Helius** — https://dev.helius.xyz — free tier gives 30 RPC/sec, plenty for analytics
- **Anthropic** — https://console.anthropic.com — for AI report generation

## How It Works

1. User pastes their Solana wallet address
2. Backend pulls all swap transactions via Helius API
3. Trades are parsed and matched using FIFO (buy→sell pairing)
4. Analytics engine computes behavioral patterns
5. Claude generates a personalized weekly trading report

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/wallet/connect` | Register a wallet |
| POST | `/api/wallet/sync` | Pull trades from Solana |
| GET | `/api/wallet/status/:addr` | Sync status |
| GET | `/api/analytics/dashboard` | Overview stats |
| GET | `/api/analytics/pnl-timeline` | Daily PnL chart |
| GET | `/api/analytics/hourly` | Hour-of-day performance |
| GET | `/api/analytics/sizing` | Position sizing analysis |
| GET | `/api/analytics/hold-times` | Hold time distribution |
| GET | `/api/analytics/tokens` | Per-token breakdown |
| GET | `/api/analytics/trades` | Recent trade list |
| POST | `/api/reports/generate` | Generate AI report |
| GET | `/api/reports/:addr` | Get past reports |

## Monetization

- **Free** — 1 wallet, basic PnL, 7-day history
- **Pro $29/mo** — unlimited history, behavioral analytics, weekly AI report
- **Degen $49/mo** — daily AI reports, copy-trade grading, exit optimization
