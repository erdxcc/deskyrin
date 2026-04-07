import type { UserRow } from "../types.js";
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
export declare function registerWithEmailPassword(email: string, password: string): PublicUser;
export declare function verifyCredentials(email: string, password: string): PublicUser | null;
/**
 * Ensures custodial Solana keypair exists.
 * `walletCreatedThisSession` is true only when a new wallet was written this call.
 */
export declare function ensureCustodialWallet(userId: string): {
    user: PublicUser;
    walletCreatedThisSession: boolean;
};
export declare function issueWalletLinkChallenge(userId: string): {
    nonce: string;
    message: string;
};
export declare function linkExternalWallet(userId: string, walletPublicKey: string, nonce: string): PublicUser;
export declare function addRewardBalance(userId: string, usdcMicro: number): void;
/** Credit Action Tokens from completed campaign tasks. */
export declare function addAcBalance(userId: string, amount: number): void;
/** Credit PT (e.g. staking claim). */
export declare function addPtBalance(userId: string, amount: number): void;
/** Spend Protocol Tokens at a partner (checkout simulation). */
export declare function spendPtBalance(userId: string, amount: number): PublicUser;
/** Spend AC at partner-only checkout (non-transferable elsewhere). */
export declare function spendAcBalance(userId: string, amount: number): PublicUser;
/** Spend from in-app reward balance (e.g. partner checkout simulation). */
export declare function spendRewardBalance(userId: string, amountMicro: number): PublicUser;
export declare function getUserById(id: string): PublicUser | null;
export declare function getUserByEmail(email: string): PublicUser | null;
export declare function getUserByExternalRef(ref: string): PublicUser | null;
export declare function getUserByIdInternal(id: string): UserRow | null;
export declare function touchUserScan(userId: string): void;
