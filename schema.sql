-- ==========================================================
-- VertexCapitals OTC Platform - MySQL Database Schema
-- Compatible with Shared Hosting MySQL (cPanel) & Docker/Local
-- ==========================================================

-- If running standalone on local/Docker, you can uncomment the next 2 lines:
-- CREATE DATABASE IF NOT EXISTS `vertexcapitals_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE `vertexcapitals_db`;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `full_name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `country` VARCHAR(100) DEFAULT 'United States',
  `account_number` VARCHAR(30) NOT NULL UNIQUE,
  `role` ENUM('user', 'admin') DEFAULT 'user',
  `status` ENUM('active', 'banned') DEFAULT 'active',
  `verification_code` VARCHAR(10) DEFAULT NULL,
  `is_verified` TINYINT(1) DEFAULT 0,
  `referral_code` VARCHAR(50) NOT NULL UNIQUE,
  `referred_by` VARCHAR(50) DEFAULT NULL,
  `kyc_status` ENUM('unverified', 'pending', 'verified') DEFAULT 'unverified',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Wallets Table (Exchange & OTC Balances)
CREATE TABLE IF NOT EXISTS `wallets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL UNIQUE,
  `exchange_balance` DECIMAL(18, 2) DEFAULT 0.00,
  `otc_investment_balance` DECIMAL(18, 2) DEFAULT 0.00,
  `accrued_profit` DECIMAL(18, 2) DEFAULT 0.00,
  `total_invested` DECIMAL(18, 2) DEFAULT 0.00,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. OTC Investment Plans Table
CREATE TABLE IF NOT EXISTS `otc_plans` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `amount` DECIMAL(18, 2) NOT NULL,
  `weekly_roi_percent` DECIMAL(6, 2) DEFAULT 7.50,
  `duration_days` INT DEFAULT 30,
  `days_elapsed` INT DEFAULT 0,
  `profit_accrued` DECIMAL(18, 2) DEFAULT 0.00,
  `status` ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
  `start_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `next_payout_date` TIMESTAMP NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Transactions Ledger Table
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tx_ref` VARCHAR(50) NOT NULL UNIQUE,
  `user_id` INT NOT NULL,
  `type` ENUM('deposit', 'withdrawal', 'invest_otc', 'otc_profit', 'transfer') NOT NULL,
  `amount` DECIMAL(18, 2) NOT NULL,
  `asset` VARCHAR(30) NOT NULL,
  `status` ENUM('pending', 'completed', 'rejected') DEFAULT 'pending',
  `destination_address` VARCHAR(255) DEFAULT NULL,
  `tx_hash` VARCHAR(255) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Company Official Deposit Wallets (Configurable by Admin)
CREATE TABLE IF NOT EXISTS `company_wallets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `symbol` VARCHAR(20) NOT NULL UNIQUE,
  `name` VARCHAR(50) NOT NULL,
  `network` VARCHAR(50) NOT NULL,
  `address` VARCHAR(255) NOT NULL,
  `qr_url` VARCHAR(500) DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Automated Email Logs Table
CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `recipient_email` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `event_type` VARCHAR(50) NOT NULL,
  `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SEED INITIAL DATA
-- ==========================================================

-- Seed Admin Account (Password: admin123)
INSERT INTO `users` (`id`, `full_name`, `email`, `password_hash`, `country`, `account_number`, `role`, `status`, `is_verified`, `referral_code`, `kyc_status`)
VALUES (1, 'Master Administrator', 'admin@vertexcapitals.ltd', '$2a$10$w09ZkM50P3qT1aPqvLzqyeP6q5CslN0bZ8Yl5U4tG57m8E.p4K.uK', 'United States', 'VX-ADMIN-01', 'admin', 'active', 1, 'VX-ADMIN', 'verified')
ON DUPLICATE KEY UPDATE `email` = `email`;

-- Seed Demo Investor (Password: user123)
INSERT INTO `users` (`id`, `full_name`, `email`, `password_hash`, `country`, `account_number`, `role`, `status`, `is_verified`, `referral_code`, `kyc_status`)
VALUES (2, 'Alexander Wright', 'alexander@vertexcapitals.ltd', '$2a$10$w09ZkM50P3qT1aPqvLzqyeP6q5CslN0bZ8Yl5U4tG57m8E.p4K.uK', 'United States', '8776', 'user', 'active', 1, 'VX-8776', 'verified')
ON DUPLICATE KEY UPDATE `email` = `email`;

-- Seed Investor Wallets
INSERT INTO `wallets` (`user_id`, `exchange_balance`, `otc_investment_balance`, `accrued_profit`, `total_invested`)
VALUES 
(1, 100000.00, 500000.00, 85000.00, 500000.00),
(2, 12450.00, 10000.00, 1850.00, 10000.00)
ON DUPLICATE KEY UPDATE `user_id` = `user_id`;

-- Seed Active OTC Plan for Alexander
INSERT INTO `otc_plans` (`id`, `user_id`, `amount`, `weekly_roi_percent`, `duration_days`, `days_elapsed`, `profit_accrued`, `status`)
VALUES (1, 2, 10000.00, 7.50, 30, 14, 1850.00, 'active')
ON DUPLICATE KEY UPDATE `id` = `id`;

-- Seed Official Company Deposit Wallets
INSERT INTO `company_wallets` (`id`, `symbol`, `name`, `network`, `address`, `qr_url`, `is_active`)
VALUES
(1, 'USDT_TRC20', 'Tether USD (TRC20)', 'Tron Network (TRC20)', 'TXJ9m9P7L8sF3GzQ5K2W1bV8c4Xy7ZaBcd', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=TXJ9m9P7L8sF3GzQ5K2W1bV8c4Xy7ZaBcd', 1),
(2, 'BTC', 'Bitcoin', 'Bitcoin Network', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 1),
(3, 'ETH', 'Ethereum', 'Ethereum (ERC20)', '0x71C836642F4F13360565780aef863E75532Eefe7', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=0x71C836642F4F13360565780aef863E75532Eefe7', 1),
(4, 'USDT_ERC20', 'Tether USD (ERC20)', 'Ethereum (ERC20)', '0x71C836642F4F13360565780aef863E75532Eefe7', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=0x71C836642F4F13360565780aef863E75532Eefe7', 1),
(5, 'SOL', 'Solana', 'Solana Mainnet', '7EYnhQoR9YM3N7UoaKRoA44BW8PYJuCYRnbZKWQnMMz', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=7EYnhQoR9YM3N7UoaKRoA44BW8PYJuCYRnbZKWQnMMz', 1),
(6, 'BNB', 'BNB (BEP20)', 'BNB Smart Chain', '0x71C836642F4F13360565780aef863E75532Eefe7', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=0x71C836642F4F13360565780aef863E75532Eefe7', 1)
ON DUPLICATE KEY UPDATE `symbol` = `symbol`;

-- Seed Transactions
INSERT INTO `transactions` (`tx_ref`, `user_id`, `type`, `amount`, `asset`, `status`, `destination_address`, `tx_hash`, `notes`)
VALUES
('TX-948271', 2, 'deposit', 5000.00, 'USDT (TRC20)', 'completed', 'TXJ9m9P7L8sF3GzQ5K2W1bV8c4Xy7ZaBcd', 'a9b8c7d6e5f41234567890abcdef1234567890abcdef', 'Initial Account Funding'),
('TX-948272', 2, 'otc_profit', 750.00, 'OTC Yield', 'completed', 'Exchange Wallet', 'INTERNAL-OTC-CREDIT', 'Weekly OTC Profit Credited (7.5%)'),
('TX-948273', 2, 'withdrawal', 1200.00, 'Bitcoin (BTC)', 'completed', 'bc1q99...x0wlh', 'f1e2d3c4b5a678901234567890abcdef1234567890abcdef', 'Weekly Profit Payout')
ON DUPLICATE KEY UPDATE `tx_ref` = `tx_ref`;

