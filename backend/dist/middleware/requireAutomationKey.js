import { config } from "../config.js";
export const requireAutomationKey = (req, res, next) => {
    const expected = config.automationApiKey.trim();
    if (!expected) {
        res.status(503).json({ error: "AUTOMATION_DISABLED" });
        return;
    }
    const header = req.headers["x-automation-key"];
    const fromHeader = typeof header === "string" ? header : header?.[0];
    const fromBody = req.body && typeof req.body === "object" && "automationKey" in req.body
        ? String(req.body.automationKey ?? "")
        : "";
    const key = fromHeader || fromBody;
    if (key !== expected) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
    }
    next();
};
