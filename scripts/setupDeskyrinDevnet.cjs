const fs = require("fs");
const crypto = require("crypto");
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} = require("@solana/spl-token");

async function main() {
  const rpc = "https://api.devnet.solana.com";
  const conn = new Connection(rpc, "confirmed");
  const programId = new PublicKey("4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi");

  const keypairPath =
    process.env.SOLANA_KEYPAIR_PATH ||
    "./scripts/solana-id.json";
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
  );

  const [deskyrinConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("deskyrin_cfg")],
    programId
  );
  const existing = await conn.getAccountInfo(deskyrinConfig);
  if (existing) {
    console.log("deskyrin_config already exists:", deskyrinConfig.toBase58());
    return;
  }

  const [programAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_authority")],
    programId
  );

  const acMint = Keypair.generate();
  const ptMint = Keypair.generate();
  const vaultAc = getAssociatedTokenAddressSync(acMint.publicKey, programAuthority, true);

  const discriminator = crypto
    .createHash("sha256")
    .update("global:setup_deskyrin_staking")
    .digest()
    .subarray(0, 8);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: deskyrinConfig, isSigner: false, isWritable: true },
      { pubkey: acMint.publicKey, isSigner: true, isWritable: true },
      { pubkey: ptMint.publicKey, isSigner: true, isWritable: true },
      { pubkey: vaultAc, isSigner: false, isWritable: true },
      { pubkey: programAuthority, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(discriminator),
  });

  const sig = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(ix),
    [payer, acMint, ptMint],
    { commitment: "confirmed" }
  );

  console.log("setup signature:", sig);
  console.log("deskyrin_config:", deskyrinConfig.toBase58());
  console.log("ac_mint:", acMint.publicKey.toBase58());
  console.log("pt_mint:", ptMint.publicKey.toBase58());
  console.log("vault_ac:", vaultAc.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

