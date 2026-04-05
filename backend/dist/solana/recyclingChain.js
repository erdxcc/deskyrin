import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction, } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { config } from "../config.js";
/**
 * Builds Anchor instructions for `recycling_program` (discriminators + Borsh args).
 * Prerequisites on the cluster: program deployed; partner has called `fund_reward_pool`
 * so `pool_state` exists; partner keypair matches DB `solana_pool_partner_pubkey`.
 */
const PROGRAM_AUTHORITY_SEED = Buffer.from("program_authority");
const POOL_STATE_SEED = Buffer.from("pool_state");
const BOTTLE_SEED = Buffer.from("bottle");
const BOTTLE_ESCROW_SEED = Buffer.from("bottle_escrow");
function ixDiscriminator(name) {
    const h = createHash("sha256").update(`global:${name}`).digest();
    return Buffer.from(h.subarray(0, 8));
}
function borshString(s) {
    const utf = Buffer.from(s, "utf8");
    const n = Buffer.alloc(4);
    n.writeUInt32LE(utf.length, 0);
    return Buffer.concat([n, utf]);
}
function borshU64(n) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(n, 0);
    return b;
}
let partnerKeypairCache = null;
export function isSolanaConfigured() {
    const rpc = config.solanaRpcUrl?.trim();
    const usdc = config.solanaUsdcMint?.trim();
    const kp = config.solanaPartnerKeypairJson?.trim();
    return Boolean(rpc && usdc && kp);
}
export function getPartnerKeypair() {
    if (partnerKeypairCache)
        return partnerKeypairCache;
    const raw = config.solanaPartnerKeypairJson.trim();
    if (!raw) {
        const err = new Error("SOLANA_PARTNER_KEYPAIR missing");
        err.code = "SOLANA_NOT_CONFIGURED";
        throw err;
    }
    const arr = JSON.parse(raw);
    partnerKeypairCache = Keypair.fromSecretKey(Uint8Array.from(arr));
    return partnerKeypairCache;
}
export function programIdPk() {
    return new PublicKey(config.solanaProgramId);
}
export function getConnection() {
    return new Connection(config.solanaRpcUrl.trim(), "confirmed");
}
export async function mintBottleOnChain(input) {
    const connection = getConnection();
    const programId = programIdPk();
    const partner = getPartnerKeypair();
    const bottleMint = Keypair.generate();
    const [programAuthority] = PublicKey.findProgramAddressSync([PROGRAM_AUTHORITY_SEED], programId);
    const [poolState] = PublicKey.findProgramAddressSync([POOL_STATE_SEED, partner.publicKey.toBuffer()], programId);
    const [bottleRecord] = PublicKey.findProgramAddressSync([BOTTLE_SEED, Buffer.from(input.bottleId, "utf8")], programId);
    const [bottleEscrow] = PublicKey.findProgramAddressSync([BOTTLE_ESCROW_SEED, bottleMint.publicKey.toBuffer()], programId);
    const escrowBottleAta = getAssociatedTokenAddressSync(bottleMint.publicKey, bottleEscrow, true);
    const data = Buffer.concat([
        ixDiscriminator("mint_bottle_nft"),
        borshString(input.bottleId),
        borshU64(input.rewardUsdcMicro),
        borshString(input.name),
        borshString(input.uri),
        input.custodialUserPubkey.toBuffer(),
    ]);
    const keys = [
        { pubkey: poolState, isSigner: false, isWritable: true },
        { pubkey: bottleRecord, isSigner: false, isWritable: true },
        { pubkey: bottleMint.publicKey, isSigner: true, isWritable: true },
        { pubkey: bottleEscrow, isSigner: false, isWritable: false },
        { pubkey: escrowBottleAta, isSigner: false, isWritable: true },
        { pubkey: programAuthority, isSigner: false, isWritable: false },
        { pubkey: partner.publicKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    const ix = new TransactionInstruction({
        keys,
        programId,
        data,
    });
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [partner, bottleMint], { commitment: "confirmed" });
    return { bottleMint, signature };
}
export async function recycleBottleOnChain(input) {
    const connection = getConnection();
    const programId = programIdPk();
    const usdcMint = new PublicKey(config.solanaUsdcMint.trim());
    const partner = getPartnerKeypair();
    const [programAuthority] = PublicKey.findProgramAddressSync([PROGRAM_AUTHORITY_SEED], programId);
    const [poolState] = PublicKey.findProgramAddressSync([POOL_STATE_SEED, partner.publicKey.toBuffer()], programId);
    const [bottleRecord] = PublicKey.findProgramAddressSync([BOTTLE_SEED, Buffer.from(input.bottleId, "utf8")], programId);
    const [bottleEscrow] = PublicKey.findProgramAddressSync([BOTTLE_ESCROW_SEED, input.bottleMintPubkey.toBuffer()], programId);
    const escrowBottleAta = getAssociatedTokenAddressSync(input.bottleMintPubkey, bottleEscrow, true);
    const userUsdcAta = getAssociatedTokenAddressSync(usdcMint, input.custodialUserPubkey, false);
    const rewardPoolUsdc = getAssociatedTokenAddressSync(usdcMint, programAuthority, true);
    const data = Buffer.concat([
        ixDiscriminator("recycle_bottle"),
        borshString(input.bottleId),
    ]);
    const keys = [
        { pubkey: poolState, isSigner: false, isWritable: true },
        { pubkey: bottleRecord, isSigner: false, isWritable: true },
        { pubkey: input.bottleMintPubkey, isSigner: false, isWritable: true },
        { pubkey: bottleEscrow, isSigner: false, isWritable: true },
        { pubkey: escrowBottleAta, isSigner: false, isWritable: true },
        { pubkey: input.custodialUserPubkey, isSigner: false, isWritable: false },
        { pubkey: userUsdcAta, isSigner: false, isWritable: true },
        { pubkey: rewardPoolUsdc, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: programAuthority, isSigner: false, isWritable: false },
        { pubkey: partner.publicKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    const ix = new TransactionInstruction({
        keys,
        programId,
        data,
    });
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [partner], {
        commitment: "confirmed",
    });
    return { signature };
}
