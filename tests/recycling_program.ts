import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("recycling_program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.RecyclingProgram as Program;

  let usdcMint: anchor.web3.PublicKey;
  let partnerUsdcAta: anchor.web3.PublicKey;
  let rewardPoolUsdc: anchor.web3.PublicKey;
  let programAuthority: anchor.web3.PublicKey;
  let poolState: anchor.web3.PublicKey;

  before(async () => {
    usdcMint = await createMint(
      provider.connection,
      provider.wallet as anchor.Wallet,
      provider.wallet.publicKey,
      null,
      6
    );
    [programAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("program_authority")],
      program.programId
    );
    rewardPoolUsdc = await getAssociatedTokenAddress(
      usdcMint,
      programAuthority,
      true
    );
    partnerUsdcAta = await getAssociatedTokenAddress(
      usdcMint,
      provider.wallet.publicKey
    );
    [poolState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool_state"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Partner funds reward pool", async () => {
    await mintTo(
      provider.connection,
      provider.wallet as anchor.Wallet,
      usdcMint,
      partnerUsdcAta,
      provider.wallet.publicKey,
      100_000_000
    );

    await program.methods
      .fundRewardPool(new anchor.BN(50_000_000))
      .accounts({
        poolState,
        partnerUsdcAccount: partnerUsdcAta,
        rewardPoolUsdc,
        usdcMint,
        programAuthority,
        partner: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const pool = await program.account.poolState.fetch(poolState);
    if (!pool.totalDeposited.eq(new anchor.BN(50_000_000))) {
      throw new Error("pool deposit mismatch");
    }
  });

  it("Mint to escrow, recycle with backend-only signature, USDC to custodial wallet", async () => {
    const custodialUser = anchor.web3.Keypair.generate();
    const bottleId = "BOTTLE_001";
    const bottleMint = anchor.web3.Keypair.generate();

    const [bottleRecord] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bottle"), Buffer.from(bottleId)],
      program.programId
    );
    const [bottleEscrow] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bottle_escrow"), bottleMint.publicKey.toBuffer()],
      program.programId
    );
    const escrowBottleAta = await getAssociatedTokenAddress(
      bottleMint.publicKey,
      bottleEscrow,
      true
    );

    await program.methods
      .mintBottleNft(
        bottleId,
        new anchor.BN(1_000_000),
        "Coca-Cola 0.5L",
        "https://ipfs.io/ipfs/YOUR_METADATA_HASH",
        custodialUser.publicKey
      )
      .accounts({
        poolState,
        bottleRecord,
        bottleMint: bottleMint.publicKey,
        bottleEscrow,
        escrowBottleAta,
        programAuthority,
        backendSigner: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bottleMint])
      .rpc();

    const escrowAcc = await getAccount(provider.connection, escrowBottleAta);
    if (escrowAcc.amount !== 1n) {
      throw new Error("expected 1 bottle token in escrow");
    }

    const userUsdcAta = await getAssociatedTokenAddress(
      usdcMint,
      custodialUser.publicKey
    );

    await program.methods
      .recycleBottle(bottleId)
      .accounts({
        poolState,
        bottleRecord,
        bottleMint: bottleMint.publicKey,
        bottleEscrow,
        escrowBottleAta,
        custodialUser: custodialUser.publicKey,
        userUsdcAta,
        rewardPoolUsdc,
        usdcMint,
        programAuthority,
        backendSigner: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const br = await program.account.bottleRecord.fetch(bottleRecord);
    if (!br.isRecycled) {
      throw new Error("expected recycled");
    }

    const usdcAcc = await getAccount(provider.connection, userUsdcAta);
    if (usdcAcc.amount !== 1_000_000n) {
      throw new Error("expected 1 USDC reward on custodial ATA");
    }
  });
});
