export declare const config: {
    port: number;
    /** Solana JSON-RPC (e.g. https://api.devnet.solana.com or local validator). */
    solanaRpcUrl: string;
    /** Recycling Anchor program id (default matches repo declare_id!). */
    solanaProgramId: string;
    /** USDC mint (same decimals as on-chain reward_amount, typically 6). */
    solanaUsdcMint: string;
    /** Partner/backend signer secret key as JSON byte array (same key as pool `partner` on-chain). */
    solanaPartnerKeypairJson: string;
    databasePath: string;
    walletEncryptionSecret: string;
    adminApiKey: string;
    jwtSecret: string;
    jwtExpiresIn: string;
};
