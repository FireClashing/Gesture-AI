import { isAlphabetLabel, translateGesture, type Translation } from "./translations.ts";
import type { SpeakRequest } from "./types.ts";

/**
 * Transcript model. In "words" mode every recognised label is a word.
 * In "spelling" mode alphabet labels are letters that build up one word until
 * a space is added; other labels (HELLO, YES ...) are still whole words.
 */
export type Token = { kind: "word" | "letter" | "space"; value: string };
export type EntryMode = "words" | "spelling";

export function addGesture(tokens: Token[], gesture: string, mode: EntryMode): Token[] {
  const value = gesture.trim().toUpperCase();
  if (!value || value === "UNKNOWN") return tokens;
  const kind = mode === "spelling" && isAlphabetLabel(value) ? "letter" : "word";
  return [...tokens, { kind, value }];
}

export function addSpace(tokens: Token[]): Token[] {
  const last = tokens[tokens.length - 1];
  return !last || last.kind === "space" ? tokens : [...tokens, { kind: "space", value: " " }];
}

export function backspace(tokens: Token[]): Token[] {
  return tokens.slice(0, -1);
}

export type SpokenGroup = Translation & { labels: string[] };

/** Group tokens into displayed/spoken words (letters of one word are joined). */
export function groups(tokens: Token[]): SpokenGroup[] {
  const out: SpokenGroup[] = [];
  let en = "";
  let hi: string[] = [];
  let labels: string[] = [];
  const flush = () => {
    if (en) out.push({ en, hi: hi.join("-"), labels });
    en = "";
    hi = [];
    labels = [];
  };
  for (const t of tokens) {
    if (t.kind === "letter") {
      en += t.value;
      hi.push(translateGesture(t.value).hi);
      labels.push(t.value);
    } else if (t.kind === "space") {
      flush();
    } else {
      flush();
      out.push({ ...translateGesture(t.value), labels: [t.value] });
    }
  }
  flush();
  return out;
}

export function compose(tokens: Token[]): Translation {
  const g = groups(tokens);
  return { en: g.map((x) => x.en).join(" "), hi: g.map((x) => x.hi).join(" ") };
}

export function toRequest(g: SpokenGroup[]): SpeakRequest {
  return { en: g.map((x) => x.en).join(" "), hi: g.map((x) => x.hi).join(" "), groups: g.map((x) => x.labels) };
}

export const speechRequest = (tokens: Token[]): SpeakRequest => toRequest(groups(tokens));
