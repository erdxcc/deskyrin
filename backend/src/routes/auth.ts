import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import * as authService from "../services/authService.js";
import * as userService from "../services/userService.js";

export const authRouter = Router();

const emailPassword = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

authRouter.post("/register", (req, res) => {
  const parsed = emailPassword.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const out = authService.register(parsed.data.email, parsed.data.password);
    res.status(201).json(out);
  } catch (e: unknown) {
    if ((e as Error & { code?: string }).code === "EMAIL_TAKEN") {
      res.status(409).json({ error: "EMAIL_TAKEN" });
      return;
    }
    throw e;
  }
});

authRouter.post("/login", (req, res) => {
  const parsed = emailPassword.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const out = authService.login(parsed.data.email, parsed.data.password);
    res.json(out);
  } catch (e: unknown) {
    if ((e as Error & { code?: string }).code === "INVALID_CREDENTIALS") {
      res.status(401).json({ error: "INVALID_CREDENTIALS" });
      return;
    }
    throw e;
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = userService.getUserById(req.authUser!.id);
  if (!user) {
    res.status(404).json({ error: "USER_NOT_FOUND" });
    return;
  }
  res.json(user);
});
