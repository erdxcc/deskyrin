import type { UserRow } from "../types.js";
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
export declare function addRewardBalance(userId: string, usdcMicro: number): void;
/** Spend from in-app reward balance (e.g. partner checkout simulation). */
export declare function spendRewardBalance(userId: string, amountMicro: number): PublicUser;
export declare function getUserById(id: string): PublicUser | null;
export declare function getUserByEmail(email: string): PublicUser | null;
export declare function getUserByExternalRef(ref: string): PublicUser | null;
export declare function getUserByIdInternal(id: string): UserRow | null;
export declare function touchUserScan(userId: string): void;
