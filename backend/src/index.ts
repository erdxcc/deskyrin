import { getDb } from "./db/connection.js";
import { createApp } from "./app.js";
import { config } from "./config.js";

getDb();

const app = createApp();
app.listen(config.port, () => {
  console.log(`Backend http://localhost:${config.port}`);
  console.log(`  GET  /health`);
  console.log(`  API  /api/v1/...`);
});
