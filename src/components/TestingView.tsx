"use client";

import { useState } from "react";
import CameraPanel from "@/components/CameraPanel";
import PredictionPanel from "@/components/PredictionPanel";
import { useHandTracking } from "@/hooks/useHandTracking";
import { useRecognition } from "@/hooks/useRecognition";
import { buildFeatures } from "@/lib/signa/features";

export default function TestingView() {
  const [startError, setStartError] = useState<string | null>(null);
  const recognition = useRecognition();
  const tracking = useHandTracking(
    (frame) => (frame.hands.length === 0 ? recognition.noHands() : recognition.submit(buildFeatures(frame.hands).features)),
    recognition.reset,
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

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-4 text-slate-100 lg:grid-cols-[1.2fr_0.8fr]">
      <CameraPanel
        title="Testing Camera"
        videoRef={tracking.videoRef}
        canvasRef={tracking.canvasRef}
        cameraOn={tracking.cameraOn}
        isLoading={tracking.isLoading}
        handsDetected={tracking.handsDetected}
        onStart={startCamera}
        onStop={tracking.stop}
      />
      <div className="space-y-4">
        <PredictionPanel heading="Model test result" prediction={recognition.prediction} message={recognition.message} showScores />
        <section className="rounded-2xl border border-slate-800 bg-[#101827] p-4">
          <p className="text-sm font-semibold text-white">Test information</p>
          <p className="mt-2 text-sm text-slate-400" role="status">{startError ?? tracking.status}</p>
          <p className="mt-2 text-sm text-slate-400">Hands detected: {tracking.handsDetected} / 2</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            The top scores show the model&apos;s three most likely labels. A prediction below the confidence threshold is reported as UNKNOWN.
            {recognition.backend && ` Backend: ${recognition.backend === "browser" ? "in-browser model" : "FastAPI server"}.`}
          </p>
        </section>
      </div>
    </div>
  );
}
