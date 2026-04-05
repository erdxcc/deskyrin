import { Keypair } from "@solana/web3.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { encryptSecret } from "../crypto/walletVault.js";
import { sqlRow } from "../db/cast.js";
import { getDb } from "../db/connection.js";
import type { UserRow } from "../types.js";

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  lastScanAt: string | null;
  externalRef: string | null;
  /** Кастодиальный Solana-кошелёк; появляется после первого скана QR (или после ensureCustodialWallet). */
  walletPublicKey: string | null;
  walletCreatedAt: string | null;
  /** USDC micro-units credited on each utilized bottle (MVP ledger). */
  rewardBalanceUsdcMicro: number;
}

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastScanAt: row.last_scan_at,
    externalRef: row.external_ref,
    walletPublicKey: row.wallet_public_key,
    walletCreatedAt: row.wallet_created_at,
    rewardBalanceUsdcMicro: row.reward_balance_usdc_micro ?? 0,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function registerWithEmailPassword(
  email: string,
  password: string
): PublicUser {
  const database = getDb();
  const norm = normalizeEmail(email);
  const password_hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const id = uuidv4();

  try {
    database
      .prepare(
        `INSERT INTO users (id, email, password_hash, external_ref, wallet_public_key, wallet_secret_encrypted, wallet_created_at)
         VALUES (?, ?, ?, NULL, NULL, NULL, NULL)`
      )
      .run(id, norm, password_hash);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      const err = new Error("EMAIL_TAKEN");
      (err as Error & { code: string }).code = "EMAIL_TAKEN";
      throw err;
    }
    throw e;
  }

  const row = sqlRow<UserRow>(
    database.prepare(`SELECT * FROM users WHERE id = ?`).get(id)
  )!;
  return toPublic(row);
}

export function verifyCredentials(
  email: string,
  password: string
): PublicUser | null {
  const row = sqlRow<UserRow>(
    getDb()
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .get(normalizeEmail(email))
  );
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return toPublic(row);
}

/**
 * Ensures custodial Solana keypair exists.
 * `walletCreatedThisSession` is true only when a new wallet was written this call.
 */
export function ensureCustodialWallet(userId: string): {
  user: PublicUser;
  walletCreatedThisSession: boolean;
} {
  const database = getDb();
  const row = sqlRow<UserRow>(
    database.prepare(`SELECT * FROM users WHERE id = ?`).get(userId)
  );
  if (!row) {
    const err = new Error("USER_NOT_FOUND");
    (err as Error & { code: string }).code = "USER_NOT_FOUND";
    throw err;
  }
  if (row.wallet_public_key && row.wallet_secret_encrypted) {
    return { user: toPublic(row), walletCreatedThisSession: false };
  }

  const kp = Keypair.generate();
  const secretJson = JSON.stringify(Array.from(kp.secretKey));
  const enc = encryptSecret(secretJson, config.walletEncryptionSecret);

  database
    .prepare(
      `UPDATE users SET
        wallet_public_key = ?,
        wallet_secret_encrypted = ?,
        wallet_created_at = datetime('now'),
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(kp.publicKey.toBase58(), enc, userId);

  const updated = sqlRow<UserRow>(
    database.prepare(`SELECT * FROM users WHERE id = ?`).get(userId)
  )!;
  return { user: toPublic(updated), walletCreatedThisSession: true };
}

export function addRewardBalance(userId: string, usdcMicro: number) {
  if (usdcMicro <= 0) return;
  getDb()
    .prepare(
      `UPDATE users SET
        reward_balance_usdc_micro = COALESCE(reward_balance_usdc_micro, 0) + ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(usdcMicro, userId);
}

/** Spend from in-app reward balance (e.g. partner checkout simulation). */
export function spendRewardBalance(userId: string, amountMicro: number): PublicUser {
  if (!Number.isFinite(amountMicro) || amountMicro <= 0) {
    const err = new Error("INVALID_AMOUNT");
    (err as Error & { code: string }).code = "INVALID_AMOUNT";
    throw err;
  }
  const database = getDb();
  const row = getUserByIdInternal(userId);
  if (!row) {
    const err = new Error("USER_NOT_FOUND");
    (err as Error & { code: string }).code = "USER_NOT_FOUND";
    throw err;
  }
  const current = row.reward_balance_usdc_micro ?? 0;
  if (current < amountMicro) {
    const err = new Error("INSUFFICIENT_BALANCE");
    (err as Error & { code: string }).code = "INSUFFICIENT_BALANCE";
    throw err;
  }
  database
    .prepare(
      `UPDATE users SET
        reward_balance_usdc_micro = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(current - amountMicro, userId);
  const updated = sqlRow<UserRow>(
    database.prepare(`SELECT * FROM users WHERE id = ?`).get(userId)
  )!;
  return toPublic(updated);
}

export function getUserById(id: string): PublicUser | null {
  const row = sqlRow<UserRow>(
    getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id)
  );
  return row ? toPublic(row) : null;
}

export function getUserByEmail(email: string): PublicUser | null {
  const row = sqlRow<UserRow>(
    getDb()
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .get(normalizeEmail(email))
  );
  return row ? toPublic(row) : null;
}

export function getUserByExternalRef(ref: string): PublicUser | null {
  const row = sqlRow<UserRow>(
    getDb().prepare(`SELECT * FROM users WHERE external_ref = ?`).get(ref)
  );
  return row ? toPublic(row) : null;
}

export function getUserByIdInternal(id: string): UserRow | null {
  return (
    sqlRow<UserRow>(getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id)) ??
    null
  );
}

export function touchUserScan(userId: string) {
  getDb()
    .prepare(
      `UPDATE users SET last_scan_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    )
    .run(userId);
}
