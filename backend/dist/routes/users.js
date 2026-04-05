import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import * as userService from "../services/userService.js";
export const usersRouter = Router();
/** Профиль по id — только свой. «Текущий пользователь» — GET /api/v1/auth/me */
usersRouter.get("/:id", requireAuth, (req, res) => {
    if (req.params.id !== req.authUser.id) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
    }
    const user = userService.getUserById(req.params.id);
    if (!user) {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
    }
    res.json(user);
});
