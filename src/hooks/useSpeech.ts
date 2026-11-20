"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getClipState, getServerClipState, loadClipManifest, subscribeClips } from "@/lib/signa/clipStore";
import {
  parseVoiceSnapshot, speak as speakRequest, stopSpeech, subscribeVoices, voiceSnapshot,
  type SpeechEngine, type SpeechLanguage,
} from "@/lib/signa/speechEngine";
import type { SpeakRequest } from "@/lib/signa/types";

const TEST_REQUEST: SpeakRequest = { en: "Hello", hi: "नमस्ते", groups: [["HELLO"]] };

/** Speech state: language, engine, speed, bundled-audio status, installed browser voices. */
export function useSpeech() {
  const [status, setStatus] = useState("Speech is ready.");
  const [language, setLanguage] = useState<SpeechLanguage>("both");
  const [engine, setEngine] = useState<SpeechEngine>("auto");
  const [rate, setRate] = useState(1);

  const clips = useSyncExternalStore(subscribeClips, getClipState, getServerClipState);
  const snapshot = useSyncExternalStore(subscribeVoices, voiceSnapshot, () => "server");
  const voices = useMemo(() => parseVoiceSnapshot(snapshot), [snapshot]);

  useEffect(() => {
    loadClipManifest();
  }, []);

  const speak = useCallback(
    (request: SpeakRequest, interrupt = true) =>
      speakRequest(request, { interrupt, language, rate, engine, manifest: clips.manifest, onStatus: setStatus }),
    [language, rate, engine, clips.manifest],
  );

  const testVoice = useCallback(
    (which: "en" | "hi") =>
      speakRequest(TEST_REQUEST, { language: which, rate, engine, manifest: clips.manifest, onStatus: setStatus }),
    [rate, engine, clips.manifest],
  );

  const stop = useCallback(() => stopSpeech(setStatus), []);

  return { status, setStatus, speak, stop, testVoice, language, setLanguage, engine, setEngine, rate, setRate, clips, voices };
}
