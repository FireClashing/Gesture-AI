import test from "node:test";
import assert from "node:assert/strict";
import { StabilityVoter } from "../../src/lib/signa/smoothing.ts";
import { addGesture, addSpace, backspace, compose, type Token } from "../../src/lib/signa/transcript.ts";
import { translateGesture, ALPHABET_LABELS } from "../../src/lib/signa/translations.ts";
import { buildCsv, cleanSigner, csvHeader, type GestureSample } from "../../src/lib/signa/dataset.ts";
import { parseVoiceSnapshot, pickVoice } from "../../src/lib/signa/speechEngine.ts";
import { FEATURE_COUNT } from "../../src/lib/signa/features.ts";

const p = (gesture: string, confidence = 0.9) => ({ gesture, confidence });

test("voter emits after a majority and does not repeat a held pose", () => {
  const v = new StabilityVoter();
  const out = [p("A"), p("A"), p("A"), p("A"), p("A"), p("A")].map((x) => v.push(x));
  assert.deepEqual(out.filter(Boolean), ["A"]);
  assert.equal(out[2], "A");
});

test("voter ignores low confidence, UNKNOWN and flicker", () => {
  const v = new StabilityVoter();
  const out = [p("A", 0.3), p("A", 0.3), p("UNKNOWN"), p("A"), p("B"), p("A")].map((x) => v.push(x));
  assert.deepEqual(out.filter(Boolean), []);
});

test("double letters need a release in between", () => {
  const v = new StabilityVoter();
  const seq = [p("L"), p("L"), p("L"), null, null, null, p("L"), p("L"), p("L")];
  assert.deepEqual(seq.map((x) => v.push(x)).filter(Boolean), ["L", "L"]);
});

test("switching letters emits the new letter", () => {
  const v = new StabilityVoter();
  const seq = [p("A"), p("A"), p("A"), p("B"), p("B"), p("B"), p("B")];
  assert.deepEqual(seq.map((x) => v.push(x)).filter(Boolean), ["A", "B"]);
});

test("voter option validation and reset", () => {
  assert.throws(() => new StabilityVoter({ window: 4, minVotes: 2 }));
  const v = new StabilityVoter();
  [p("A"), p("A"), p("A")].forEach((x) => v.push(x));
  v.reset();
  assert.equal(v.push(p("A")), null);
});

test("spelling mode builds words; words mode keeps tokens separate", () => {
  let t: Token[] = [];
  for (const g of ["H", "I"]) t = addGesture(t, g, "spelling");
  t = addSpace(t);
  t = addGesture(t, "YES", "spelling");
  assert.equal(compose(t).en, "HI Yes");
  assert.equal(compose(t).hi, "एच-आई हाँ");
  assert.equal(compose(backspace(t)).en, "HI");
  let w: Token[] = [];
  for (const g of ["H", "I"]) w = addGesture(w, g, "words");
  assert.equal(compose(w).en, "H I");
});

test("space is not duplicated and UNKNOWN is ignored", () => {
  assert.deepEqual(addSpace([]), []);
  const t = addSpace(addGesture([], "A", "spelling"));
  assert.equal(addSpace(t).length, t.length);
  assert.equal(addGesture(t, "UNKNOWN", "words"), t);
});

test("every alphabet letter has a translation; unknown labels pass through", () => {
  for (const l of ALPHABET_LABELS) assert.notEqual(translateGesture(l).hi, l);
  assert.deepEqual(translateGesture("foo"), { en: "FOO", hi: "FOO" });
});

test("CSV has the expected header, quoting and validation", () => {
  const sample: GestureSample = { label: "A", hand: "One", signer: 'a"b', timestamp: "t", session_id: "s", features: new Array(FEATURE_COUNT).fill(0) };
  const [head, row] = buildCsv([sample]).split("\n");
  assert.equal(head.split(",").length, csvHeader().length);
  assert.ok(row.includes('"a""b"'));
  assert.throws(() => buildCsv([{ ...sample, features: [1] }]));
  assert.equal(cleanSigner("=cmd|' /C calc"), "cmd|' /C calc");
  assert.equal(cleanSigner("   "), "signer-1");
});

test("pickVoice prefers regional, then on-device, handles Android hi_IN", () => {
  const voices = [
    { name: "US", lang: "en-US", localService: true },
    { name: "UK", lang: "en-GB", localService: false },
    { name: "India", lang: "en_IN", localService: false },
    { name: "Hindi online", lang: "hi_IN", localService: false },
    { name: "Hindi local", lang: "hi-IN", localService: true },
  ];
  assert.equal(pickVoice(voices, "en")?.name, "India");
  assert.equal(pickVoice(voices, "hi")?.name, "Hindi local");
  assert.equal(pickVoice([{ name: "x", lang: "hindi-ish" }], "hi"), null);
  assert.equal(pickVoice([{ name: "US", lang: "en-US", localService: true }], "hi"), null);
  assert.equal(pickVoice([{ name: "Eng", lang: "en" }], "en")?.name, "Eng");
});

test("voice snapshot parsing", () => {
  assert.deepEqual(parseVoiceSnapshot("unsupported"), { supported: false, english: null, hindi: null });
  assert.deepEqual(parseVoiceSnapshot("Google US English\n"), { supported: true, english: "Google US English", hindi: null });
  assert.deepEqual(parseVoiceSnapshot("A\nB"), { supported: true, english: "A", hindi: "B" });
});
