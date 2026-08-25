-- DegenLens Database Schema

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) UNIQUE NOT NULL,
  tier VARCHAR(20) DEFAULT 'free', -- free, pro, degen
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracked_wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(64) NOT NULL,
  label VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wallet_address)
);

CREATE TABLE IF NOT EXISTS raw_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(64) NOT NULL,
  tx_signature VARCHAR(128) UNIQUE NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  token_address VARCHAR(64) NOT NULL,
  token_symbol VARCHAR(32),
  token_name VARCHAR(128),
  side VARCHAR(4) NOT NULL, -- buy / sell
  token_amount NUMERIC,
  sol_amount NUMERIC,
  price_per_token NUMERIC,
  fee_sol NUMERIC DEFAULT 0,
  source VARCHAR(32), -- jupiter, raydium, orca, etc
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_tx_wallet ON raw_transactions(wallet_address);
CREATE INDEX idx_raw_tx_token ON raw_transactions(token_address);
CREATE INDEX idx_raw_tx_time ON raw_transactions(block_time);

CREATE TABLE IF NOT EXISTS trade_pairs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(64) NOT NULL,
  token_address VARCHAR(64) NOT NULL,
  token_symbol VARCHAR(32),
  token_name VARCHAR(128),
  buy_tx_id INTEGER REFERENCES raw_transactions(id),
  sell_tx_id INTEGER REFERENCES raw_transactions(id),
  buy_time TIMESTAMPTZ NOT NULL,
  sell_time TIMESTAMPTZ,
  buy_price NUMERIC NOT NULL,
  sell_price NUMERIC,
  buy_amount NUMERIC NOT NULL,
  sell_amount NUMERIC,
  buy_sol NUMERIC NOT NULL,
  sell_sol NUMERIC,
  pnl_sol NUMERIC,
  pnl_percent NUMERIC,
  hold_duration_seconds INTEGER,
  status VARCHAR(10) DEFAULT 'open', -- open / closed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pairs_wallet ON trade_pairs(wallet_address);
CREATE INDEX idx_pairs_status ON trade_pairs(status);
CREATE INDEX idx_pairs_buy_time ON trade_pairs(buy_time);

CREATE TABLE IF NOT EXISTS token_metadata (
  token_address VARCHAR(64) PRIMARY KEY,
  symbol VARCHAR(32),
  name VARCHAR(128),
  decimals INTEGER,
  created_at_chain TIMESTAMPTZ,
  category VARCHAR(64), -- ai, animal, celebrity, political, defi, other
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS copy_trade_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tracked_wallet_id INTEGER REFERENCES tracked_wallets(id) ON DELETE CASCADE,
  total_copies INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  total_pnl_sol NUMERIC DEFAULT 0,
  avg_entry_delay_seconds INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  report_type VARCHAR(20) DEFAULT 'weekly', -- daily, weekly
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  report_text TEXT NOT NULL,
  stats_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_trades INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  total_pnl_sol NUMERIC DEFAULT 0,
  avg_hold_seconds INTEGER,
  avg_entry_percentile NUMERIC, -- 0-100, where in token lifecycle they entered
  best_trade_pnl NUMERIC,
  worst_trade_pnl NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);
