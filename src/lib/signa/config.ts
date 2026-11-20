/**
 * Runtime configuration. Everything can be overridden with NEXT_PUBLIC_* env
 * variables (see .env.example). NEXT_PUBLIC_* values are inlined at build time,
 * so each one must be referenced literally.
 */
const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};

/** Must equal the installed @mediapipe/tasks-vision version (pinned in package.json). */
export const MEDIAPIPE_VERSION = "1.2.3";

export type InferenceMode = "auto" | "browser" | "api";
const mode = process.env.NEXT_PUBLIC_INFERENCE;

export const CONFIG = {
  /** auto = use the in-browser model if public/models/gesture-model.json exists, else the API. */
  inference: (mode === "browser" || mode === "api" ? mode : "auto") as InferenceMode,
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, ""),
  browserModelUrl: "/models/gesture-model.json",
  /** Predictions below this confidence are shown as UNKNOWN. Keep in sync with SIGNA_CONFIDENCE_THRESHOLD. */
  confidenceThreshold: num(process.env.NEXT_PUBLIC_CONFIDENCE_THRESHOLD, 0.65),
  /** Minimum time between predictions, per backend. */
  predictionIntervalMs: {
    browser: num(process.env.NEXT_PUBLIC_BROWSER_PREDICTION_INTERVAL_MS, 100),
    api: num(process.env.NEXT_PUBLIC_API_PREDICTION_INTERVAL_MS, 300),
  },
  /** Majority-vote smoothing (votes needed out of the last `window` predictions). */
  smoothing: {
    browser: { window: 5, minVotes: 3 },
    api: { window: 3, minVotes: 2 },
  },
  detectionFps: 30,
  mediapipe: {
    // Self-hosted by `npm run setup:assets` (runs on install). CDN values are fallbacks only.
    wasmPath: process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_URL || "/mediapipe/wasm",
    modelPath: process.env.NEXT_PUBLIC_HAND_MODEL_URL || "/models/hand_landmarker.task",
    fallbackWasmPath: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
    fallbackModelPath:
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
} as const;
