import type { SignaLanguage } from "./types.ts";

export type Translation = Record<SignaLanguage, string>;

export const ALPHABET_LABELS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
export const WORD_LABELS = ["HELLO", "YES", "NO", "STOP", "HELP", "WATER", "SORRY", "HEART"];

/** Single source of truth for label -> English/Hindi text. Letters are spoken as letter names. */
export const GESTURE_TRANSLATIONS: Record<string, Translation> = {
  HELLO: { en: "Hello", hi: "नमस्ते" },
  YES: { en: "Yes", hi: "हाँ" },
  NO: { en: "No", hi: "नहीं" },
  STOP: { en: "Stop", hi: "रुकिए" },
  HELP: { en: "Help", hi: "मदद" },
  WATER: { en: "Water", hi: "पानी" },
  SORRY: { en: "Sorry", hi: "माफ़ कीजिए" },
  HEART: { en: "Love", hi: "प्यार" },
  A: { en: "A", hi: "ए" }, B: { en: "B", hi: "बी" }, C: { en: "C", hi: "सी" },
  D: { en: "D", hi: "डी" }, E: { en: "E", hi: "ई" }, F: { en: "F", hi: "एफ़" },
  G: { en: "G", hi: "जी" }, H: { en: "H", hi: "एच" }, I: { en: "I", hi: "आई" },
  J: { en: "J", hi: "जे" }, K: { en: "K", hi: "के" }, L: { en: "L", hi: "एल" },
  M: { en: "M", hi: "एम" }, N: { en: "N", hi: "एन" }, O: { en: "O", hi: "ओ" },
  P: { en: "P", hi: "पी" }, Q: { en: "Q", hi: "क्यू" }, R: { en: "R", hi: "आर" },
  S: { en: "S", hi: "एस" }, T: { en: "T", hi: "टी" }, U: { en: "U", hi: "यू" },
  V: { en: "V", hi: "वी" }, W: { en: "W", hi: "डब्ल्यू" }, X: { en: "X", hi: "एक्स" },
  Y: { en: "Y", hi: "वाई" }, Z: { en: "Z", hi: "ज़ेड" },
};

export function isAlphabetLabel(label: string): boolean {
  return ALPHABET_LABELS.includes(label.trim().toUpperCase());
}

export function translateGesture(gesture: string): Translation {
  const key = gesture.trim().toUpperCase();
  return GESTURE_TRANSLATIONS[key] ?? { en: key, hi: key };
}
