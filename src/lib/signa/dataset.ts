import { FEATURE_COUNT, featureColumns } from "./features.ts";

export const META_COLUMNS = ["label", "hand", "signer", "timestamp", "session_id"] as const;

export type GestureSample = {
  label: string;
  hand: string;
  signer: string;
  features: number[];
  timestamp: string;
  session_id: string;
};

/** A short motion recording (one canonical feature vector per frame). */
export type MotionClip = {
  label: string;
  signer: string;
  session_id: string;
  timestamp: string;
  fps: number;
  frames: number[][];
};

/** Free-text signer names end up in CSV cells: strip formula prefixes and control characters. */
export function cleanSigner(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f"]/g, "").trim().replace(/^[=+\-@]+/, "").slice(0, 40);
  return cleaned || "signer-1";
}

const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function csvHeader(): string[] {
  return [...META_COLUMNS, ...featureColumns()];
}

export function buildCsv(samples: GestureSample[]): string {
  for (const s of samples) {
    if (s.features.length !== FEATURE_COUNT) {
      throw new Error(`Sample ${s.label} has ${s.features.length} features, expected ${FEATURE_COUNT}.`);
    }
  }
  const rows = samples.map((s) =>
    [s.label, s.hand, s.signer, s.timestamp, s.session_id, ...s.features].map(quote).join(","),
  );
  return [csvHeader().map(quote).join(","), ...rows].join("\n");
}

export function buildClipsJsonl(clips: MotionClip[]): string {
  return clips.map((c) => JSON.stringify(c)).join("\n") + "\n";
}
