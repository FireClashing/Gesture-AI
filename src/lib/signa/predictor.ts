import { CONFIG } from "./config";
import { FEATURE_COUNT, INPUT_FORMAT } from "./features";
import { parseModel, predictGesture, type MlpModel } from "./mlp";
import type { Prediction } from "./types";

export type Backend = "browser" | "api";
export type Predictor = {
  backend: Backend;
  description: string;
  predict: (features: number[]) => Promise<Prediction>;
};

let modelPromise: Promise<MlpModel> | null = null;

function loadBrowserModel(): Promise<MlpModel> {
  modelPromise ??= fetch(CONFIG.browserModelUrl, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`Browser model not found (${res.status}). Run \`npm run train\`.`);
      return res.json();
    })
    .then((raw) => parseModel(raw, { inputFormat: INPUT_FORMAT, featureCount: FEATURE_COUNT }))
    .catch((error) => {
      modelPromise = null; // allow a retry after retraining
      throw error;
    });
  return modelPromise;
}

function isPrediction(value: unknown): value is Prediction {
  const v = value as Prediction;
  return !!v && typeof v.gesture === "string" && typeof v.confidence === "number";
}

async function predictViaApi(features: number[]): Promise<Prediction> {
  const response = await fetch(`${CONFIG.apiUrl}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    const detail = await response.json().then((j) => j?.detail).catch(() => null);
    throw new Error(`API error ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const data: unknown = await response.json();
  if (!isPrediction(data)) throw new Error("API returned an unexpected response.");
  return { ...data, scores: data.scores ?? {} };
}

/** Pick the inference backend according to NEXT_PUBLIC_INFERENCE (default: auto). */
export async function createPredictor(): Promise<Predictor> {
  if (CONFIG.inference !== "api") {
    try {
      const model = await loadBrowserModel();
      return {
        backend: "browser",
        description: `In-browser model (${model.labels.join(", ")})`,
        predict: async (features) => predictGesture(model, features, CONFIG.confidenceThreshold),
      };
    } catch (error) {
      if (CONFIG.inference === "browser") throw error;
    }
  }
  return {
    backend: "api",
    description: `API at ${CONFIG.apiUrl}`,
    predict: predictViaApi,
  };
}

export type BackendStatus = { backend: Backend; ok: boolean; title: string; detail: string };

/** Used by the sidebar so the status indicator reflects reality instead of a hard-coded dot. */
export async function getBackendStatus(): Promise<BackendStatus> {
  if (CONFIG.inference !== "api") {
    try {
      const model = await loadBrowserModel();
      return { backend: "browser", ok: true, title: "In-browser model", detail: `${model.labels.length} labels · no server needed` };
    } catch (error) {
      if (CONFIG.inference === "browser") {
        return { backend: "browser", ok: false, title: "Model missing", detail: (error as Error).message };
      }
    }
  }
  try {
    const res = await fetch(`${CONFIG.apiUrl}/health`, { signal: AbortSignal.timeout(2500) });
    const data = await res.json();
    if (data.model_loaded) {
      return { backend: "api", ok: true, title: "API connected", detail: `${CONFIG.apiUrl} · ${data.gestures?.length ?? "?"} labels` };
    }
    return { backend: "api", ok: false, title: "API has no model", detail: data.error ?? "Run `npm run train`." };
  } catch {
    return { backend: "api", ok: false, title: "API offline", detail: `Start it with \`npm run api\` (${CONFIG.apiUrl}).` };
  }
}
