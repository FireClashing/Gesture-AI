#!/usr/bin/env node
/**
 * Self-host MediaPipe so the app works offline and never drifts from the
 * installed package version:
 *   1. copies node_modules/@mediapipe/tasks-vision/wasm -> public/mediapipe/wasm
 *   2. downloads hand_landmarker.task -> public/models/ (skipped if present)
 *
 * Never fails the install: without network the app falls back to the pinned CDN.
 * Usage: node scripts/setup-mediapipe-assets.mjs [--quiet] [--force]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");
const force = process.argv.includes("--force");
const log = (...a) => !quiet && console.log("[signa assets]", ...a);
const warn = (...a) => console.warn("[signa assets]", ...a);

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// 1. WASM runtime ---------------------------------------------------------
const pkgDir = join(root, "node_modules", "@mediapipe", "tasks-vision");
if (existsSync(join(pkgDir, "wasm"))) {
  const installed = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
  const config = readFileSync(join(root, "src/lib/signa/config.ts"), "utf8");
  const pinned = /MEDIAPIPE_VERSION\s*=\s*"([^"]+)"/.exec(config)?.[1];
  if (pinned && pinned !== installed) {
    warn(`MEDIAPIPE_VERSION (${pinned}) in config.ts differs from the installed version (${installed}). Update config.ts.`);
  }
  mkdirSync(join(root, "public/mediapipe"), { recursive: true });
  cpSync(join(pkgDir, "wasm"), join(root, "public/mediapipe/wasm"), { recursive: true });
  log(`copied WASM runtime (v${installed})`);
} else {
  warn("@mediapipe/tasks-vision is not installed yet; run `npm install` first.");
}

// 2. Hand landmarker model ------------------------------------------------
const modelPath = join(root, "public/models/hand_landmarker.task");
if (existsSync(modelPath) && statSync(modelPath).size > 1_000_000 && !force) {
  log("hand_landmarker.task already present");
} else {
  try {
    const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 1_000_000) throw new Error(`unexpectedly small download (${bytes.length} bytes)`);
    mkdirSync(dirname(modelPath), { recursive: true });
    writeFileSync(modelPath, bytes);
    log(`downloaded hand_landmarker.task (${(bytes.length / 1e6).toFixed(1)} MB)`);
  } catch (error) {
    warn(`could not download hand_landmarker.task (${error.message}). The app will fall back to the CDN until you run \`npm run setup:assets\` with network access.`);
  }
}
