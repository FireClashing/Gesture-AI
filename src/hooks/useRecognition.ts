"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG } from "@/lib/signa/config";
import { createPredictor, type Backend, type Predictor } from "@/lib/signa/predictor";
import { StabilityVoter } from "@/lib/signa/smoothing";
import type { Prediction } from "@/lib/signa/types";

const IDLE = "Show one or both hands to begin recognition.";

/**
 * Throttled prediction + majority-vote smoothing.
 * `onStable` fires once when a gesture has been held steadily (see smoothing.ts).
 */
export function useRecognition(onStable?: (gesture: string) => void) {
  const predictorRef = useRef<Predictor | null>(null);
  const voterRef = useRef(new StabilityVoter());
  const inFlightRef = useRef(false);
  const lastRunRef = useRef(0);
  const backoffUntilRef = useRef(0);
  const sessionRef = useRef(0);
  const hadHandsRef = useRef(false);
  const onStableRef = useRef(onStable);
  useEffect(() => {
    onStableRef.current = onStable;
  });

  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [message, setMessage] = useState(IDLE);
  const [backend, setBackend] = useState<Backend | null>(null);

  const reset = useCallback(() => {
    sessionRef.current += 1;
    voterRef.current.reset();
    inFlightRef.current = false;
    hadHandsRef.current = false;
    lastRunRef.current = 0;
    setPrediction(null);
    setMessage(IDLE);
  }, []);

  /** Choose the backend; call when the camera starts. Returns a description or throws. */
  const prepare = useCallback(async () => {
    const predictor = await createPredictor();
    predictorRef.current = predictor;
    voterRef.current = new StabilityVoter({ ...CONFIG.smoothing[predictor.backend], minConfidence: CONFIG.confidenceThreshold });
    setBackend(predictor.backend);
    return predictor.description;
  }, []);

  const noHands = useCallback(() => {
    voterRef.current.push(null);
    if (hadHandsRef.current) {
      hadHandsRef.current = false;
      setPrediction(null);
      setMessage(IDLE);
    }
  }, []);

  const submit = useCallback((features: number[]) => {
    const predictor = predictorRef.current;
    const now = performance.now();
    hadHandsRef.current = true;
    if (!predictor || inFlightRef.current || now < backoffUntilRef.current) return;
    if (now - lastRunRef.current < CONFIG.predictionIntervalMs[predictor.backend]) return;
    lastRunRef.current = now;
    inFlightRef.current = true;
    const session = sessionRef.current;

    predictor
      .predict(features)
      .then((result) => {
        if (session !== sessionRef.current) return;
        setPrediction((prev) =>
          prev && prev.gesture === result.gesture && Math.abs(prev.confidence - result.confidence) < 0.01 ? prev : result,
        );
        setMessage(
          result.gesture === "UNKNOWN"
            ? `Low confidence (below ${(CONFIG.confidenceThreshold * 100).toFixed(0)}%). Hold the sign steady.`
            : `Recognised with ${predictor.description}.`,
        );
        const stable = voterRef.current.push(result);
        if (stable) onStableRef.current?.(stable);
      })
      .catch((error: Error) => {
        if (session !== sessionRef.current) return;
        backoffUntilRef.current = performance.now() + 2000;
        setMessage(`Prediction failed: ${error.message}`);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, []);

  return { prediction, message, backend, prepare, submit, noHands, reset };
}
