// Copies the backend seed file into the frontend as the offline fallback catalog.
// The landing page renders this data first (and in the prerendered HTML), then
// replaces it with live data from GET /api/v1/catalog when the API answers.
import { copyFileSync, existsSync } from "node:fs";
const src = new URL("../../backend/app/seed/catalog.seed.json", import.meta.url);
const dst = new URL("../src/data/catalog.fallback.json", import.meta.url);
if (existsSync(src)) { copyFileSync(src, dst); console.log("sync-seed: fallback catalog updated"); }
else console.log("sync-seed: backend seed not found (frontend-only build) — keeping existing fallback");
