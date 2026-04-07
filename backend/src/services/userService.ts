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
  /** Linked external wallet OR custodial wallet (if created in-platform). */
  walletPublicKey: string | null;
  /** True when walletSecretEncrypted exists (custodial). */
  walletCustodial: boolean;
  walletCreatedAt: string | null;
  /** USDC micro-units credited on each utilized bottle (MVP ledger). */
  rewardBalanceUsdcMicro: number;
  /** Action Tokens — campaign rewards; not sold (MVP); stake → PT. */
  acBalance: number;
  /** Protocol Tokens — from staking AC; spend / withdraw (MVP ledger). */
  ptBalance: number;
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
    walletCustodial: Boolean(row.wallet_public_key && row.wallet_secret_encrypted),
    walletCreatedAt: row.wallet_created_at,
    rewardBalanceUsdcMicro: row.reward_balance_usdc_micro ?? 0,
    acBalance: row.ac_balance ?? row.token_balance ?? 0,
    ptBalance: row.pt_balance ?? 0,
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
  if (row.wallet_public_key && !row.wallet_secret_encrypted) {
    const err = new Error("EXTERNAL_WALLET_ALREADY_LINKED");
    (err as Error & { code: string }).code = "EXTERNAL_WALLET_ALREADY_LINKED";
    throw err;
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

export function issueWalletLinkChallenge(userId: string): { nonce: string; message: string } {
  const database = getDb();
  const row = getUserByIdInternal(userId);
  if (!row) {
    const err = new Error("USER_NOT_FOUND");
    (err as Error & { code: string }).code = "USER_NOT_FOUND";
    throw err;
  }
  const nonce = uuidv4();
  const message = `Deskyrin wallet link\nUser: ${userId}\nNonce: ${nonce}\n\nOnly sign if you trust this app.`;
  database
    .prepare(
      `UPDATE users SET wallet_link_nonce = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(nonce, userId);
  return { nonce, message };
}

export function linkExternalWallet(userId: string, walletPublicKey: string, nonce: string): PublicUser {
  const database = getDb();
  const row = getUserByIdInternal(userId);
  if (!row) {
    const err = new Error("USER_NOT_FOUND");
    (err as Error & { code: string }).code = "USER_NOT_FOUND";
    throw err;
  }
  if (!row.wallet_link_nonce || row.wallet_link_nonce !== nonce) {
    const err = new Error("INVALID_WALLET_LINK_NONCE");
    (err as Error & { code: string }).code = "INVALID_WALLET_LINK_NONCE";
    throw err;
  }
  if (row.wallet_secret_encrypted) {
    const err = new Error("CUSTODIAL_WALLET_ALREADY_EXISTS");
    (err as Error & { code: string }).code = "CUSTODIAL_WALLET_ALREADY_EXISTS";
    throw err;
  }
  database
    .prepare(
      `UPDATE users SET
        wallet_public_key = ?,
        wallet_secret_encrypted = NULL,
        wallet_created_at = COALESCE(wallet_created_at, datetime('now')),
        wallet_link_nonce = NULL,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(walletPublicKey, userId);
  const updated = sqlRow<UserRow>(
    database.prepare(`SELECT * FROM users WHERE id = ?`).get(userId)
  )!;
  return toPublic(updated);
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

/** Credit Action Tokens from completed campaign tasks. */
export function addAcBalance(userId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return;
  getDb()
    .prepare(
      `UPDATE users SET
        ac_balance = COALESCE(ac_balance, 0) + ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(amount, userId);
}

/** Credit PT (e.g. staking claim). */
export function addPtBalance(userId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return;
  getDb()
    .prepare(
      `UPDATE users SET
        pt_balance = COALESCE(pt_balance, 0) + ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(amount, userId);
}

/** Spend Protocol Tokens at a partner (checkout simulation). */
export function spendPtBalance(userId: string, amount: number): PublicUser {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
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
  const current = row.pt_balance ?? 0;
  if (current < amount) {
    const err = new Error("INSUFFICIENT_BALANCE");
    (err as Error & { code: string }).code = "INSUFFICIENT_BALANCE";
    throw err;
  }
  database
    .prepare(
      `UPDATE users SET
        pt_balance = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(current - amount, userId);
  const updated = sqlRow<UserRow>(
    database.prepare(`SELECT * FROM users WHERE id = ?`).get(userId)
  )!;
  return toPublic(updated);
}

/** Spend AC at partner-only checkout (non-transferable elsewhere). */
export function spendAcBalance(userId: string, amount: number): PublicUser {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
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
  const ac = row.ac_balance ?? row.token_balance ?? 0;
  if (ac < amount) {
    const err = new Error("INSUFFICIENT_BALANCE");
    (err as Error & { code: string }).code = "INSUFFICIENT_BALANCE";
    throw err;
  }
  database
    .prepare(
      `UPDATE users SET
        ac_balance = ?,
        token_balance = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(ac - amount, ac - amount, userId);
  const updated = sqlRow<UserRow>(
    database.prepare(`SELECT * FROM users WHERE id = ?`).get(userId)
  )!;
  return toPublic(updated);
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
