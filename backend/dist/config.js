import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
const rootDir = path.join(__dirname, "..");
export const config = {
    port: Number(process.env.PORT) || 3001,
    /** Solana JSON-RPC (e.g. https://api.devnet.solana.com or local validator). */
    solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "",
    /** Recycling Anchor program id (default matches repo declare_id!). */
    solanaProgramId: process.env.RECYCLING_PROGRAM_ID ?? "4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi",
    /** USDC mint (same decimals as on-chain reward_amount, typically 6). */
    solanaUsdcMint: process.env.USDC_MINT ?? "",
    /** Partner/backend signer secret key as JSON byte array (same key as pool `partner` on-chain). */
    solanaPartnerKeypairJson: process.env.SOLANA_PARTNER_KEYPAIR ?? "",
    databasePath: process.env.DATABASE_PATH
        ? path.isAbsolute(process.env.DATABASE_PATH)
            ? process.env.DATABASE_PATH
            : path.join(rootDir, process.env.DATABASE_PATH)
        : path.join(rootDir, "data", "recycling.db"),
    walletEncryptionSecret: process.env.WALLET_ENCRYPTION_SECRET ?? "dev-only-insecure-secret-min-32-chars!!",
    adminApiKey: process.env.ADMIN_API_KEY ?? "",
    jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-min-32-characters!",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
};
