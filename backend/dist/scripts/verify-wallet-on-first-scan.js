/**
 * After registration wallet is null; after firstScan custodial Solana pubkey exists.
 * Run from backend: npm run verify:wallet
 */
import { getDb } from "../db/connection.js";
import * as partnerService from "../services/partnerService.js";
import * as qrService from "../services/qrService.js";
import * as userService from "../services/userService.js";
async function main() {
    getDb();
    const email = `verify-${Date.now()}@example.com`;
    const password = "password123";
    const registered = userService.registerWithEmailPassword(email, password);
    if (registered.walletPublicKey !== null) {
        console.error("FAIL: walletPublicKey must be null after registration");
        process.exit(1);
    }
    const partnerId = "demo-cola";
    if (!partnerService.getPartner(partnerId)) {
        partnerService.createPartner({
            id: partnerId,
            name: "Verify script partner",
            solanaPoolPartnerPubkey: null,
        });
    }
    const bottleId = `V${Date.now()}`.slice(0, 32);
    qrService.registerQr({
        bottleId,
        partnerId,
        productName: "verify",
        rewardUsdcMicro: 1,
    });
    const { user } = await qrService.firstScan({
        bottleId,
        userId: registered.id,
    });
    if (!user.walletPublicKey || user.walletPublicKey.length < 32) {
        console.error("FAIL: valid Solana pubkey expected after firstScan");
        process.exit(1);
    }
    if (!user.walletCreatedAt) {
        console.error("FAIL: walletCreatedAt must be set");
        process.exit(1);
    }
    console.log("OK: custodial wallet created on first scan:", user.walletPublicKey);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
