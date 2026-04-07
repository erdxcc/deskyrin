import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { sqlRows } from "./cast.js";
import { ensureUsersTable } from "./migrateUsers.js";
let db = null;
export function getDb() {
    if (db)
        return db;
    const dir = path.dirname(config.databasePath);
    fs.mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(config.databasePath);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    return db;
}
function ensureUserRewardColumn(database) {
    const cols = sqlRows(database.prepare(`PRAGMA table_info(users)`).all());
    if (cols.some((c) => c.name === "reward_balance_usdc_micro"))
        return;
    database.exec(`ALTER TABLE users ADD COLUMN reward_balance_usdc_micro INTEGER NOT NULL DEFAULT 0`);
}
function ensureUserTokenBalanceColumn(database) {
    const cols = sqlRows(database.prepare(`PRAGMA table_info(users)`).all());
    if (cols.some((c) => c.name === "token_balance"))
        return;
    database.exec(`ALTER TABLE users ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 0`);
}
/** Action tokens (campaign) + Protocol tokens (after stake); migrates legacy token_balance → ac_balance once. */
function ensureUserAcPtBalanceColumns(database) {
    const cols = sqlRows(database.prepare(`PRAGMA table_info(users)`).all());
    const hasAc = cols.some((c) => c.name === "ac_balance");
    const hasPt = cols.some((c) => c.name === "pt_balance");
    if (!hasAc) {
        database.exec(`ALTER TABLE users ADD COLUMN ac_balance INTEGER NOT NULL DEFAULT 0`);
        database.exec(`UPDATE users SET ac_balance = COALESCE(token_balance, 0)`);
    }
    if (!hasPt) {
        database.exec(`ALTER TABLE users ADD COLUMN pt_balance INTEGER NOT NULL DEFAULT 0`);
    }
}
function ensureUserWalletLinkNonceColumn(database) {
    const cols = sqlRows(database.prepare(`PRAGMA table_info(users)`).all());
    if (cols.some((c) => c.name === "wallet_link_nonce"))
        return;
    database.exec(`ALTER TABLE users ADD COLUMN wallet_link_nonce TEXT`);
}
function migrate(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      solana_pool_partner_pubkey TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
    ensureUsersTable(database);
    ensureUserRewardColumn(database);
    ensureUserTokenBalanceColumn(database);
    ensureUserAcPtBalanceColumns(database);
    ensureUserWalletLinkNonceColumn(database);
    database.exec(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      bottle_id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES partners(id),
      status TEXT NOT NULL CHECK (status IN (
        'registered',
        'minted',
        'recycled',
        'void'
      )),
      product_name TEXT,
      reward_usdc_micro INTEGER NOT NULL DEFAULT 0,
      metadata_uri TEXT,
      assigned_user_id TEXT REFERENCES users(id),
      bottle_mint_pubkey TEXT,
      mint_tx_signature TEXT,
      recycle_tx_signature TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_qr_partner ON qr_codes(partner_id);
    CREATE INDEX IF NOT EXISTS idx_qr_status ON qr_codes(status);

    CREATE TABLE IF NOT EXISTS scan_events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      bottle_id TEXT NOT NULL REFERENCES qr_codes(bottle_id),
      user_id TEXT REFERENCES users(id),
      event_type TEXT NOT NULL CHECK (event_type IN (
        'first_scan',
        'recycle_requested',
        'recycle_confirmed',
        'admin_note'
      )),
      payload_json TEXT,
      client_fingerprint TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_bottle ON scan_events(bottle_id);

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES partners(id),
      title TEXT NOT NULL,
      description TEXT,
      influencer_name TEXT NOT NULL,
      partner_ad_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_partner ON campaigns(partner_id);

    CREATE TABLE IF NOT EXISTS campaign_tasks (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      target_count INTEGER NOT NULL CHECK (target_count >= 1),
      token_reward INTEGER NOT NULL CHECK (token_reward >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_tasks_campaign ON campaign_tasks(campaign_id);

    CREATE TABLE IF NOT EXISTS user_task_progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES campaign_tasks(id) ON DELETE CASCADE,
      progress_count INTEGER NOT NULL DEFAULT 0 CHECK (progress_count >= 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS stake_positions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stake_idx INTEGER NOT NULL,
      ac_amount INTEGER NOT NULL CHECK (ac_amount > 0),
      lock_days INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      maturity_at TEXT NOT NULL,
      total_pt_entitled INTEGER NOT NULL,
      claimed_pt INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, stake_idx)
    );

    CREATE INDEX IF NOT EXISTS idx_stakes_user ON stake_positions(user_id);
  `);
}
