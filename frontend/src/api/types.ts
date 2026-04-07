export interface User {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  lastScanAt: string | null;
  externalRef: string | null;
  walletPublicKey: string | null;
  walletCustodial: boolean;
  walletCreatedAt: string | null;
  /** Legacy USDC ledger (bottle flows). */
  rewardBalanceUsdcMicro: number;
  /** Action Tokens — from campaigns; stake to receive PT. */
  acBalance: number;
  /** Protocol Tokens — from staking AC; spend at partners / withdraw (MVP). */
  ptBalance: number;
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
  onChainMint?: boolean;
  walletCreatedThisSession?: boolean;
}

export interface PublicPartner {
  id: string;
  name: string;
  solanaPoolPartnerPubkey: string | null;
  createdAt: string;
}

export interface CampaignSummary {
  id: string;
  partnerId: string;
  partnerName: string;
  title: string;
  description: string | null;
  influencerName: string;
  partnerAdNote: string | null;
  createdAt: string;
  taskCount: number;
}

export interface CampaignTask {
  id: string;
  title: string;
  description: string | null;
  targetCount: number;
  /** AC credited when the task is fully completed. */
  acReward: number;
  progressCount: number;
  completed: boolean;
}

export interface CampaignDetail extends CampaignSummary {
  tasks: CampaignTask[];
}

export interface RecordTaskStepResponse {
  user: User;
  campaign: CampaignDetail;
  awardedAc: number;
}

export interface StakePosition {
  id: string;
  stakeIdx: number;
  acAmount: number;
  lockDays: number;
  startedAt: string;
  maturityAt: string;
  totalPtEntitled: number;
  claimedPt: number;
  claimablePtNow: number;
  fullyVested: boolean;
}

export interface CreateStakeResponse {
  stake: StakePosition;
  user: User;
}

export interface ClaimStakeResponse {
  user: User;
  claimedPt: number;
  stake: StakePosition;
}
