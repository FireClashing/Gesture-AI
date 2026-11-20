"use client";

import { useState } from "react";
import type { ClipState } from "@/lib/signa/clipStore";
import type { SpeechEngine, SpeechLanguage, VoiceInfo } from "@/lib/signa/speechEngine";
import type { EntryMode } from "@/lib/signa/transcript";
import type { Translation } from "@/lib/signa/translations";

type Props = {
  text: Translation;
  entryMode: EntryMode;
  onEntryMode: (mode: EntryMode) => void;
  autoSpeak: boolean;
  onAutoSpeak: (value: boolean) => void;
  speechStatus: string;
  onSpeak: () => void;
  onStopSpeech: () => void;
  onSpace: () => void;
  onUndo: () => void;
  onClear: () => void;
  speechLanguage: SpeechLanguage;
  onSpeechLanguage: (language: SpeechLanguage) => void;
  speechRate: number;
  onSpeechRate: (rate: number) => void;
  voices: VoiceInfo;
  speechEngine: SpeechEngine;
  onSpeechEngine: (engine: SpeechEngine) => void;
  clips: ClipState;
  onTestVoice: (language: "en" | "hi") => void;
};

const ENGINE_LABEL: Record<SpeechEngine, string> = { auto: "Auto", clips: "Built-in audio", browser: "Browser voice" };
const LANGUAGE_LABEL: Record<SpeechLanguage, string> = { en: "English", hi: "हिन्दी", both: "Both" };

const secondary = "rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700";

export default function SubtitlePanel(p: Props) {
  const [visible, setVisible] = useState(true);
  return (
    <section className="mt-4 rounded-2xl border border-slate-800 bg-[#101827] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Live subtitles · English + हिन्दी</h2>
          <p className="mt-1 text-xs text-slate-400">Stable recognised gestures are added to both transcript lines.</p>
        </div>
        <div className="flex gap-2">
          <div role="group" aria-label="Entry mode" className="flex overflow-hidden rounded-lg border border-slate-700 text-xs font-semibold">
            {(["words", "spelling"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={p.entryMode === mode}
                onClick={() => p.onEntryMode(mode)}
                className={`px-3 py-2 ${p.entryMode === mode ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
              >
                {mode === "words" ? "Words" : "Fingerspelling"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setVisible((v) => !v)} className={secondary}>
            {visible ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {visible && (
        <div aria-live="polite" aria-atomic="true" className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="min-h-28 rounded-xl border border-indigo-500/20 bg-[#0b1220] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-300">English</p>
            <p className="mt-3 break-words text-lg font-semibold leading-8 text-white">{p.text.en || "Your recognized words will appear here…"}</p>
          </div>
          <div className="min-h-28 rounded-xl border border-emerald-500/20 bg-[#0b1220] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">हिन्दी</p>
            <p lang="hi" className="mt-3 break-words text-lg font-semibold leading-8 text-white">{p.text.hi || "पहचाने गए शब्द यहाँ दिखाई देंगे…"}</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={p.onSpeak} disabled={!p.text.en} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">
          <span aria-hidden="true">▶ </span>Speak {p.speechLanguage === "both" ? "both" : p.speechLanguage === "en" ? "English" : "Hindi"}
        </button>
        <button type="button" onClick={p.onStopSpeech} className={secondary}>Stop speech</button>
        {p.entryMode === "spelling" && <button type="button" onClick={p.onSpace} className={secondary}>Space (end word)</button>}
        <button type="button" onClick={p.onUndo} disabled={!p.text.en} className={`${secondary} disabled:opacity-40`}>Backspace</button>
        <button type="button" onClick={p.onClear} className={secondary}>Clear</button>
        <label className="ml-1 flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={p.autoSpeak} onChange={(e) => p.onAutoSpeak(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
          Auto-speak {p.entryMode === "spelling" ? "finished words" : "new gestures"}
        </label>
      </div>
      <div className="mt-4 rounded-xl border border-slate-800 bg-[#0b1220] p-3" aria-label="Voice settings">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Voice settings</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div role="group" aria-label="Speech language" className="flex overflow-hidden rounded-lg border border-slate-700 text-xs font-semibold">
            {(["en", "hi", "both"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                aria-pressed={p.speechLanguage === lang}
                onClick={() => p.onSpeechLanguage(lang)}
                className={`px-3 py-2 ${p.speechLanguage === lang ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
              >
                {LANGUAGE_LABEL[lang]}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Speech engine" className="flex overflow-hidden rounded-lg border border-slate-700 text-xs font-semibold">
            {(["auto", "clips", "browser"] as const).map((eng) => (
              <button
                key={eng}
                type="button"
                aria-pressed={p.speechEngine === eng}
                onClick={() => p.onSpeechEngine(eng)}
                className={`px-3 py-2 ${p.speechEngine === eng ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
              >
                {ENGINE_LABEL[eng]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            Speed
            <input type="range" min={0.6} max={1.4} step={0.1} value={p.speechRate} onChange={(e) => p.onSpeechRate(Number(e.target.value))} className="w-28 accent-indigo-500" />
            <span className="w-8 font-mono text-slate-400">{p.speechRate.toFixed(1)}x</span>
          </label>
          <button type="button" onClick={() => p.onTestVoice("en")} className={secondary}>Test English</button>
          <button type="button" onClick={() => p.onTestVoice("hi")} className={secondary}>Test हिन्दी</button>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-slate-400">
          <li>
            Built-in audio:{" "}
            {p.clips.status === "ready" ? (
              <span className="text-emerald-300">ready · English {p.clips.en} clips · हिन्दी {p.clips.hi} clips (works on any device, offline)</span>
            ) : p.clips.status === "loading" ? (
              "checking…"
            ) : (
              <span className="text-amber-300">not generated yet · run <code>npm run generate:voice</code> once (needs internet), then refresh</span>
            )}
          </li>
          {!p.voices.supported ? (
            <li className="text-red-300">Browser speech synthesis is unavailable here; only built-in audio can play.</li>
          ) : (
            <>
              <li>Browser English voice: {p.voices.english ? <span className="text-emerald-300">{p.voices.english}</span> : <span className="text-amber-300">none detected</span>}</li>
              <li>Browser Hindi voice: {p.voices.hindi ? <span className="text-emerald-300">{p.voices.hindi}</span> : <span className="text-amber-300">none detected</span>} <span className="text-slate-500">(only used as the fallback)</span></li>
            </>
          )}
        </ul>
      </div>
      <p className="mt-3 text-xs text-slate-500" role="status">{p.speechStatus}</p>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        <strong>Words</strong> adds every recognised label as its own word. <strong>Fingerspelling</strong> joins letters into one word until you press Space.
        Auto uses the bundled audio clips when every needed clip exists, otherwise the device voice. Labels without a translation are shown as-is.
      </p>
    </section>
  );
}
