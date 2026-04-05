import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { demoRouter } from "./routes/demo.js";
import { eventsRouter } from "./routes/events.js";
import { partnersRouter } from "./routes/partners.js";
import { qrRouter } from "./routes/qr.js";
import { rewardsRouter } from "./routes/rewards.js";
import { usersRouter } from "./routes/users.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "512kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/partners", partnersRouter);
  app.use("/api/v1/qr", qrRouter);
  app.use("/api/v1/events", eventsRouter);
  app.use("/api/v1/demo", demoRouter);
  app.use("/api/v1/rewards", rewardsRouter);

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  );

  return app;
}
