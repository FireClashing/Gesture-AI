import type { RefObject } from "react";

type Props = {
  title: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraOn: boolean;
  isLoading: boolean;
  handsDetected: number;
  onStart: () => void;
  onStop: () => void;
  children?: React.ReactNode;
};

export default function CameraPanel({ title, videoRef, canvasRef, cameraOn, isLoading, handsDetected, onStart, onStop, children }: Props) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#101827] p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-400">{handsDetected} / 2 hands detected</span>
      </div>

      <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-800 bg-black">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#05080f] text-sm text-slate-500">
            {isLoading ? "Starting…" : "Camera is off"}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={isLoading || cameraOn}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Starting..." : "Start Camera"}
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!cameraOn && !isLoading}
          className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-40"
        >
          Stop Camera
        </button>
      </div>
      {children}
    </section>
  );
}
