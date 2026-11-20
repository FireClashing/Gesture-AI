import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { csvHeader } from "../../src/lib/signa/dataset.ts";
import { buildFeatures, featureColumns, FEATURE_COUNT, INPUT_FORMAT, LANDMARKS, SLOTS, type HandObservation } from "../../src/lib/signa/features.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"));
const schema = read("src/data/feature-schema.json");
const fixture = read("tests/fixtures/features.json");

test("constants match the shared schema", () => {
  assert.equal(INPUT_FORMAT, schema.inputFormat);
  assert.equal(FEATURE_COUNT, schema.featureCount);
  assert.equal(LANDMARKS, schema.landmarksPerHand);
  assert.deepEqual([...SLOTS], schema.slots);
});

test("column names equal the Python column names", () => {
  assert.deepEqual(featureColumns(), fixture.columns);
});

test("TypeScript features equal Python features on the shared fixture", () => {
  for (const c of fixture.cases) {
    const hands: HandObservation[] = c.hands.map((h: { side: string | null; landmarks: number[][] }) => ({
      side: (h.side ?? "Unknown") as HandObservation["side"],
      landmarks: h.landmarks.map(([x, y, z]) => ({ x, y, z })),
    }));
    const got = buildFeatures(hands).features;
    assert.equal(got.length, FEATURE_COUNT);
    got.forEach((v, i) => assert.ok(Math.abs(v - c.expected[i]) < 1e-9, `feature ${i}: ${v} vs ${c.expected[i]}`));
  }
});

test("no hands gives an all-zero vector", () => {
  const r = buildFeatures([]);
  assert.equal(r.handLabel, "None");
  assert.ok(r.features.every((v) => v === 0));
});

test("rejects malformed landmark arrays", () => {
  assert.throws(() => buildFeatures([{ side: "Right", landmarks: [{ x: 0, y: 0, z: 0 }] }]));
});

test("CSV header = meta columns + Python feature columns", () => {
  assert.deepEqual(csvHeader(), ["label", "hand", "signer", "timestamp", "session_id", ...fixture.columns]);
});
