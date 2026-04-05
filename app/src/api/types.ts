export interface User {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  lastScanAt: string | null;
  externalRef: string | null;
  walletPublicKey: string | null;
  walletCreatedAt: string | null;
  /** USDC micro-units (6 decimals) — reward balance after returns. */
  rewardBalanceUsdcMicro: number;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  expiresIn: string;
  tokenType: string;
}

export interface QrPublic {
  bottleId: string;
  partnerId: string;
  status: string;
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

export interface FirstScanResponse {
  user: User;
  qr: QrPublic;
  hint?: string;
  /** True when the server sent a real Solana mint transaction. */
  onChainMint?: boolean;
  /** True when a custodial wallet was created on this request — show payout once. */
  walletCreatedThisSession?: boolean;
}

export interface PublicPartner {
  id: string;
  name: string;
  solanaPoolPartnerPubkey: string | null;
  createdAt: string;
}
