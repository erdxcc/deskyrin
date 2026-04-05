import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/requireAdmin.js";
import * as qrService from "../services/qrService.js";
export const qrRouter = Router();
qrRouter.get("/", (req, res) => {
    const partnerId = typeof req.query.partnerId === "string" ? req.query.partnerId : undefined;
    const status = typeof req.query.status === "string"
        ? req.query.status
        : undefined;
    const list = qrService.listQr({ partnerId, status });
    res.json({ items: list, count: list.length });
});
qrRouter.get("/:bottleId", (req, res) => {
    const qr = qrService.getQr(req.params.bottleId);
    if (!qr) {
        res.status(404).json({ error: "QR_NOT_FOUND" });
        return;
    }
    res.json(qr);
});
const registerBody = z.object({
    bottleId: z.string().min(1).max(32),
    partnerId: z.string().min(1).max(64),
    productName: z.string().max(256).optional().nullable(),
    rewardUsdcMicro: z.number().int().nonnegative().optional(),
    metadataUri: z.string().max(512).optional().nullable(),
});
qrRouter.post("/", requireAdmin, (req, res) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const qr = qrService.registerQr(parsed.data);
        res.status(201).json(qr);
    }
    catch (e) {
        if (e instanceof Error && e.message.includes("UNIQUE")) {
            res.status(409).json({ error: "BOTTLE_ID_EXISTS" });
            return;
        }
        throw e;
    }
});
const voidBody = z.object({}).optional();
qrRouter.post("/:bottleId/void", requireAdmin, (req, res) => {
    void voidBody.safeParse(req.body);
    const qr = qrService.voidQr(req.params.bottleId);
    if (!qr) {
        res.status(404).json({ error: "QR_NOT_FOUND" });
        return;
    }
    res.json(qr);
});
