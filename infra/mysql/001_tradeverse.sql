-- TradeVerse MySQL 8 schema for self-hosted deployments.
-- The preview uses seeded paper data; switch the API data provider to these tables
-- after supplying MYSQL_URL and a Firebase Admin service account.

CREATE DATABASE IF NOT EXISTS tradeverse
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE tradeverse;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  email VARCHAR(320) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32),
  kyc_status ENUM('pending', 'in_review', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS assets (
  symbol VARCHAR(32) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  category ENUM('crypto', 'stocks', 'funds') NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  last_price DECIMAL(24, 8) NOT NULL DEFAULT 0,
  change_percent DECIMAL(12, 6) NOT NULL DEFAULT 0,
  market_cap DECIMAL(30, 2) NOT NULL DEFAULT 0,
  logo VARCHAR(16) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS holdings (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  quantity DECIMAL(24, 8) NOT NULL,
  average_price DECIMAL(24, 8) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_holdings_user_asset (user_id, symbol),
  CONSTRAINT fk_holdings_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_holdings_asset FOREIGN KEY (symbol) REFERENCES assets(symbol)
);

CREATE TABLE IF NOT EXISTS paper_orders (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  side ENUM('buy', 'sell') NOT NULL,
  order_type ENUM('market', 'limit') NOT NULL,
  quantity DECIMAL(24, 8) NOT NULL,
  limit_price DECIMAL(24, 8),
  status ENUM('queued', 'simulated', 'cancelled') NOT NULL DEFAULT 'queued',
  is_paper BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_orders_asset FOREIGN KEY (symbol) REFERENCES assets(symbol),
  INDEX idx_orders_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS account_activity (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  activity_type ENUM('deposit', 'order', 'sip', 'reward') NOT NULL,
  title VARCHAR(160) NOT NULL,
  detail VARCHAR(255) NOT NULL,
  amount DECIMAL(24, 8) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_activity_user_created (user_id, created_at)
);
