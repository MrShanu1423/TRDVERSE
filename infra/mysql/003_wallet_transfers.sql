-- TradeVerse 003: address book + transfers (MySQL 8). Run after 002.
-- The API currently keeps these in memory (artifacts/api-server/src/routes/wallet.ts); move them here before real money.
USE tradeverse;

CREATE TABLE IF NOT EXISTS saved_addresses (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, label VARCHAR(40) NOT NULL,
  network VARCHAR(8) NOT NULL, address VARCHAR(100) NOT NULL, memo VARCHAR(40) NULL,
  active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uq_addr (user_id, network, address)
);
CREATE TABLE IF NOT EXISTS transfers (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, coin VARCHAR(16) NOT NULL, network VARCHAR(8) NOT NULL,
  amount DECIMAL(30,8) NOT NULL, fee DECIMAL(30,8) NOT NULL, to_address VARCHAR(100) NOT NULL, label VARCHAR(40) NOT NULL,
  status ENUM('awaiting_otp','completed','cancelled','expired','failed') NOT NULL DEFAULT 'awaiting_otp',
  otp_hash CHAR(64) NULL, otp_expires_at TIMESTAMP NULL, otp_attempts TINYINT NOT NULL DEFAULT 0,
  note VARCHAR(200) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id), INDEX idx_tx_user (user_id, created_at)
);
