import type { RequestHandler } from "express";
import * as authService from "../services/authService.js";

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Нужен заголовок Authorization: Bearer <token>" });
    return;
  }
  try {
    const { id, email } = authService.verifyAccessToken(token);
    req.authUser = { id, email };
    next();
  } catch {
    res.status(401).json({ error: "INVALID_TOKEN" });
  }
};
