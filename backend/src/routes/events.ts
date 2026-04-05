import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import * as qrService from "../services/qrService.js";

export const eventsRouter = Router();

const firstScanBody = z.object({
  bottleId: z.string().min(1).max(32),
  clientFingerprint: z.string().max(512).optional().nullable(),
});

eventsRouter.post("/first-scan", requireAuth, async (req, res, next) => {
  const parsed = firstScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await qrService.firstScan({
      bottleId: parsed.data.bottleId,
      userId: req.authUser!.id,
      clientFingerprint: parsed.data.clientFingerprint,
    });
    res.json({
      ...result,
      hint: result.onChainMint
        ? "Bottle NFT minted on Solana; USDC reward is paid when the return station completes recycle."
        : "Solana not configured on the server — mint is recorded in the database only (demo mode).",
    });
  } catch (e: unknown) {
    const code = (e as Error & { code?: string }).code;
    if (code === "QR_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "QR_NOT_AVAILABLE_FOR_FIRST_SCAN") {
      res.status(409).json({ error: code });
      return;
    }
    if (code === "USER_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "ALREADY_ASSIGNED_OTHER_USER") {
      res.status(409).json({ error: code });
      return;
    }
    if (code === "PARTNER_SOLANA_NOT_CONFIGURED" || code === "PARTNER_KEY_MISMATCH") {
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

const mintConfirmedBody = z.object({
  bottleId: z.string().min(1).max(32),
  bottleMintPubkey: z.string().min(32).max(64),
  txSignature: z.string().min(32).max(128),
});

eventsRouter.post("/mint-confirmed", requireAuth, (req, res) => {
  const parsed = mintConfirmedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const qr = qrService.confirmMint({
      ...parsed.data,
      userId: req.authUser!.id,
    });
    res.json(qr);
  } catch (e: unknown) {
    const code = (e as Error & { code?: string }).code;
    if (code === "QR_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "USER_MISMATCH" || code === "INVALID_STATUS_FOR_MINT") {
      res.status(409).json({ error: code });
      return;
    }
    throw e;
  }
});

const recycleRequestBody = z.object({
  bottleId: z.string().min(1).max(32),
  clientFingerprint: z.string().max(512).optional().nullable(),
});

eventsRouter.post("/recycle-request", (req, res) => {
  const parsed = recycleRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const qr = qrService.recycleRequested(parsed.data);
    res.json({
      qr,
      hint: "After mint, the Scan page demo button calls POST /api/v1/demo/recycle with the same bottle id.",
    });
  } catch (e: unknown) {
    const code = (e as Error & { code?: string }).code;
    if (code === "QR_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "NOT_MINTED") {
      res.status(409).json({ error: code });
      return;
    }
    throw e;
  }
});

const recycleConfirmedBody = z.object({
  bottleId: z.string().min(1).max(32),
  txSignature: z.string().min(32).max(128),
});

eventsRouter.post("/recycle-confirmed", (req, res) => {
  const parsed = recycleConfirmedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const qr = qrService.confirmRecycle(parsed.data);
    res.json(qr);
  } catch (e: unknown) {
    const code = (e as Error & { code?: string }).code;
    if (code === "QR_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "NOT_MINTED") {
      res.status(409).json({ error: code });
      return;
    }
    throw e;
  }
});
