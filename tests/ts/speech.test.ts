import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clipCounts, parseManifest, resolveClips } from "../../src/lib/signa/clips.ts";
import { GESTURE_TRANSLATIONS } from "../../src/lib/signa/translations.ts";
import { addGesture, addSpace, speechRequest, toRequest, groups, type Token } from "../../src/lib/signa/transcript.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"));
const script = read("src/data/voice-script.json");
const shipped = read("public/audio/manifest.json");

const fullManifest = () =>
  parseManifest({
    version: 1, generated: true, engine: "test",
    clips: {
      en: Object.fromEntries(Object.keys(script.en).map((k) => [k, `en/${k}.mp3`])),
      hi: Object.fromEntries(Object.keys(script.hi).map((k) => [k, `hi/${k}.mp3`])),
    },
  });

test("voice script covers exactly the labels in translations.ts", () => {
  const labels = Object.keys(GESTURE_TRANSLATIONS).sort();
  assert.deepEqual(Object.keys(script.en).sort(), labels);
  assert.deepEqual(Object.keys(script.hi).sort(), labels);
});

test("Hindi voice text equals the Hindi display text; English letters are spoken phonetically", () => {
  for (const [label, t] of Object.entries(GESTURE_TRANSLATIONS)) {
    assert.equal(script.hi[label], t.hi, `hi ${label}`);
    assert.ok(script.en[label].trim().length > 0);
  }
  assert.equal(script.en.A, "ay"); // not the article "a"
  assert.equal(script.en.W, "double you");
});

test("shipped manifest is valid and honestly marked as not generated", () => {
  const m = parseManifest(shipped);
  assert.equal(m.generated, false);
  assert.deepEqual(clipCounts(m), { en: 0, hi: 0 });
});

test("resolveClips builds a playlist with word gaps and reports missing clips", () => {
  const m = fullManifest();
  const { items, missing } = resolveClips(m, "en", [["H", "I"], ["YES"]]);
  assert.deepEqual(items.map((i) => i.url), ["/audio/en/H.mp3", "/audio/en/I.mp3", "/audio/en/YES.mp3"]);
  assert.deepEqual(items.map((i) => i.gapAfterMs), [60, 300, 300]);
  assert.deepEqual(missing, []);
  const partial = resolveClips(m, "hi", [["H"], ["CUSTOM"], ["CUSTOM"]]);
  assert.deepEqual(partial.missing, ["CUSTOM"]);
  assert.equal(resolveClips(m, "hi", [["HELLO"]]).items[0].url, "/audio/hi/HELLO.mp3");
});

test("manifest rejects unsafe or malformed file paths", () => {
  const bad = (file: string) => () => parseManifest({ version: 1, clips: { en: { A: file }, hi: {} } });
  assert.throws(bad("../secret.mp3"));
  assert.throws(bad("https://evil.example/x.mp3"));
  assert.throws(bad("en/A.exe"));
  assert.throws(() => parseManifest({ version: 2 }));
  assert.doesNotThrow(bad("en/A.wav"));
});

test("transcript produces clip label groups for both modes", () => {
  let spelling: Token[] = [];
  for (const g of ["H", "I"]) spelling = addGesture(spelling, g, "spelling");
  spelling = addGesture(addSpace(spelling), "YES", "spelling");
  const req = speechRequest(spelling);
  assert.deepEqual(req.groups, [["H", "I"], ["YES"]]);
  assert.equal(req.en, "HI Yes");
  assert.equal(req.hi, "एच-आई हाँ");

  let words: Token[] = [];
  for (const g of ["H", "I"]) words = addGesture(words, g, "words");
  assert.deepEqual(speechRequest(words).groups, [["H"], ["I"]]);
  assert.deepEqual(toRequest(groups(addGesture([], "WATER", "words"))).groups, [["WATER"]]);
});
