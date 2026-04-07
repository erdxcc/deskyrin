import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import * as partnerService from "../services/partnerService.js";
import * as userService from "../services/userService.js";
export const rewardsRouter = Router();
const redeemBody = z.object({
    partnerId: z.string().min(1).max(64),
    /** Protocol Tokens (liquid) to spend at checkout. */
    amountPt: z.number().int().positive(),
});
const redeemAcBody = z.object({
    partnerId: z.string().min(1).max(64),
    amountAc: z.number().int().positive(),
});
rewardsRouter.post("/redeem-ac", requireAuth, (req, res, next) => {
    const parsed = redeemAcBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const partner = partnerService.getPartner(parsed.data.partnerId);
    if (!partner) {
        res.status(404).json({ error: "PARTNER_NOT_FOUND" });
        return;
    }
    try {
        const user = userService.spendAcBalance(req.authUser.id, parsed.data.amountAc);
        res.json({ user });
    }
    catch (e) {
        const code = e.code;
        if (code === "INSUFFICIENT_BALANCE" || code === "INVALID_AMOUNT") {
            res.status(409).json({ error: code });
            return;
        }
        if (code === "USER_NOT_FOUND") {
            res.status(404).json({ error: code });
            return;
        }
        next(e);
    }
});
rewardsRouter.post("/redeem", requireAuth, (req, res, next) => {
    const parsed = redeemBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const partner = partnerService.getPartner(parsed.data.partnerId);
    if (!partner) {
        res.status(404).json({ error: "PARTNER_NOT_FOUND" });
        return;
    }
    try {
        const user = userService.spendPtBalance(req.authUser.id, parsed.data.amountPt);
        res.json({ user });
    }
    catch (e) {
        const code = e.code;
        if (code === "INSUFFICIENT_BALANCE" || code === "INVALID_AMOUNT") {
            res.status(409).json({ error: code });
            return;
        }
        if (code === "USER_NOT_FOUND") {
            res.status(404).json({ error: code });
            return;
        }
        next(e);
    }
});
