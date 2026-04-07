import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App";
import "./index.css";

// Solana client libs require Buffer in browser runtime.
if (!(globalThis as { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
