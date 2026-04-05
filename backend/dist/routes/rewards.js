import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import * as partnerService from "../services/partnerService.js";
import * as userService from "../services/userService.js";
export const rewardsRouter = Router();
const redeemBody = z.object({
    partnerId: z.string().min(1).max(64),
    amountUsdcMicro: z.number().int().positive(),
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
        const user = userService.spendRewardBalance(req.authUser.id, parsed.data.amountUsdcMicro);
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
