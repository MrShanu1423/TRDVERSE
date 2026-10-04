-- TradeVerse 002: persistent auth + feature tables (MySQL 8). Run after 001.
USE tradeverse;

ALTER TABLE users MODIFY firebase_uid VARCHAR(128) NULL, MODIFY email VARCHAR(320) NULL, MODIFY display_name VARCHAR(120) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP NULL, ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL;
CREATE UNIQUE INDEX uq_users_phone ON users (phone);

-- Store only hashes of OTPs and session tokens (SHA-256), never the raw values.
CREATE TABLE IF NOT EXISTS otp_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(320) NOT NULL,          -- email or +91XXXXXXXXXX
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL,
  ip VARCHAR(45),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_ident (identifier, created_at)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  device VARCHAR(200),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_sess_user (user_id)
);
CREATE TABLE IF NOT EXISTS watchlists (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, name VARCHAR(60) NOT NULL,
  CONSTRAINT fk_wl_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id CHAR(36) NOT NULL, symbol VARCHAR(32) NOT NULL, position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (watchlist_id, symbol),
  CONSTRAINT fk_wli_wl FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS price_alerts (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, symbol VARCHAR(32) NOT NULL,
  direction ENUM('above','below') NOT NULL, target_price DECIMAL(24,8) NOT NULL,
  triggered_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alert_user FOREIGN KEY (user_id) REFERENCES users(id), INDEX idx_alert_open (symbol, triggered_at)
);
CREATE TABLE IF NOT EXISTS sips (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, fund_symbol VARCHAR(32) NOT NULL,
  amount DECIMAL(14,2) NOT NULL, debit_day TINYINT NOT NULL, step_up_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  status ENUM('active','paused','cancelled') NOT NULL DEFAULT 'active', next_debit DATE,
  CONSTRAINT fk_sip_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS ipo_applications (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, ipo_name VARCHAR(160) NOT NULL,
  lots INT NOT NULL, bid_price DECIMAL(12,2) NOT NULL, upi_id VARCHAR(80),
  status ENUM('submitted','mandate_pending','allotted','not_allotted','refunded') NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ipo_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS wallet_balances (
  user_id CHAR(36) NOT NULL, currency VARCHAR(16) NOT NULL, available DECIMAL(30,10) NOT NULL DEFAULT 0, locked DECIMAL(30,10) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, currency), CONSTRAINT fk_wb_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS ledger_entries ( -- append-only, every balance change is a row
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id CHAR(36) NOT NULL, currency VARCHAR(16) NOT NULL,
  delta DECIMAL(30,10) NOT NULL, reason VARCHAR(40) NOT NULL, ref_id CHAR(36), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ledger_user (user_id, created_at)
);
CREATE TABLE IF NOT EXISTS staking_positions (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, coin VARCHAR(16) NOT NULL, amount DECIMAL(30,10) NOT NULL,
  apr DECIMAL(6,2) NOT NULL, lock_days INT NOT NULL DEFAULT 0, started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ends_at TIMESTAMP NULL,
  CONSTRAINT fk_stk_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS kyc_documents (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, doc_type ENUM('pan','aadhaar_masked','selfie','bank_proof') NOT NULL,
  storage_path VARCHAR(300) NOT NULL, status ENUM('uploaded','verified','rejected') NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, title VARCHAR(160) NOT NULL, body VARCHAR(400), read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id)
);
