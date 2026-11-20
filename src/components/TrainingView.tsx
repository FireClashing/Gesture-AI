"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import CameraPanel from "@/components/CameraPanel";
import { useHandTracking } from "@/hooks/useHandTracking";
import { buildClipsJsonl, buildCsv, cleanSigner, type GestureSample, type MotionClip } from "@/lib/signa/dataset";
import { downloadFile } from "@/lib/signa/download";
import { buildFeatures, FEATURE_COUNT, type FeatureResult } from "@/lib/signa/features";
import { ALPHABET_LABELS, WORD_LABELS } from "@/lib/signa/translations";

const STORAGE_KEY = "signa.training.v2";
const MAX_STORED_CLIPS = 40; // keeps localStorage under its ~5 MB quota
const newSessionId = () => `session-${Date.now()}`;
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "signer";

type Saved = { samples: GestureSample[]; clips: MotionClip[]; signer: string; sessionId: string };

function loadSaved(): Saved {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Saved> | null;
    return {
      samples: Array.isArray(parsed?.samples) ? parsed.samples.filter((s) => s.features?.length === FEATURE_COUNT) : [],
      clips: Array.isArray(parsed?.clips) ? parsed.clips : [],
      signer: typeof parsed?.signer === "string" ? parsed.signer : "signer-1",
      sessionId: typeof parsed?.sessionId === "string" ? parsed.sessionId : newSessionId(),
    };
  } catch {
    return { samples: [], clips: [], signer: "signer-1", sessionId: newSessionId() };
  }
}

const card = "rounded-xl bg-[#0b1220] p-3";
const secondaryBtn = "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";

/** The studio reads localStorage, so it only renders on the client (avoids hydration mismatch). */
export default function TrainingView() {
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);
  return isClient ? <TrainingStudio /> : <p className="text-sm text-slate-400">Loading studio…</p>;
}

type ClipState = "idle" | "countdown" | "recording";

