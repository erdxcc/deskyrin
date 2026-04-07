/**
 * Instruction builders for `setup_deskyrin_staking`, `stake_ac_locked`, `claim_vested_pt`.
 * Deploy the updated program, run `setup_deskyrin_staking` once, then wire custodial txs from here.
 */
import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, } from "@solana/spl-token";
import { programIdPk } from "./recyclingChain.js";
const PROGRAM_AUTHORITY_SEED = Buffer.from("program_authority");
const DESKYRIN_CFG_SEED = Buffer.from("deskyrin_cfg");
const STAKE_POS_SEED = Buffer.from("stake");
function ixDiscriminator(name) {
    const h = createHash("sha256").update(`global:${name}`).digest();
    return Buffer.from(h.subarray(0, 8));
}
function u64LE(n) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(n, 0);
    return b;
}
export function deskyrinConfigPda() {
    const [pda] = PublicKey.findProgramAddressSync([DESKYRIN_CFG_SEED], programIdPk());
    return pda;
}
export function stakePositionPda(user, stakeIdx) {
    const idxBuf = Buffer.alloc(8);
    idxBuf.writeBigUInt64LE(stakeIdx, 0);
    const [pda] = PublicKey.findProgramAddressSync([STAKE_POS_SEED, user.toBuffer(), idxBuf], programIdPk());
    return pda;
}
/** Build `setup_deskyrin_staking` — payer creates mints + vault + config PDA. */
export function buildSetupDeskyrinStakingTx(opts) {
    const data = ixDiscriminator("setup_deskyrin_staking");
    const keys = [
        { pubkey: opts.payer, isSigner: true, isWritable: true },
        { pubkey: deskyrinConfigPda(), isSigner: false, isWritable: true },
        { pubkey: opts.acMint, isSigner: false, isWritable: true },
        { pubkey: opts.ptMint, isSigner: false, isWritable: true },
        { pubkey: opts.vaultAc, isSigner: false, isWritable: true },
        { pubkey: opts.programAuthority, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    return new Transaction().add(new TransactionInstruction({
        programId: programIdPk(),
        keys,
        data,
    }));
}
/**
 * Build `stake_ac_locked` (matches on-chain after IDL refresh — discriminators must match build).
 * Call after minting AC to the user's ATA in the same deployment.
 */
export function buildStakeAcLockedIx(input) {
    const data = Buffer.concat([
        ixDiscriminator("stake_ac_locked"),
        u64LE(input.stakeIdx),
        u64LE(input.amount),
        Buffer.from([input.lockDays & 0xff, (input.lockDays >> 8) & 0xff]),
    ]);
    return new TransactionInstruction({
        programId: programIdPk(),
        keys: [
            { pubkey: input.deskyrinConfig, isSigner: false, isWritable: false },
            { pubkey: input.stakePosition, isSigner: false, isWritable: true },
            { pubkey: input.user, isSigner: true, isWritable: true },
            { pubkey: input.userAcAta, isSigner: false, isWritable: true },
            { pubkey: input.vaultAc, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });
}
export function buildClaimVestedPtIx(input) {
    const data = Buffer.concat([
        ixDiscriminator("claim_vested_pt"),
        u64LE(input.stakeIdx),
    ]);
    return new TransactionInstruction({
        programId: programIdPk(),
        keys: [
            { pubkey: input.deskyrinConfig, isSigner: false, isWritable: false },
            { pubkey: input.stakePosition, isSigner: false, isWritable: true },
            { pubkey: input.user, isSigner: true, isWritable: true },
            { pubkey: input.userPtAta, isSigner: false, isWritable: true },
            { pubkey: input.ptMint, isSigner: false, isWritable: true },
            { pubkey: input.programAuthority, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });
}
export function programAuthorityPda() {
    const [pda] = PublicKey.findProgramAddressSync([PROGRAM_AUTHORITY_SEED], programIdPk());
    return pda;
}
/** Re-export for scripts. */
export { getConnection, getPartnerKeypair, programIdPk } from "./recyclingChain.js";
export { config } from "../config.js";
