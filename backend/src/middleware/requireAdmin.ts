import type { RequestHandler } from "express";
import { config } from "../config.js";

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!config.adminApiKey) {
    res.status(503).json({
      error: "ADMIN_API_KEY is not configured",
    });
    return;
  }
  const key = req.header("x-admin-key") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== config.adminApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};
