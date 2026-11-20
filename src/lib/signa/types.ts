export type SignaLanguage = "en" | "hi";

/** A single model output. `gesture` is "UNKNOWN" when below the confidence threshold. */
export type Prediction = {
  gesture: string;
  confidence: number;
  /** Top class probabilities (label -> probability). */
  scores: Record<string, number>;
};

/**
 * What to say. `en`/`hi` are display/TTS text; `groups` lists clip labels per
 * spoken word (e.g. [["HELLO"], ["H","I"]]) so pre-recorded audio can be used.
 */
export type SpeakRequest = { en: string; hi: string; groups: string[][] };
