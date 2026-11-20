"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
import { CONFIG } from "@/lib/signa/config";
import type { HandObservation, Side } from "@/lib/signa/features";
import { createHandLandmarker } from "@/lib/signa/mediapipe";

export type TrackingFrame = { hands: HandObservation[]; timestamp: number };

const asSide = (name: string | undefined): Side => (name === "Left" || name === "Right" ? name : "Unknown");

/**
 * Owns the camera stream, the MediaPipe landmarker and the render loop.
 * Per-frame data goes to `onFrame` (kept in a ref); React state only changes
 * when something visible changes, so the 30 FPS loop does not re-render the UI.
 */
export function useHandTracking(onFrame: (frame: TrackingFrame) => void, onStop?: () => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const drawingRef = useRef<DrawingUtils | null>(null);
  const rafRef = useRef<number | null>(null);
  const runRef = useRef(0);
  const lastDetectRef = useRef(0);
  const handsRef = useRef(-1);

  const onFrameRef = useRef(onFrame);
  const onStopRef = useRef(onStop);
  useEffect(() => {
    onFrameRef.current = onFrame;
    onStopRef.current = onStop;
  });

  const [cameraOn, setCameraOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("Camera is off");
  const [handsDetected, setHandsDetected] = useState(0);

  const teardown = useCallback(() => {
    runRef.current += 1; // invalidates any in-flight start()
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    drawingRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    handsRef.current = -1;
  }, []);

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    const now = performance.now();
    if (!video || !canvas || !landmarker || video.readyState < 2) return;
    if (now - lastDetectRef.current < 1000 / CONFIG.detectionFps) return;
    lastDetectRef.current = now;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      drawingRef.current = null;
    }
    drawingRef.current ??= new DrawingUtils(ctx);

    const result = landmarker.detectForVideo(video, now);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const landmarks of result.landmarks) {
      drawingRef.current.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#6366f1", lineWidth: 3 });
      drawingRef.current.drawLandmarks(landmarks, { color: "#22d3ee", lineWidth: 1, radius: 3 });
    }

    const hands: HandObservation[] = result.landmarks.map((landmarks, i) => ({
      landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
      side: asSide(result.handedness[i]?.[0]?.categoryName),
    }));
    if (hands.length !== handsRef.current) {
      handsRef.current = hands.length;
      setHandsDetected(hands.length);
    }
    onFrameRef.current({ hands, timestamp: now });
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current || isLoading) return;
    const run = ++runRef.current;
    setIsLoading(true);
    setStatus("Loading hand tracker…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access needs HTTPS or localhost and a supported browser.");
      }
      const landmarker = await createHandLandmarker();
      if (run !== runRef.current) return landmarker.close();
      landmarkerRef.current = landmarker;

      setStatus("Requesting camera permission…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      if (run !== runRef.current) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("Video element is not ready.");
      video.srcObject = stream;
      await video.play();
      if (run !== runRef.current) return;

      setCameraOn(true);
      setStatus("Camera running. Show a hand to begin.");
      rafRef.current = requestAnimationFrame(loop);
    } catch (error) {
      if (run === runRef.current) {
        teardown();
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        setStatus(denied ? "Camera permission was denied. Allow camera access and try again." : (error as Error).message);
      }
    } finally {
      if (run === runRef.current) setIsLoading(false);
    }
  }, [isLoading, loop, teardown]);

  const stop = useCallback(() => {
    teardown();
    setCameraOn(false);
    setIsLoading(false);
    setHandsDetected(0);
    setStatus("Camera is off");
    onStopRef.current?.();
  }, [teardown]);

  useEffect(() => teardown, [teardown]);

  return { videoRef, canvasRef, cameraOn, isLoading, status, handsDetected, start, stop };
}
