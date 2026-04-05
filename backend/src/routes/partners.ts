import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/requireAdmin.js";
import * as partnerService from "../services/partnerService.js";

export const partnersRouter = Router();

partnersRouter.get("/", (_req, res) => {
  res.json({ partners: partnerService.listPartners() });
});

const createBody = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  solanaPoolPartnerPubkey: z.string().min(32).max(64).optional().nullable(),
});

partnersRouter.post("/", requireAdmin, (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const p = partnerService.createPartner(parsed.data);
    res.status(201).json(p);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      res.status(409).json({ error: "PARTNER_EXISTS" });
      return;
    }
    throw e;
  }
});

partnersRouter.get("/:id", (req, res) => {
  const p = partnerService.getPartner(req.params.id);
  if (!p) {
    res.status(404).json({ error: "PARTNER_NOT_FOUND" });
    return;
  }
  res.json(p);
});
