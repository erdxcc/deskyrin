import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
export declare function deskyrinConfigPda(): PublicKey;
export declare function stakePositionPda(user: PublicKey, stakeIdx: bigint): PublicKey;
/** Build `setup_deskyrin_staking` — payer creates mints + vault + config PDA. */
export declare function buildSetupDeskyrinStakingTx(opts: {
    payer: PublicKey;
    acMint: PublicKey;
    ptMint: PublicKey;
    vaultAc: PublicKey;
    programAuthority: PublicKey;
}): Transaction;
/**
 * Build `stake_ac_locked` (matches on-chain after IDL refresh — discriminators must match build).
 * Call after minting AC to the user's ATA in the same deployment.
 */
export declare function buildStakeAcLockedIx(input: {
    user: PublicKey;
    stakeIdx: bigint;
    amount: bigint;
    lockDays: number;
    deskyrinConfig: PublicKey;
    stakePosition: PublicKey;
    userAcAta: PublicKey;
    vaultAc: PublicKey;
}): TransactionInstruction;
export declare function buildClaimVestedPtIx(input: {
    user: PublicKey;
    stakeIdx: bigint;
    deskyrinConfig: PublicKey;
    stakePosition: PublicKey;
    userPtAta: PublicKey;
    ptMint: PublicKey;
    programAuthority: PublicKey;
}): TransactionInstruction;
export declare function programAuthorityPda(): PublicKey;
/** Re-export for scripts. */
export { getConnection, getPartnerKeypair, programIdPk } from "./recyclingChain.js";
export { config } from "../config.js";
