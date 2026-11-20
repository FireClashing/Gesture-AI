/**
 * Speech output for English + Hindi.
 *
 * Two engines, chosen per language (SpeechEngine setting):
 *   "clips"   - bundled audio files (public/audio, generated once by
 *               scripts/generate_voice_clips.py). Works offline and on every device,
 *               because nothing needs to be installed on the user's machine.
 *   "browser" - the device's own voices (Web Speech API). Hindi voices are often missing.
 *   "auto"    - clips when every needed clip exists, otherwise the browser voice.
 */
import { resolveClips, type ClipItem, type ClipManifest } from "./clips.ts";
import type { SpeakRequest } from "./types.ts";

export type SpeechLanguage = "en" | "hi" | "both";
export type SpeechEngine = "auto" | "clips" | "browser";

type VoiceLike = { lang: string; name: string; localService?: boolean };

export type SpeakOptions = {
  interrupt?: boolean;
  language?: SpeechLanguage;
  rate?: number;
  engine?: SpeechEngine;
  manifest?: ClipManifest | null;
  onStatus?: (message: string) => void;
};

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/* ---------------- voice detection (browser engine) ---------------- */

/** Android reports "hi_IN", desktop "hi-IN"; normalise both. */
const normalise = (lang: string) => lang.replace("_", "-").toLowerCase();

/** Best installed voice for a language: regional (en-IN / hi-IN) first, then on-device, then any. */
export function pickVoice<T extends VoiceLike>(voices: T[], language: "en" | "hi"): T | null {
  const matches = voices.filter((v) => {
    const l = normalise(v.lang);
    return l === language || l.startsWith(`${language}-`);
  });
  if (matches.length === 0) return null;
  const regional = language === "en" ? "en-in" : "hi-in";
  const regionalMatches = matches.filter((v) => normalise(v.lang) === regional);
  const pool = regionalMatches.length > 0 ? regionalMatches : matches;
  return pool.find((v) => v.localService) ?? pool[0]; // on-device voices also work offline
}

export function subscribeVoices(callback: () => void): () => void {
  if (!speechSupported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", callback);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", callback);
}

/** Primitive snapshot so useSyncExternalStore does not re-render needlessly. */
export function voiceSnapshot(): string {
  if (!speechSupported()) return "unsupported";
  const voices = window.speechSynthesis.getVoices();
  return `${pickVoice(voices, "en")?.name ?? ""}\n${pickVoice(voices, "hi")?.name ?? ""}`;
}

export type VoiceInfo = { supported: boolean; english: string | null; hindi: string | null };

export function parseVoiceSnapshot(snapshot: string): VoiceInfo {
  if (snapshot === "unsupported" || snapshot === "server") return { supported: snapshot !== "unsupported", english: null, hindi: null };
  const [english, hindi] = snapshot.split("\n");
  return { supported: true, english: english || null, hindi: hindi || null };
}

/* ---------------- playback ---------------- */

let session = 0; // bumped on every cancel so stale async work stops quietly
let queue: Promise<void> = Promise.resolve();
let cancelCurrent: (() => void) | null = null;

function cancelAll(): void {
  session += 1;
  cancelCurrent?.();
  cancelCurrent = null;
  if (speechSupported()) window.speechSynthesis.cancel();
}

export function stopSpeech(onStatus?: (message: string) => void): void {
  cancelAll();
  queue = Promise.resolve();
  onStatus?.("Speech stopped.");
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function playClip(url: string, rate: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    const release = () => {
      if (cancelCurrent === cancel) cancelCurrent = null;
    };
    const cancel = () => {
      audio.pause();
      release();
      resolve();
    };
    cancelCurrent = cancel;
    audio.onended = () => {
      release();
      resolve();
    };
    audio.onerror = () => {
      release();
      reject(new Error(`could not load ${url}`));
    };
    audio.play().catch((error) => {
      release();
      reject(error);
    });
  });
}

async function playSequence(items: ClipItem[], rate: number, alive: () => boolean): Promise<void> {
  for (const item of items) {
    if (!alive()) return;
    await playClip(item.url, rate);
    if (item.gapAfterMs && alive()) await wait(item.gapAfterMs / rate);
  }
}

function speakBrowser(text: string, lang: "en" | "hi", rate: number, say: (m: string) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!speechSupported()) {
      say("This browser has no speech synthesis and no bundled audio is available. Run `npm run generate:voice`.");
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    const voice = pickVoice(synth.getVoices(), lang);
    const label = lang === "hi" ? "Hindi" : "English";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
    utterance.rate = Math.min(1.5, Math.max(0.5, rate));
    if (voice) utterance.voice = voice;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (cancelCurrent === finish) cancelCurrent = null;
      resolve();
    };
    const watchdog = setTimeout(finish, 20000); // some browsers never fire `end`
    cancelCurrent = finish;

    utterance.onstart = () =>
      say(voice ? `Speaking ${label} (${voice.name})…` : `Speaking ${label}… no ${label} voice found on this device, so it may be silent. Generate bundled audio with \`npm run generate:voice\`.`);
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (event.error !== "canceled" && event.error !== "interrupted") {
        say(`${label} speech failed (${event.error}). Install a ${label} voice or generate bundled audio with \`npm run generate:voice\`.`);
      }
      finish();
    };
    synth.resume(); // Chrome can get stuck paused
    synth.speak(utterance);
  });
}

/** Speak a request. Fire-and-forget; progress is reported through `onStatus`. */
export function speak(request: SpeakRequest, options: SpeakOptions = {}): void {
  const { interrupt = true, language = "both", rate = 1, engine = "auto", manifest = null, onStatus } = options;
  if (interrupt) {
    cancelAll();
    queue = Promise.resolve();
  }
  const mine = session;
  const alive = () => mine === session;
  const say = (message: string) => {
    if (alive()) onStatus?.(message);
  };
  const langs: ("en" | "hi")[] = language === "both" ? ["en", "hi"] : [language];

  const speakLanguage = async (lang: "en" | "hi"): Promise<string | null> => {
    const text = (lang === "en" ? request.en : request.hi).trim();
    if (!text) return null;
    const label = lang === "en" ? "English" : "Hindi";

    if (engine !== "browser") {
      const plan = manifest ? resolveClips(manifest, lang, request.groups) : null;
      if (plan && plan.missing.length === 0 && plan.items.length > 0) {
        try {
          say(`Speaking ${label} (built-in audio)…`);
          await playSequence(plan.items, rate, alive);
          return `${label}: built-in audio`;
        } catch (error) {
          if (engine === "clips") {
            say(`Built-in ${label} audio failed: ${(error as Error).message}.`);
            return null;
          }
          // auto: fall through to the browser voice
        }
      } else if (engine === "clips") {
        say(
          manifest?.generated
            ? `Built-in ${label} audio is missing for: ${plan?.missing.join(", ")}. Switch the engine to Auto or Browser.`
            : "Built-in audio has not been generated yet. Run `npm run generate:voice` once (needs internet), then refresh.",
        );
        return null;
      }
    }
    await speakBrowser(text, lang, rate, say);
    return `${label}: browser voice`;
  };

  const run = async () => {
    if (!alive()) return;
    const used: string[] = [];
    for (const lang of langs) {
      if (!alive()) return;
      const result = await speakLanguage(lang);
      if (result) used.push(result);
    }
    if (used.length > 0) say(`Finished speaking (${used.join(", ")}).`);
  };
  queue = queue.then(run).catch(() => undefined);
}
