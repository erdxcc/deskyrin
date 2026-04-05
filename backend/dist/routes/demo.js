import { Router } from "express";
import { z } from "zod";
import * as qrService from "../services/qrService.js";
export const demoRouter = Router();
const recycleBody = z.object({
    bottleId: z.string().min(1).max(32),
});
/**
 * MVP: imitates a return-station scan — DB utilized + in-app ledger (no Solana).
 */
demoRouter.post("/recycle", (req, res, next) => {
    const parsed = recycleBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const qr = qrService.completeRecycleDemo({
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
        next(e);
    }
});
