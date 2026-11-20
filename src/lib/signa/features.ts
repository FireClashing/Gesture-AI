/**
 * Canonical hand features (`canonical_hands_v2`, 128 values).
 *
 * This is the TypeScript twin of `ml/features.py`; tests/ts/features.test.ts
 * verifies both produce identical output on a shared fixture. See that file's
 * docstring for the design rationale.
 *
 * Layout: slot a (63) + slot b (63) + [a_present, b_present].
 */
export const INPUT_FORMAT = "canonical_hands_v2";
export const LANDMARKS = 21;
export const HAND_VALUES = LANDMARKS * 3;
export const FEATURE_COUNT = HAND_VALUES * 2 + 2;
export const SLOTS = ["a", "b"] as const;

export type Side = "Left" | "Right" | "Unknown";
export type Point = { x: number; y: number; z: number };
export type HandObservation = { landmarks: Point[]; side: Side };
export type HandCountLabel = "None" | "One" | "Both";

export type FeatureResult = {
  features: number[];
  handCount: number;
  handLabel: HandCountLabel;
  /** Handedness labels in slot order, e.g. "Left", "Right" or "Left+Right". */
  sides: string;
};

export function featureColumns(): string[] {
  const cols: string[] = [];
  for (const slot of SLOTS) {
    for (let i = 0; i < LANDMARKS; i++) {
      for (const axis of ["x", "y", "z"]) cols.push(`${slot}_${axis}${i}`);
    }
  }
  for (const slot of SLOTS) cols.push(`${slot}_present`);
  return cols;
}

/** Wrist-relative, scale-normalised landmarks; "Left" hands are mirrored. */
export function normalizeHand(landmarks: Point[], side: Side): number[] {
  if (landmarks.length !== LANDMARKS) {
    throw new Error(`Expected ${LANDMARKS} landmarks, received ${landmarks.length}.`);
  }
  const wrist = landmarks[0];
  const rel = landmarks.map((p) => ({ x: p.x - wrist.x, y: p.y - wrist.y, z: p.z - wrist.z }));
  const scale = Math.max(Math.max(...rel.map((p) => Math.hypot(p.x, p.y, p.z))), 1e-6);
  const mirror = side === "Left" ? -1 : 1;
  const out: number[] = [];
  for (const p of rel) out.push((p.x / scale) * mirror, p.y / scale, p.z / scale);
  return out;
}

export function buildFeatures(hands: HandObservation[]): FeatureResult {
  const ordered = hands
    .slice(0, 2)
    .sort((a, b) => a.landmarks[0].x - b.landmarks[0].x); // stable in modern engines
  const features = new Array<number>(FEATURE_COUNT).fill(0);
  ordered.forEach((hand, slot) => {
    features.splice(slot * HAND_VALUES, HAND_VALUES, ...normalizeHand(hand.landmarks, hand.side));
    features[HAND_VALUES * 2 + slot] = 1;
  });
  const handCount = ordered.length;
  return {
    features,
    handCount,
    handLabel: handCount === 0 ? "None" : handCount === 1 ? "One" : "Both",
    sides: ordered.map((h) => h.side).join("+") || "None",
  };
}
