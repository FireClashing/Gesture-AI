import type { Prediction } from "./types.ts";

export type Activation = "relu" | "tanh" | "logistic" | "identity" | "softmax";

export type MlpModel = {
  format: "signa-mlp-v1";
  inputFormat: string;
  featureCount: number;
  labels: string[];
  scaler: { mean: number[]; scale: number[] };
  layers: { w: number[][]; b: number[]; activation: Activation }[];
  trainedAt?: string;
};

const ACTIVATIONS: Activation[] = ["relu", "tanh", "logistic", "identity", "softmax"];

/** Validate JSON exported by ml/train.py before trusting it. */
export function parseModel(raw: unknown, expected: { inputFormat: string; featureCount: number }): MlpModel {
  const m = raw as MlpModel;
  if (!m || m.format !== "signa-mlp-v1") throw new Error("Unsupported model file format.");
  if (m.inputFormat !== expected.inputFormat || m.featureCount !== expected.featureCount) {
    throw new Error(`Model expects ${m.inputFormat}/${m.featureCount}, app uses ${expected.inputFormat}/${expected.featureCount}. Retrain with \`npm run train\`.`);
  }
  if (!Array.isArray(m.labels) || m.labels.length < 2) throw new Error("Model has no labels.");
  if (m.scaler.mean.length !== m.featureCount || m.scaler.scale.length !== m.featureCount) {
    throw new Error("Scaler size does not match feature count.");
  }
  let width = m.featureCount;
  for (const layer of m.layers) {
    if (!ACTIVATIONS.includes(layer.activation)) throw new Error(`Unknown activation ${layer.activation}.`);
    if (layer.w.length !== width || layer.w.some((row) => row.length !== layer.b.length)) {
      throw new Error("Layer dimensions are inconsistent.");
    }
    width = layer.b.length;
  }
  if (!(width === m.labels.length || (width === 1 && m.labels.length === 2))) {
    throw new Error("Output size does not match labels.");
  }
  return m;
}

function activate(z: number[], kind: Activation): number[] {
  switch (kind) {
    case "relu": return z.map((v) => Math.max(0, v));
    case "tanh": return z.map(Math.tanh);
    case "logistic": return z.map((v) => 1 / (1 + Math.exp(-v)));
    case "identity": return z;
    case "softmax": {
      const max = Math.max(...z);
      const e = z.map((v) => Math.exp(v - max));
      const sum = e.reduce((a, b) => a + b, 0);
      return e.map((v) => v / sum);
    }
  }
}

export function predictProba(model: MlpModel, features: number[]): number[] {
  if (features.length !== model.featureCount) {
    throw new Error(`Expected ${model.featureCount} features, received ${features.length}.`);
  }
  let h = features.map((v, i) => (v - model.scaler.mean[i]) / model.scaler.scale[i]);
  for (const layer of model.layers) {
    const out = layer.b.slice();
    for (let i = 0; i < h.length; i++) {
      const hi = h[i];
      if (hi === 0) continue;
      const row = layer.w[i];
      for (let j = 0; j < out.length; j++) out[j] += hi * row[j];
    }
    h = activate(out, layer.activation);
  }
  return h.length === 1 ? [1 - h[0], h[0]] : h;
}

export function predictGesture(model: MlpModel, features: number[], threshold: number): Prediction {
  const proba = predictProba(model, features);
  const order = proba.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
  const [confidence, best] = order[0];
  const scores: Record<string, number> = {};
  for (const [p, i] of order.slice(0, 3)) scores[model.labels[i]] = Math.round(p * 1e4) / 1e4;
  return {
    gesture: confidence >= threshold ? model.labels[best] : "UNKNOWN",
    confidence: Math.round(confidence * 1e4) / 1e4,
    scores,
  };
}
