/** Stored in SQLite (`recycled` kept for CHECK constraint; API maps to `utilized`). */
export type QrStatus = "registered" | "minted" | "recycled" | "void";

/** What clients see for bottle status after return flow. */
export type PublicQrStatus = "registered" | "minted" | "utilized" | "void";

export type ScanEventType =
  | "first_scan"
  | "recycle_requested"
  | "recycle_confirmed"
  | "admin_note";

export interface PartnerRow {
  id: string;
  name: string;
  solana_pool_partner_pubkey: string | null;
  created_at: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  last_scan_at: string | null;
  external_ref: string | null;
  wallet_public_key: string | null;
  wallet_secret_encrypted: string | null;
  wallet_created_at: string | null;
  reward_balance_usdc_micro?: number | null;
}

export interface QrCodeRow {
  bottle_id: string;
  partner_id: string;
  status: QrStatus;
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
