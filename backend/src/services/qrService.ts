import { Keypair, PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { sqlParams, sqlRow, sqlRows } from "../db/cast.js";
import { getDb } from "../db/connection.js";
import type { PublicQrStatus, QrCodeRow, QrStatus } from "../types.js";
import {
  getPartnerKeypair,
  isSolanaConfigured,
  mintBottleOnChain,
  recycleBottleOnChain,
} from "../solana/recyclingChain.js";
import * as partnerService from "./partnerService.js";
import * as userService from "./userService.js";

/**
 * Stand-in for an on-chain mint tx until Anchor RPC signing is wired here.
 * Produces plausible-looking credentials for the DB / demo flow.
 */
function syntheticMintCredentials(): { bottleMintPubkey: string; txSignature: string } {
  const bottleMintPubkey = Keypair.generate().publicKey.toBase58();
  const txSignature = Buffer.from(randomBytes(64)).toString("base64url");
  return { bottleMintPubkey, txSignature };
}

export interface PublicQr {
  bottleId: string;
  partnerId: string;
  status: PublicQrStatus;
  productName: string | null;
  rewardUsdcMicro: number;
  metadataUri: string | null;
  assignedUserId: string | null;
  bottleMintPubkey: string | null;
  mintTxSignature: string | null;
  recycleTxSignature: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapPublicStatus(rowStatus: string): PublicQrStatus {
  if (rowStatus === "recycled") return "utilized";
  return rowStatus as PublicQrStatus;
}

function toPublic(row: QrCodeRow): PublicQr {
  return {
    bottleId: row.bottle_id,
    partnerId: row.partner_id,
    status: mapPublicStatus(row.status),
    productName: row.product_name,
    rewardUsdcMicro: row.reward_usdc_micro,
    metadataUri: row.metadata_uri,
    assignedUserId: row.assigned_user_id,
    bottleMintPubkey: row.bottle_mint_pubkey,
    mintTxSignature: row.mint_tx_signature,
    recycleTxSignature: row.recycle_tx_signature,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerQr(input: {
  bottleId: string;
  partnerId: string;
  productName?: string | null;
  rewardUsdcMicro?: number;
  metadataUri?: string | null;
}): PublicQr {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO qr_codes (bottle_id, partner_id, status, product_name, reward_usdc_micro, metadata_uri)
       VALUES (?, ?, 'registered', ?, ?, ?)`
    )
    .run(
      input.bottleId,
      input.partnerId,
      input.productName ?? null,
      input.rewardUsdcMicro ?? 0,
      input.metadataUri ?? null
    );
  const row = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  )!;
  return toPublic(row);
}

export function getQr(bottleId: string): PublicQr | null {
  const row = sqlRow<QrCodeRow>(
    getDb().prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(bottleId)
  );
  return row ? toPublic(row) : null;
}

export function listQr(filter?: {
  partnerId?: string;
  status?: QrStatus | PublicQrStatus;
}): PublicQr[] {
  const database = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter?.partnerId) {
    clauses.push(`partner_id = ?`);
    params.push(filter.partnerId);
  }
  if (filter?.status) {
    const dbStatus =
      filter.status === "utilized" ? ("recycled" as QrStatus) : filter.status;
    clauses.push(`status = ?`);
    params.push(dbStatus);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const stmt = database.prepare(
    `SELECT * FROM qr_codes ${where} ORDER BY created_at DESC`
  );
  const rows = sqlRows<QrCodeRow>(
    params.length ? stmt.all(...sqlParams(params)) : stmt.all()
  );
  return rows.map(toPublic);
}

function logEvent(
  bottleId: string,
  eventType: string,
  userId: string | null,
  payload: unknown,
  fingerprint?: string | null
) {
  getDb()
    .prepare(
      `INSERT INTO scan_events (id, bottle_id, user_id, event_type, payload_json, client_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      uuidv4(),
      bottleId,
      userId,
      eventType,
      JSON.stringify(payload),
      fingerprint ?? null
    );
}

function assertPartnerSolanaMatchesChain(partnerId: string): void {
  if (!isSolanaConfigured()) return;
  const p = partnerService.getPartner(partnerId);
  if (!p?.solanaPoolPartnerPubkey?.trim()) {
    const err = new Error("PARTNER_SOLANA_NOT_CONFIGURED");
    (err as Error & { code: string }).code = "PARTNER_SOLANA_NOT_CONFIGURED";
    throw err;
  }
  const partnerPk = getPartnerKeypair().publicKey.toBase58();
  if (p.solanaPoolPartnerPubkey !== partnerPk) {
    const err = new Error("PARTNER_KEY_MISMATCH");
    (err as Error & { code: string }).code = "PARTNER_KEY_MISMATCH";
    throw err;
  }
}

/**
 * First customer scan (JWT user): custodial wallet, assign QR, mint bottle NFT on Solana when configured (else synthetic DB mint).
 */
export async function firstScan(input: {
  bottleId: string;
  userId: string;
  clientFingerprint?: string | null;
}): Promise<{
  user: userService.PublicUser;
  qr: PublicQr;
  onChainMint: boolean;
  walletCreatedThisSession: boolean;
}> {
  const database = getDb();
  const qrRow = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  );
  if (!qrRow) {
    const err = new Error("QR_NOT_FOUND");
    (err as Error & { code: string }).code = "QR_NOT_FOUND";
    throw err;
  }

  if (qrRow.status === "minted") {
    if (qrRow.assigned_user_id !== input.userId) {
      const err = new Error("QR_NOT_AVAILABLE_FOR_FIRST_SCAN");
      (err as Error & { code: string }).code = "QR_NOT_AVAILABLE_FOR_FIRST_SCAN";
      throw err;
    }
    const user = userService.getUserById(input.userId);
    if (!user) {
      const err = new Error("USER_NOT_FOUND");
      (err as Error & { code: string }).code = "USER_NOT_FOUND";
      throw err;
    }
    return {
      user,
      qr: toPublic(qrRow),
      onChainMint: isSolanaConfigured(),
      walletCreatedThisSession: false,
    };
  }

  if (qrRow.status !== "registered") {
    const err = new Error("QR_NOT_AVAILABLE_FOR_FIRST_SCAN");
    (err as Error & { code: string }).code = "QR_NOT_AVAILABLE_FOR_FIRST_SCAN";
    throw err;
  }

  if (
    qrRow.assigned_user_id &&
    qrRow.assigned_user_id !== input.userId
  ) {
    const err = new Error("ALREADY_ASSIGNED_OTHER_USER");
    (err as Error & { code: string }).code = "ALREADY_ASSIGNED_OTHER_USER";
    throw err;
  }

  const user = userService.getUserById(input.userId);
  if (!user) {
    const err = new Error("USER_NOT_FOUND");
    (err as Error & { code: string }).code = "USER_NOT_FOUND";
    throw err;
  }
  const walletCreatedThisSession = false;

  if (!qrRow.assigned_user_id) {
    database
      .prepare(
        `UPDATE qr_codes SET assigned_user_id = ?, updated_at = datetime('now') WHERE bottle_id = ?`
      )
      .run(user.id, input.bottleId);
    userService.touchUserScan(user.id);
    logEvent(
      input.bottleId,
      "first_scan",
      user.id,
      { userId: user.id },
      input.clientFingerprint
    );
  }

  let bottleMintPubkey: string;
  let txSignature: string;
  let onChainMint = false;

  if (isSolanaConfigured()) {
    assertPartnerSolanaMatchesChain(qrRow.partner_id);
    if (!user.walletPublicKey) {
      const err = new Error("NO_WALLET_FOR_CHAIN");
      (err as Error & { code: string }).code = "NO_WALLET_FOR_CHAIN";
      throw err;
    }
    try {
      const { bottleMint, signature } = await mintBottleOnChain({
        bottleId: input.bottleId,
        rewardUsdcMicro: BigInt(qrRow.reward_usdc_micro),
        name: qrRow.product_name ?? "Bottle",
        uri: qrRow.metadata_uri ?? "",
        custodialUserPubkey: new PublicKey(user.walletPublicKey!),
      });
      bottleMintPubkey = bottleMint.publicKey.toBase58();
      txSignature = signature;
      onChainMint = true;
    } catch (e: unknown) {
      const wrapped = new Error(
        e instanceof Error ? e.message : "Solana mint failed"
      );
      (wrapped as Error & { code: string }).code = "CHAIN_TX_FAILED";
      throw wrapped;
    }
  } else {
    const syn = syntheticMintCredentials();
    bottleMintPubkey = syn.bottleMintPubkey;
    txSignature = syn.txSignature;
  }

  const qrMinted = confirmMint({
    bottleId: input.bottleId,
    userId: user.id,
    bottleMintPubkey,
    txSignature,
  });

  return {
    user,
    qr: qrMinted,
    onChainMint,
    walletCreatedThisSession,
  };
}

/**
 * Scan / hackathon demo button: utilized + ledger credit only — never touches Solana
 * (avoids PARTNER_SOLANA_NOT_CONFIGURED when env is half-configured).
 */
export function completeRecycleDemo(input: { bottleId: string }): PublicQr {
  const database = getDb();
  const row = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  );
  if (!row) {
    const err = new Error("QR_NOT_FOUND");
    (err as Error & { code: string }).code = "QR_NOT_FOUND";
    throw err;
  }
  if (row.status !== "minted") {
    const err = new Error("NOT_MINTED");
    (err as Error & { code: string }).code = "NOT_MINTED";
    throw err;
  }

  const owner = row.assigned_user_id
    ? userService.getUserById(row.assigned_user_id)
    : null;
  if (!owner?.walletPublicKey) {
    const err = new Error("NO_CUSTODIAL_WALLET");
    (err as Error & { code: string }).code = "NO_CUSTODIAL_WALLET";
    throw err;
  }

  logEvent(input.bottleId, "recycle_requested", row.assigned_user_id, {
    source: "demo_recycle_db_only",
  });

  const sig = Buffer.from(randomBytes(64)).toString("base64url");
  return confirmRecycle({ bottleId: input.bottleId, txSignature: sig });
}

/**
 * Return flow: on-chain recycle when Solana is configured, else same as demo DB path.
 * Prefer for automation routes; use {@link completeRecycleDemo} for the in-app demo button.
 */
export async function completeRecycleWithChain(input: {
  bottleId: string;
}): Promise<PublicQr> {
  const database = getDb();
  const row = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  );
  if (!row) {
    const err = new Error("QR_NOT_FOUND");
    (err as Error & { code: string }).code = "QR_NOT_FOUND";
    throw err;
  }
  if (row.status !== "minted") {
    const err = new Error("NOT_MINTED");
    (err as Error & { code: string }).code = "NOT_MINTED";
    throw err;
  }

  const owner = row.assigned_user_id
    ? userService.getUserById(row.assigned_user_id)
    : null;
  if (!owner?.walletPublicKey) {
    const err = new Error("NO_CUSTODIAL_WALLET");
    (err as Error & { code: string }).code = "NO_CUSTODIAL_WALLET";
    throw err;
  }

  logEvent(input.bottleId, "recycle_requested", row.assigned_user_id, {
    source: "demo_recycle",
  });

  if (!isSolanaConfigured()) {
    const sig = Buffer.from(randomBytes(64)).toString("base64url");
    return confirmRecycle({ bottleId: input.bottleId, txSignature: sig });
  }

  if (!row.bottle_mint_pubkey?.trim()) {
    const err = new Error("MISSING_MINT_PUBKEY");
    (err as Error & { code: string }).code = "MISSING_MINT_PUBKEY";
    throw err;
  }

  assertPartnerSolanaMatchesChain(row.partner_id);

  let signature: string;
  try {
    const out = await recycleBottleOnChain({
      bottleId: input.bottleId,
      bottleMintPubkey: new PublicKey(row.bottle_mint_pubkey),
      custodialUserPubkey: new PublicKey(owner.walletPublicKey),
    });
    signature = out.signature;
  } catch (e: unknown) {
    const wrapped = new Error(
      e instanceof Error ? e.message : "Solana recycle failed"
    );
    (wrapped as Error & { code: string }).code = "CHAIN_TX_FAILED";
    throw wrapped;
  }

  return confirmRecycle({ bottleId: input.bottleId, txSignature: signature });
}

export function confirmMint(input: {
  bottleId: string;
  userId: string;
  bottleMintPubkey: string;
  txSignature: string;
}): PublicQr {
  const database = getDb();
  const row = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  );
  if (!row) {
    const err = new Error("QR_NOT_FOUND");
    (err as Error & { code: string }).code = "QR_NOT_FOUND";
    throw err;
  }
  if (row.assigned_user_id !== input.userId) {
    const err = new Error("USER_MISMATCH");
    (err as Error & { code: string }).code = "USER_MISMATCH";
    throw err;
  }
  if (row.status !== "registered") {
    const err = new Error("INVALID_STATUS_FOR_MINT");
    (err as Error & { code: string }).code = "INVALID_STATUS_FOR_MINT";
    throw err;
  }

  database
    .prepare(
      `UPDATE qr_codes SET
        status = 'minted',
        bottle_mint_pubkey = ?,
        mint_tx_signature = ?,
        updated_at = datetime('now')
       WHERE bottle_id = ?`
    )
    .run(input.bottleMintPubkey, input.txSignature, input.bottleId);

  logEvent(input.bottleId, "admin_note", input.userId, {
    kind: "mint_confirmed",
    tx: input.txSignature,
  });

  const out = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  )!;
  return toPublic(out);
}