function TrainingStudio() {
  const [saved] = useState(loadSaved);
  const [samples, setSamples] = useState(saved.samples);
  const [clips, setClips] = useState(saved.clips);
  const [signer, setSigner] = useState(saved.signer);
  const [sessionId, setSessionId] = useState(saved.sessionId);
  const [selected, setSelected] = useState("A");
  const [message, setMessage] = useState("Start the camera, show a hand, then capture samples.");
  const [clipSeconds, setClipSeconds] = useState(1.5);
  const [clipState, setClipState] = useState<ClipState>("idle");

  const latestRef = useRef<FeatureResult | null>(null);
  const recordingRef = useRef(false);
  const framesRef = useRef<{ features: number[]; hasHands: boolean }[]>([]);
  const timersRef = useRef<number[]>([]);

  const cancelRecording = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    recordingRef.current = false;
    framesRef.current = [];
    setClipState("idle");
  };

  const tracking = useHandTracking(
    (frame) => {
      const result = frame.hands.length ? buildFeatures(frame.hands) : null;
      latestRef.current = result;
      if (recordingRef.current) {
        framesRef.current.push({ features: result?.features ?? new Array<number>(FEATURE_COUNT).fill(0), hasHands: !!result });
      }
    },
    () => {
      latestRef.current = null;
      cancelRecording();
    },
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ samples, clips: clips.slice(-MAX_STORED_CLIPS), signer, sessionId }));
    } catch (error) {
      console.warn("Could not persist training data (storage full?). Export your data.", error);
    }
  }, [samples, clips, signer, sessionId]);

  useEffect(() => () => timersRef.current.forEach((t) => window.clearTimeout(t)), []);

  const counts = useMemo(() => {
    const byLabel = new Map<string, number>();
    let inSession = 0;
    for (const s of samples) {
      byLabel.set(s.label, (byLabel.get(s.label) ?? 0) + 1);
      if (s.session_id === sessionId) inSession += 1;
    }
    return { byLabel, inSession, alphabet: ALPHABET_LABELS.reduce((n, l) => n + (byLabel.get(l) ?? 0), 0) };
  }, [samples, sessionId]);

  function captureSample() {
    const latest = latestRef.current;
    if (!latest) return setMessage("Show at least one hand before capturing.");
    if (latest.features.length !== FEATURE_COUNT) return setMessage(`Invalid data: expected ${FEATURE_COUNT} values.`);
    setSamples((prev) => [
      ...prev,
      { label: selected, hand: latest.sides, signer: cleanSigner(signer), features: [...latest.features], timestamp: new Date().toISOString(), session_id: sessionId },
    ]);
    setMessage(`Sample captured for ${selected}.`);
  }

  function exportCsv() {
    if (!samples.length) return setMessage("Collect some samples before exporting.");
    const name = `isl_alphabet_${slug(signer)}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(name, buildCsv(samples), "text/csv;charset=utf-8");
    setMessage(`Exported ${samples.length} samples as ${name}. Put the file in dataset/ and run \`npm run train\`.`);
  }

  function recordClip() {
    if (!tracking.cameraOn) return setMessage("Start the camera first.");
    if (clipState !== "idle") return;
    setClipState("countdown");
    setMessage(`Get ready to sign ${selected}… recording starts in 2 seconds.`);
    const start = window.setTimeout(() => {
      framesRef.current = [];
      recordingRef.current = true;
      setClipState("recording");
      setMessage(`Recording ${selected} for ${clipSeconds}s…`);
      const stop = window.setTimeout(finishClip, clipSeconds * 1000);
      timersRef.current.push(stop);
    }, 2000);
    timersRef.current.push(start);
  }

  function finishClip() {
    recordingRef.current = false;
    const frames = framesRef.current;
    framesRef.current = [];
    timersRef.current = [];
    setClipState("idle");
    const withHands = frames.filter((f) => f.hasHands).length;
    if (frames.length < 8 || withHands / frames.length < 0.5) {
      return setMessage("Clip discarded: a hand was visible in less than half of the frames.");
    }
    const clip: MotionClip = {
      label: selected, signer: cleanSigner(signer), session_id: sessionId, timestamp: new Date().toISOString(),
      fps: Math.round(frames.length / clipSeconds), frames: frames.map((f) => f.features.map((v) => Math.round(v * 1e5) / 1e5)),
    };
    setClips((prev) => [...prev, clip]);
    setMessage(`Saved a ${frames.length}-frame motion clip for ${selected}.`);
  }

  function exportClips() {
    if (!clips.length) return setMessage("Record some motion clips first.");
    downloadFile(`isl_motion_${slug(signer)}_${new Date().toISOString().slice(0, 10)}.jsonl`, buildClipsJsonl(clips), "application/x-ndjson");
    setMessage("Exported clips. Put the file in dataset/sequences/ and run `npm run train:sequence`.");
  }

  const handsHint =
    tracking.handsDetected === 2
      ? "Two hands detected. Both are saved in this sample (ordered by position, not by handedness)."
      : tracking.handsDetected === 1
        ? "One hand detected. The second slot will be zero-padded."
        : "Show one or both hands to capture a sample.";

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-4 text-slate-100 lg:grid-cols-[0.85fr_1.15fr]">
      <CameraPanel
        title="Training Camera"
        videoRef={tracking.videoRef}
        canvasRef={tracking.canvasRef}
        cameraOn={tracking.cameraOn}
        isLoading={tracking.isLoading}
        handsDetected={tracking.handsDetected}
        onStart={tracking.start}
        onStop={tracking.stop}
      >
        <div className="mt-3 rounded-lg border border-slate-800 bg-[#0b1220] p-3">
          <p className="text-xs font-semibold text-slate-300">Status</p>
          <p className="mt-1 text-sm text-slate-400" role="status">{message}</p>
          <p className="mt-1 text-xs text-slate-500">{tracking.status}</p>
          <p className="mt-2 text-xs text-slate-500">{handsHint}</p>
        </div>
      </CameraPanel>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-[#101827] p-4">
        <div>
          <h2 className="text-lg font-bold text-white">ISL Dataset Collector</h2>
          <p className="mt-1 text-xs text-slate-400">Samples are kept in this browser until exported, so a refresh no longer loses them.</p>
        </div>

        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-indigo-300">
              Signer name / ID
              <input
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
                maxLength={40}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm font-normal normal-case text-white outline-none focus:border-indigo-500"
              />
            </label>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Capture session</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-white">{sessionId}</p>
                <button type="button" onClick={() => { setSessionId(newSessionId()); setMessage("Started a new session."); }} className={secondaryBtn}>New session</button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Use a different signer name for each person and start a new session when the day, lighting or setup changes.
            The trainer evaluates on held-out signers/sessions, so honest labels here mean honest accuracy later.
          </p>
        </div>

        <div>
          <label htmlFor="gesture" className="mb-2 block text-sm font-semibold text-slate-300">Select ISL alphabet / gesture</label>
          <select
            id="gesture"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-indigo-500"
          >
            <optgroup label="Alphabet labels (A–Z)">{ALPHABET_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>
            <optgroup label="Word gestures">{WORD_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">Use the label that matches the sign in your chosen ISL reference chart.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={card}><p className="text-xs text-slate-400">Samples for {selected}</p><p className="mt-1 text-2xl font-bold text-white">{counts.byLabel.get(selected) ?? 0}</p></div>
          <div className={card}><p className="text-xs text-slate-400">Alphabet samples</p><p className="mt-1 text-2xl font-bold text-white">{counts.alphabet}</p></div>
          <div className={card}><p className="text-xs text-slate-400">Current session</p><p className="mt-1 text-2xl font-bold text-white">{counts.inSession}</p></div>
          <div className={card}><p className="text-xs text-slate-400">All samples</p><p className="mt-1 text-2xl font-bold text-white">{samples.length}</p></div>
        </div>

        <button
          type="button"
          onClick={captureSample}
          disabled={tracking.handsDetected === 0 || !tracking.cameraOn}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Capture Sample for {selected}
        </button>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Alphabet dataset breakdown</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {ALPHABET_LABELS.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => setSelected(letter)}
                className={`rounded-lg border px-2 py-2 text-center ${selected === letter ? "border-indigo-500 bg-indigo-500/15" : "border-slate-800 bg-[#0b1220]"}`}
              >
                <span className="block text-sm font-bold text-white">{letter}</span>
                <span className="mt-1 block text-[10px] text-slate-400">{counts.byLabel.get(letter) ?? 0} samples</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Motion clips (J, Z, HELLO…)</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Signs that involve movement cannot be learned from one frame. Record a short clip of {selected}; clips are exported separately and trained with <code>npm run train:sequence</code>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select aria-label="Clip length" value={clipSeconds} onChange={(e) => setClipSeconds(Number(e.target.value))} className="rounded-lg border border-slate-700 bg-[#0b1220] px-2 py-2 text-xs text-white">
              {[1, 1.5, 2, 3].map((s) => <option key={s} value={s}>{s}s</option>)}
            </select>
            <button type="button" onClick={recordClip} disabled={clipState !== "idle" || !tracking.cameraOn} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">
              {clipState === "idle" ? `Record clip for ${selected}` : clipState === "countdown" ? "Get ready…" : "Recording…"}
            </button>
            <button type="button" onClick={exportClips} disabled={!clips.length} className={secondaryBtn}>Export clips ({clips.length})</button>
            <button type="button" onClick={() => setClips([])} disabled={!clips.length} className={secondaryBtn}>Clear clips</button>
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-amber-200">Collection guidance</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-400">
            <li>Use the correct ISL reference for each label; English manual-alphabet charts do not always match ISL.</li>
            <li>Vary distance, position, rotation and lighting. Near-identical frames are removed at training time, so variety matters more than count.</li>
            <li>Collect every letter in at least three sessions and, ideally, from several signers.</li>
            <li>Either hand works: left hands are mirrored automatically.</li>
          </ul>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={exportCsv} disabled={!samples.length} className="rounded-lg bg-indigo-600 px-2 py-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">Export CSV</button>
          <button type="button" onClick={() => setSamples((p) => p.slice(0, -1))} disabled={!samples.length} className="rounded-lg bg-amber-600 px-2 py-3 text-xs font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40">Undo Last</button>
          <button
            type="button"
            onClick={() => { if (window.confirm(`Delete all ${samples.length} samples? Export first if you want to keep them.`)) { setSamples([]); setMessage("Dataset cleared."); } }}
            disabled={!samples.length}
            className="rounded-lg bg-red-700 px-2 py-3 text-xs font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear Data
          </button>
        </div>
      </section>
    </div>
  );
}
