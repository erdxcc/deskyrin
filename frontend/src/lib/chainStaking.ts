import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

const DEFAULT_PROGRAM_ID = "4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi";
const PROGRAM_ID = (() => {
  const raw = import.meta.env.VITE_PROGRAM_ID;
  const val = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : DEFAULT_PROGRAM_ID;
  try {
    return new PublicKey(val);
  } catch {
    return new PublicKey(DEFAULT_PROGRAM_ID);
  }
})();
const RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const DESKYRIN_CFG_SEED = new TextEncoder().encode("deskyrin_cfg");
const STAKE_POS_SEED = new TextEncoder().encode("stake");
const PROGRAM_AUTHORITY_SEED = new TextEncoder().encode("program_authority");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

const IX_STAKE_AC_LOCKED = Uint8Array.from([25, 152, 193, 231, 28, 207, 171, 159]);
const IX_CLAIM_VESTED_PT = Uint8Array.from([251, 62, 217, 46, 49, 38, 247, 125]);
const IX_FAUCET_AC = Uint8Array.from([153, 245, 134, 115, 242, 37, 9, 182]);

/** Max raw units (6 decimals) per `faucet_ac` instruction — must match on-chain. */
export const MAX_FAUCET_AC_RAW = 100_000_000n;

export type TrackedStake = { stakeIdx: bigint; lockDays: number; createdAt: string };

export type ChainStake = {
  stakeIdx: bigint;
  acAmountBase: bigint;
  lockDays: number;
  startTs: bigint;
  maturityTs: bigint;
  totalPtBase: bigint;
  claimedPtBase: bigint;
};

export function getConnection() {
  return new Connection(RPC_URL, "confirmed");
}

export function deskyrinConfigPda() {
  return PublicKey.findProgramAddressSync([DESKYRIN_CFG_SEED], PROGRAM_ID)[0];
}

export function programAuthorityPda() {
  return PublicKey.findProgramAddressSync([PROGRAM_AUTHORITY_SEED], PROGRAM_ID)[0];
}

export function stakePositionPda(user: PublicKey, stakeIdx: bigint) {
  const idx = new Uint8Array(8);
  new DataView(idx.buffer).setBigUint64(0, stakeIdx, true);
  return PublicKey.findProgramAddressSync([STAKE_POS_SEED, user.toBytes(), idx], PROGRAM_ID)[0];
}

export function readU64LE(bytes: Uint8Array, offset: number): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
}

export async function fetchDeskyrinConfig(connection: Connection): Promise<{
  acMint: PublicKey;
  ptMint: PublicKey;
  vaultAc: PublicKey;
}> {
  const acct = await connection.getAccountInfo(deskyrinConfigPda());
  if (!acct || acct.data.length < 8 + 32 * 3) throw new Error("DESKYRIN_CONFIG_NOT_FOUND");
  const d = acct.data;
  return {
    acMint: new PublicKey(d.slice(8, 40)),
    ptMint: new PublicKey(d.slice(40, 72)),
    vaultAc: new PublicKey(d.slice(72, 104)),
  };
}

export async function fetchMintDecimals(connection: Connection, mint: PublicKey): Promise<number> {
  const info = await connection.getParsedAccountInfo(mint);
  const p = info.value?.data;
  if (!p || typeof p !== "object" || !("parsed" in p)) throw new Error("MINT_NOT_FOUND");
  const decimals = (p as any).parsed?.info?.decimals;
  if (typeof decimals !== "number") throw new Error("MINT_DECIMALS_NOT_FOUND");
  return decimals;
}

export async function fetchStake(
  connection: Connection,
  user: PublicKey,
  stakeIdx: bigint
): Promise<ChainStake | null> {
  const pda = stakePositionPda(user, stakeIdx);
  const acct = await connection.getAccountInfo(pda);
  if (!acct || acct.data.length < 91) return null;
  const d = acct.data;
  return {
    stakeIdx: readU64LE(d, 40),
    acAmountBase: readU64LE(d, 48),
    lockDays: new DataView(d.buffer, d.byteOffset + 56, 2).getUint16(0, true),
    startTs: new DataView(d.buffer, d.byteOffset + 58, 8).getBigInt64(0, true),
    maturityTs: new DataView(d.buffer, d.byteOffset + 66, 8).getBigInt64(0, true),
    totalPtBase: readU64LE(d, 74),
    claimedPtBase: readU64LE(d, 82),
  };
}

export function buildStakeIx(input: {
  user: PublicKey;
  stakeIdx: bigint;
  amountBase: bigint;
  lockDays: number;
  deskyrinConfig: PublicKey;
  stakePosition: PublicKey;
  userAcAta: PublicKey;
  vaultAc: PublicKey;
}) {
  const data = new Uint8Array(8 + 8 + 8 + 2);
  data.set(IX_STAKE_AC_LOCKED, 0);
  new DataView(data.buffer).setBigUint64(8, input.stakeIdx, true);
  new DataView(data.buffer).setBigUint64(16, input.amountBase, true);
  new DataView(data.buffer).setUint16(24, input.lockDays, true);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: input.deskyrinConfig, isSigner: false, isWritable: false },
      { pubkey: input.stakePosition, isSigner: false, isWritable: true },
      { pubkey: input.user, isSigner: true, isWritable: true },
      { pubkey: input.userAcAta, isSigner: false, isWritable: true },
      { pubkey: input.vaultAc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function buildClaimIx(input: {
  user: PublicKey;
  stakeIdx: bigint;
  deskyrinConfig: PublicKey;
  stakePosition: PublicKey;
  userPtAta: PublicKey;
  ptMint: PublicKey;
  programAuthority: PublicKey;
}) {
  const data = new Uint8Array(16);
  data.set(IX_CLAIM_VESTED_PT, 0);
  new DataView(data.buffer).setBigUint64(8, input.stakeIdx, true);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
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
    data: Buffer.from(data),
  });
}

export function buildFaucetAcIx(input: {
  user: PublicKey;
  amountRaw: bigint;
  deskyrinConfig: PublicKey;
  acMint: PublicKey;
  userAcAta: PublicKey;
  programAuthority: PublicKey;
}) {
  if (input.amountRaw <= 0n || input.amountRaw > MAX_FAUCET_AC_RAW) {
    throw new Error("FAUCET_AMOUNT_OUT_OF_RANGE");
  }
  const data = new Uint8Array(16);
  data.set(IX_FAUCET_AC, 0);
  new DataView(data.buffer).setBigUint64(8, input.amountRaw, true);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: input.deskyrinConfig, isSigner: false, isWritable: false },
      { pubkey: input.acMint, isSigner: false, isWritable: true },
      { pubkey: input.user, isSigner: true, isWritable: true },
      { pubkey: input.userAcAta, isSigner: false, isWritable: true },
      { pubkey: input.programAuthority, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function ata(owner: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

