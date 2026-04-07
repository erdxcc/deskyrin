/**
 * Seed demo partners, QR codes, and campaigns. Run: npm run db:seed (from backend).
 */
import { getDb } from "../db/connection.js";
import { config } from "../config.js";
import * as campaignService from "../services/campaignService.js";
import * as partnerService from "../services/partnerService.js";
import * as qrService from "../services/qrService.js";

getDb();

const partnerSolanaPk =
  process.env.SOLANA_PARTNER_PUBKEY?.trim() || null;

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
  {
    id: "demo-gym",
    name: "FitLab Gym",
    solanaPoolPartnerPubkey: null,
  },
] as const;

for (const p of DEMO_PARTNERS) {
  if (!partnerService.getPartner(p.id)) {
    partnerService.createPartner({
      id: p.id,
      name: p.name,
      solanaPoolPartnerPubkey: p.solanaPoolPartnerPubkey,
    });
    console.log("Partner created:", p.id);
  } else {
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

campaignService.seedCampaignIfMissing({
  id: "demo-fitlab-3-visits",
  partnerId: "demo-gym",
  title: "Train with us — 3 visits",
  description:
    "Influencer-led drop: complete the visit streak at FitLab and earn partner-backed tokens.",
  influencerName: "Alex Rivera",
  partnerAdNote: "Reward pool funded by FitLab’s local ad spend.",
  tasks: [
    {
      id: "task-demo-gym-visits",
      title: "Visit FitLab",
      description: "Check in at the partner location (demo: tap once per visit).",
      targetCount: 3,
      tokenReward: 50,
      sortOrder: 0,
    },
  ],
});
console.log("Campaign seeded: demo-fitlab-3-visits (if new)");

console.log("Seed done. WALLET_ENCRYPTION_SECRET length:", config.walletEncryptionSecret.length);
