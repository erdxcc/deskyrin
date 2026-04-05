/**
 * Seed demo partners + QR codes. Run: npm run db:seed (from backend).
 */
import { getDb } from "../db/connection.js";
import { config } from "../config.js";
import * as partnerService from "../services/partnerService.js";
import * as qrService from "../services/qrService.js";
getDb();
const partnerSolanaPk = process.env.SOLANA_PARTNER_PUBKEY?.trim() || null;
const DEMO_PARTNERS = [
    {
        id: "demo-cola",
        name: "Cola",
        solanaPoolPartnerPubkey: partnerSolanaPk,
    },
    {
        id: "demo-oasis",
        name: "Oasis Water",
        solanaPoolPartnerPubkey: null,
    },
    {
        id: "demo-volt",
        name: "Volt Energy",
        solanaPoolPartnerPubkey: null,
    },
];
for (const p of DEMO_PARTNERS) {
    if (!partnerService.getPartner(p.id)) {
        partnerService.createPartner({
            id: p.id,
            name: p.name,
            solanaPoolPartnerPubkey: p.solanaPoolPartnerPubkey,
        });
        console.log("Partner created:", p.id);
    }
    else {
        console.log("Partner exists:", p.id);
        partnerService.ensurePartnerName(p.id, p.name);
        if (p.id === "demo-cola" && partnerSolanaPk) {
            partnerService.setPartnerSolanaPubkey(p.id, partnerSolanaPk);
            console.log("Updated demo-cola Solana pubkey from SOLANA_PARTNER_PUBKEY");
        }
    }
}
const PARTNER_ID = "demo-cola";
for (let i = 1; i <= 5; i++) {
    const bottleId = `BOTTLE_${String(i).padStart(3, "0")}`;
    if (qrService.getQr(bottleId)) {
        console.log("QR skip (exists):", bottleId);
        continue;
    }
    qrService.registerQr({
        bottleId,
        partnerId: PARTNER_ID,
        productName: `Demo drink #${i}`,
        rewardUsdcMicro: 1_000_000,
        metadataUri: "https://example.com/meta/" + bottleId,
    });
    console.log("QR registered:", bottleId);
}
console.log("Seed done. WALLET_ENCRYPTION_SECRET length:", config.walletEncryptionSecret.length);
