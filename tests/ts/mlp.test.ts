import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseModel, predictGesture, predictProba } from "../../src/lib/signa/mlp.ts";
import { FEATURE_COUNT, INPUT_FORMAT } from "../../src/lib/signa/features.ts";

const fx = JSON.parse(readFileSync(new URL("../fixtures/mlp.json", import.meta.url), "utf8"));
const shipped = JSON.parse(readFileSync(new URL("../../public/models/gesture-model.json", import.meta.url), "utf8"));
const expected = { inputFormat: INPUT_FORMAT, featureCount: FEATURE_COUNT };

test("TypeScript forward pass matches scikit-learn probabilities", () => {
  const model = parseModel(fx.model, expected);
  fx.inputs.forEach((x: number[], n: number) => {
    const p = predictProba(model, x);
    p.forEach((v, i) => assert.ok(Math.abs(v - fx.expected[n][i]) < 1e-4, `${v} vs ${fx.expected[n][i]}`));
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  });
});

test("threshold produces UNKNOWN", () => {
  const model = parseModel(fx.model, expected);
  assert.equal(predictGesture(model, fx.inputs[0], 1.01).gesture, "UNKNOWN");
  assert.notEqual(predictGesture(model, fx.inputs[0], 0).gesture, "UNKNOWN");
});

test("shipped browser model is valid and current", () => {
  const model = parseModel(shipped, expected);
  assert.ok(model.labels.length >= 2);
  assert.equal(predictProba(model, new Array(FEATURE_COUNT).fill(0)).length, model.labels.length);
});

test("invalid models are rejected", () => {
  assert.throws(() => parseModel({ ...fx.model, inputFormat: "old" }, expected));
  assert.throws(() => parseModel({ ...fx.model, format: "x" }, expected));
  assert.throws(() => predictProba(parseModel(fx.model, expected), [1, 2, 3]));
});
