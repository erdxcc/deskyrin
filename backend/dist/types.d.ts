/** Stored in SQLite (`recycled` kept for CHECK constraint; API maps to `utilized`). */
export type QrStatus = "registered" | "minted" | "recycled" | "void";
/** What clients see for bottle status after return flow. */
export type PublicQrStatus = "registered" | "minted" | "utilized" | "void";
export type ScanEventType = "first_scan" | "recycle_requested" | "recycle_confirmed" | "admin_note";
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
    wallet_link_nonce?: string | null;
    reward_balance_usdc_micro?: number | null;
    /** Legacy; migrated into ac_balance. */
    token_balance?: number | null;
    /** Action Tokens — from campaigns; non-transferable in product rules; stake → PT. */
    ac_balance?: number | null;
    /** Protocol Tokens — from staking AC; spendable / withdrawable (MVP ledger). */
    pt_balance?: number | null;
}
export interface CampaignRow {
    id: string;
    partner_id: string;
    title: string;
    description: string | null;
    influencer_name: string;
    partner_ad_note: string | null;
    created_at: string;
}
export interface CampaignTaskRow {
    id: string;
    campaign_id: string;
    title: string;
    description: string | null;
    target_count: number;
    token_reward: number;
    sort_order: number;
    created_at: string;
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
