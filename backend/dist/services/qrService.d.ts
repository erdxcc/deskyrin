import type { PublicQrStatus, QrStatus } from "../types.js";
import * as userService from "./userService.js";
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
export declare function registerQr(input: {
    bottleId: string;
    partnerId: string;
    productName?: string | null;
    rewardUsdcMicro?: number;
    metadataUri?: string | null;
}): PublicQr;
export declare function getQr(bottleId: string): PublicQr | null;
export declare function listQr(filter?: {
    partnerId?: string;
    status?: QrStatus | PublicQrStatus;
}): PublicQr[];
/**
 * First customer scan (JWT user): custodial wallet, assign QR, mint bottle NFT on Solana when configured (else synthetic DB mint).
 */
export declare function firstScan(input: {
    bottleId: string;
    userId: string;
    clientFingerprint?: string | null;
}): Promise<{
    user: userService.PublicUser;
    qr: PublicQr;
    onChainMint: boolean;
    walletCreatedThisSession: boolean;
}>;
/**
 * Scan / hackathon demo button: utilized + ledger credit only — never touches Solana
 * (avoids PARTNER_SOLANA_NOT_CONFIGURED when env is half-configured).
 */
export declare function completeRecycleDemo(input: {
    bottleId: string;
}): PublicQr;
/**
 * Return flow: on-chain recycle when Solana is configured, else same as demo DB path.
 * Prefer for automation routes; use {@link completeRecycleDemo} for the in-app demo button.
 */
export declare function completeRecycleWithChain(input: {
    bottleId: string;
}): Promise<PublicQr>;
export declare function confirmMint(input: {
    bottleId: string;
    userId: string;
    bottleMintPubkey: string;
    txSignature: string;
}): PublicQr;
export declare function recycleRequested(input: {
    bottleId: string;
    clientFingerprint?: string | null;
}): PublicQr;
export declare function confirmRecycle(input: {
    bottleId: string;
    txSignature: string;
}): PublicQr;
export declare function voidQr(bottleId: string): PublicQr | null;
