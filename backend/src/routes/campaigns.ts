import { Router } from "express";
import * as authService from "../services/authService.js";
import * as campaignService from "../services/campaignService.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const campaignsRouter = Router();

function optionalUserId(req: { header: (n: string) => string | undefined }): string | null {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;
  try {
    return authService.verifyAccessToken(token).id;
  } catch {
    return null;
  }
}

campaignsRouter.get("/", (_req, res) => {
  res.json({ campaigns: campaignService.listCampaigns() });
});

campaignsRouter.post("/tasks/:taskId/record-step", requireAuth, (req, res, next) => {
  try {
    const out = campaignService.recordTaskStep(req.authUser!.id, req.params.taskId);
    res.json(out);
  } catch (e: unknown) {
    const code = (e as Error & { code?: string }).code;
    if (code === "TASK_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "TASK_ALREADY_COMPLETED") {
      res.status(409).json({ error: code });
      return;
    }
    if (code === "USER_NOT_FOUND" || code === "CAMPAIGN_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    next(e);
  }
});

campaignsRouter.get("/:campaignId", (req, res) => {
  const userId = optionalUserId(req);
  const detail = campaignService.getCampaignDetail(req.params.campaignId, userId);
  if (!detail) {
    res.status(404).json({ error: "CAMPAIGN_NOT_FOUND" });
    return;
  }
  res.json(detail);
});
