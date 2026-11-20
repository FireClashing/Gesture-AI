/**
 * Bundled voice clips: public/audio/manifest.json maps (language, label) -> audio file.
 * Generated once by scripts/generate_voice_clips.py. Pure functions only, so they are unit-tested.
 */
export type ClipLanguage = "en" | "hi";

export type ClipManifest = {
  version: 1;
  generated: boolean;
  engine: string | null;
  voices: Record<string, string>;
  clips: Record<ClipLanguage, Record<string, string>>;
};

export type ClipItem = { url: string; gapAfterMs: number };

const SAFE_FILE = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(mp3|wav|ogg)$/;
export const GAP_WITHIN_WORD_MS = 60;
export const GAP_BETWEEN_WORDS_MS = 300;

export function parseManifest(raw: unknown): ClipManifest {
  const m = raw as ClipManifest;
  if (!m || m.version !== 1 || typeof m.clips !== "object" || m.clips === null) {
    throw new Error("Unsupported audio manifest.");
  }
  const clips: ClipManifest["clips"] = { en: {}, hi: {} };
  for (const lang of ["en", "hi"] as const) {
    for (const [label, file] of Object.entries(m.clips[lang] ?? {})) {
      if (typeof file !== "string" || !SAFE_FILE.test(file)) throw new Error(`Unsafe audio path for ${lang}/${label}.`);
      clips[lang][label.toUpperCase()] = file;
    }
  }
  return { version: 1, generated: Boolean(m.generated), engine: m.engine ?? null, voices: m.voices ?? {}, clips };
}

export function clipCounts(m: ClipManifest): Record<ClipLanguage, number> {
  return { en: Object.keys(m.clips.en).length, hi: Object.keys(m.clips.hi).length };
}

/** Turn spoken groups of labels into a playlist; `missing` lists labels without a clip. */
export function resolveClips(
  manifest: ClipManifest,
  language: ClipLanguage,
  groups: string[][],
  base = "/audio/",
): { items: ClipItem[]; missing: string[] } {
  const items: ClipItem[] = [];
  const missing: string[] = [];
  for (const labels of groups) {
    labels.forEach((label, i) => {
      const file = manifest.clips[language][label.toUpperCase()];
      if (!file) {
        missing.push(label);
        return;
      }
      items.push({ url: `${base}${file}`, gapAfterMs: i === labels.length - 1 ? GAP_BETWEEN_WORDS_MS : GAP_WITHIN_WORD_MS });
    });
  }
  return { items, missing: [...new Set(missing)] };
}
