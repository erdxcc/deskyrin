import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { LOCK_DAY_OPTIONS } from "../services/stakingCurve.js";
import * as stakingService from "../services/stakingService.js";
export const tokensRouter = Router();
tokensRouter.get("/stake-options", (_req, res) => {
    res.json({
        lockDays: [...LOCK_DAY_OPTIONS],
        curve: "Total PT at maturity scales with lock length (7d→1.10× … 90d→2.75× AC). Vesting is linear over the lock period.",
    });
});
const stakeBody = z.object({
    amountAc: z.number().int().positive(),
    lockDays: z.number().int().refine((n) => [7, 14, 30, 60, 90].includes(n), "Use 7, 14, 30, 60, or 90"),
});
tokensRouter.get("/stakes", requireAuth, (req, res) => {
    const stakes = stakingService.listStakes(req.authUser.id);
    res.json({ stakes });
});
tokensRouter.post("/stake", requireAuth, (req, res, next) => {
    const parsed = stakeBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const out = stakingService.createStake(req.authUser.id, parsed.data.amountAc, parsed.data.lockDays);
        res.status(201).json(out);
    }
    catch (e) {
        const code = e.code;
        if (code === "INSUFFICIENT_BALANCE" || code === "INVALID_LOCK_DAYS") {
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
tokensRouter.post("/stakes/:stakeId/claim", requireAuth, (req, res, next) => {
    try {
        const out = stakingService.claimStake(req.authUser.id, req.params.stakeId);
        res.json(out);
    }
    catch (e) {
        const code = e.code;
        if (code === "STAKE_NOT_FOUND") {
            res.status(404).json({ error: code });
            return;
        }
        if (code === "NOTHING_TO_CLAIM") {
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
