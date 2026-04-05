import { Router } from "express";
import { z } from "zod";
import { requireAutomationKey } from "../middleware/requireAutomationKey.js";
import * as qrService from "../services/qrService.js";
export const automationRouter = Router();
const recycleBody = z.object({
    bottleId: z.string().min(1).max(32),
});
/**
 * Return-station / kiosk: burn bottle token on-chain, pay USDC to custodial user, update QR status.
 */
automationRouter.post("/recycle", requireAutomationKey, async (req, res, next) => {
    const parsed = recycleBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const qr = await qrService.completeRecycleWithChain({
            bottleId: parsed.data.bottleId,
        });
        res.json({ qr });
    }
    catch (e) {
        const code = e.code;
        if (code === "QR_NOT_FOUND") {
            res.status(404).json({ error: code });
            return;
        }
        if (code === "NOT_MINTED" || code === "MISSING_MINT_PUBKEY") {
            res.status(409).json({ error: code });
            return;
        }
        if (code === "NO_CUSTODIAL_WALLET") {
            res.status(409).json({ error: code });
            return;
        }
        if (code === "SOLANA_NOT_CONFIGURED" ||
            code === "PARTNER_SOLANA_NOT_CONFIGURED" ||
            code === "PARTNER_KEY_MISMATCH") {
            res.status(503).json({ error: code });
            return;
        }
        if (code === "CHAIN_TX_FAILED") {
            res.status(502).json({
                error: code,
                message: e instanceof Error ? e.message : String(e),
            });
            return;
        }
        next(e);
    }
});