export function recycleRequested(input: {
  bottleId: string;
  clientFingerprint?: string | null;
}): PublicQr {
  const database = getDb();
  const row = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  );
  if (!row) {
    const err = new Error("QR_NOT_FOUND");
    (err as Error & { code: string }).code = "QR_NOT_FOUND";
    throw err;
  }
  if (row.status !== "minted") {
    const err = new Error("NOT_MINTED");
    (err as Error & { code: string }).code = "NOT_MINTED";
    throw err;
  }
  logEvent(
    input.bottleId,
    "recycle_requested",
    row.assigned_user_id,
    {},
    input.clientFingerprint
  );
  return toPublic(row);
}

export function confirmRecycle(input: {
  bottleId: string;
  txSignature: string;
}): PublicQr {
  const database = getDb();
  const row = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  );
  if (!row) {
    const err = new Error("QR_NOT_FOUND");
    (err as Error & { code: string }).code = "QR_NOT_FOUND";
    throw err;
  }
  if (row.status !== "minted") {
    const err = new Error("NOT_MINTED");
    (err as Error & { code: string }).code = "NOT_MINTED";
    throw err;
  }

  database
    .prepare(
      `UPDATE qr_codes SET
        status = 'recycled',
        recycle_tx_signature = ?,
        updated_at = datetime('now')
       WHERE bottle_id = ?`
    )
    .run(input.txSignature, input.bottleId);

  if (row.assigned_user_id) {
    userService.addRewardBalance(row.assigned_user_id, row.reward_usdc_micro);
  }

  logEvent(input.bottleId, "recycle_confirmed", row.assigned_user_id, {
    tx: input.txSignature,
  });

  const out = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(input.bottleId)
  )!;
  return toPublic(out);
}

export function voidQr(bottleId: string): PublicQr | null {
  const database = getDb();
  const row = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(bottleId)
  );
  if (!row) return null;
  database
    .prepare(
      `UPDATE qr_codes SET status = 'void', updated_at = datetime('now') WHERE bottle_id = ?`
    )
    .run(bottleId);
  const out = sqlRow<QrCodeRow>(
    database.prepare(`SELECT * FROM qr_codes WHERE bottle_id = ?`).get(bottleId)
  )!;
  return toPublic(out);
}
