import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { DatabaseSync } from "node:sqlite";
import { sqlRows } from "./cast.js";

interface OldUserRow {
  id: string;
  created_at: string;
  updated_at: string;
  last_scan_at: string | null;
  external_ref: string | null;
  wallet_public_key: string;
  wallet_secret_encrypted: string;
}

interface BackupQr {
  bottle_id: string;
  partner_id: string;
  status: string;
  product_name: string | null;
  reward_usdc_micro: number;
  metadata_uri: string | null;
  assigned_user_id: string | null;
  bottle_mint_pubkey: string | null;
  mint_tx_signature: string | null;
  recycle_tx_signature: string | null;
  created_at: string;
  updated_at: string;
}

interface BackupEvent {
  id: string;
  created_at: string;
  bottle_id: string;
  user_id: string | null;
  event_type: string;
  payload_json: string | null;
  client_fingerprint: string | null;
}

function createUsersDdl() {
  return `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_scan_at TEXT,
      external_ref TEXT UNIQUE,
      wallet_public_key TEXT UNIQUE,
      wallet_secret_encrypted TEXT,
      wallet_created_at TEXT,
      reward_balance_usdc_micro INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_public_key);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `;
}

function createQrCodesDdl() {
  return `
    CREATE TABLE qr_codes (
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
  `;
}

function createScanEventsDdl() {
  return `
    CREATE TABLE scan_events (
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
  `;
}

export function ensureUsersTable(database: DatabaseSync) {
  const exists = sqlRows<{ name: string }>(
    database
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
      .all()
  );

  if (exists.length === 0) {
    database.exec(createUsersDdl());
    return;
  }

  const cols = sqlRows<{ name: string }>(
    database.prepare(`PRAGMA table_info(users)`).all()
  );
  if (cols.some((c) => c.name === "email")) {
    return;
  }

  const backupUsers = sqlRows<OldUserRow>(
    database.prepare(`SELECT * FROM users`).all()
  );
  const hasQr = sqlRows<{ name: string }>(
    database
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='qr_codes'`)
      .all()
  ).length;
  const backupQr = hasQr
    ? sqlRows<BackupQr>(database.prepare(`SELECT * FROM qr_codes`).all())
    : [];
  const hasEv = sqlRows<{ name: string }>(
    database
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='scan_events'`)
      .all()
  ).length;
  const backupEvents = hasEv
    ? sqlRows<BackupEvent>(database.prepare(`SELECT * FROM scan_events`).all())
    : [];

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("DROP TABLE IF EXISTS scan_events");
  database.exec("DROP TABLE IF EXISTS qr_codes");
  database.exec("DROP TABLE IF EXISTS users");

  database.exec(createUsersDdl());

  const insUser = database.prepare(
    `INSERT INTO users (
      id, email, password_hash, created_at, updated_at, last_scan_at, external_ref,
      wallet_public_key, wallet_secret_encrypted, wallet_created_at, reward_balance_usdc_micro
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  );
  for (const r of backupUsers) {
    const email = `legacy-${r.id}@migrated.local`.toLowerCase();
    const password_hash = bcrypt.hashSync(
      `MIGRATED_${randomBytes(16).toString("hex")}`,
      12
    );
    insUser.run(
      r.id,
      email,
      password_hash,
      r.created_at,
      r.updated_at,
      r.last_scan_at,
      r.external_ref,
      r.wallet_public_key,
      r.wallet_secret_encrypted,
      r.created_at
    );
  }

  database.exec(createQrCodesDdl());
  const insQr = database.prepare(
    `INSERT INTO qr_codes (
      bottle_id, partner_id, status, product_name, reward_usdc_micro, metadata_uri,
      assigned_user_id, bottle_mint_pubkey, mint_tx_signature, recycle_tx_signature,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const q of backupQr) {
    insQr.run(
      q.bottle_id,
      q.partner_id,
      q.status,
      q.product_name,
      q.reward_usdc_micro,
      q.metadata_uri,
      q.assigned_user_id,
      q.bottle_mint_pubkey,
      q.mint_tx_signature,
      q.recycle_tx_signature,
      q.created_at,
      q.updated_at
    );
  }

  database.exec(createScanEventsDdl());
  const insEv = database.prepare(
    `INSERT INTO scan_events (id, created_at, bottle_id, user_id, event_type, payload_json, client_fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const e of backupEvents) {
    insEv.run(
      e.id,
      e.created_at,
      e.bottle_id,
      e.user_id,
      e.event_type,
      e.payload_json,
      e.client_fingerprint
    );
  }

  database.exec("PRAGMA foreign_keys = ON");
}
