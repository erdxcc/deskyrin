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
  `);
}
