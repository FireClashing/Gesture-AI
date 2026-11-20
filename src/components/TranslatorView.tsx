"use client";

import { useState } from "react";
import CameraPanel from "@/components/CameraPanel";
import PredictionPanel from "@/components/PredictionPanel";
import SubtitlePanel from "@/components/SubtitlePanel";
import { useHandTracking } from "@/hooks/useHandTracking";
import { useRecognition } from "@/hooks/useRecognition";
import { useSpeech } from "@/hooks/useSpeech";
import { useTranscript } from "@/hooks/useTranscript";
import { buildFeatures } from "@/lib/signa/features";
import type { EntryMode } from "@/lib/signa/transcript";

export default function TranslatorView() {
  const [entryMode, setEntryMode] = useState<EntryMode>("words");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const speech = useSpeech();
  const transcript = useTranscript();

  const recognition = useRecognition((gesture) => {
    const done = transcript.add(gesture, entryMode);
    if (done && autoSpeak) speech.speak(done, false);
  });

  const tracking = useHandTracking(
    (frame) => {
      if (frame.hands.length === 0) return recognition.noHands();
      recognition.submit(buildFeatures(frame.hands).features);
    },
    () => {
      recognition.reset();
      speech.stop();
    },
  );

  async function startCamera() {
    setStartError(null);
    try {
      recognition.reset();
      await recognition.prepare();
    } catch (error) {
      setStartError((error as Error).message);
      return;
    }
    await tracking.start();
  }

  function finishWord() {
    const done = transcript.space();
    if (done && autoSpeak) speech.speak(done, false);
  }

  return (
    <div className="mx-auto w-full max-w-6xl text-slate-100">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <CameraPanel
          title="Live Camera"
          videoRef={tracking.videoRef}
          canvasRef={tracking.canvasRef}
          cameraOn={tracking.cameraOn}
          isLoading={tracking.isLoading}
          handsDetected={tracking.handsDetected}
          onStart={startCamera}
          onStop={tracking.stop}
        />
        <div className="space-y-4">
          <PredictionPanel heading="Recognition result" prediction={recognition.prediction} message={recognition.message} />
          <section className="rounded-2xl border border-slate-800 bg-[#101827] p-4">
            <p className="text-sm font-semibold text-white">Camera status</p>
            <p className="mt-2 text-sm text-slate-400" role="status">{startError ?? tracking.status}</p>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Each frame becomes 128 values: two hand slots of 63 wrist-relative, size-normalised landmark coordinates plus two presence flags.
              Left hands are mirrored so both hands share one shape space.
              {recognition.backend && ` Inference: ${recognition.backend === "browser" ? "in this browser" : "FastAPI server"}.`}
            </p>
          </section>
        </div>
      </div>

      <SubtitlePanel
        text={transcript.text}
        entryMode={entryMode}
        onEntryMode={setEntryMode}
        autoSpeak={autoSpeak}
        onAutoSpeak={setAutoSpeak}
        speechStatus={speech.status}
        speechLanguage={speech.language}
        onSpeechLanguage={speech.setLanguage}
        speechRate={speech.rate}
        onSpeechRate={speech.setRate}
        voices={speech.voices}
        speechEngine={speech.engine}
        onSpeechEngine={speech.setEngine}
        clips={speech.clips}
        onTestVoice={speech.testVoice}
        onSpeak={() => (transcript.text.en ? speech.speak(transcript.request) : speech.setStatus("Recognise a gesture before playing speech."))}
        onStopSpeech={speech.stop}
        onSpace={finishWord}
        onUndo={transcript.undo}
        onClear={() => {
          transcript.clear();
          speech.stop();
          speech.setStatus("Subtitles cleared.");
        }}
      />
    </div>
  );
}
