import type { Prediction } from "@/lib/signa/types";

type Props = { heading: string; prediction: Prediction | null; message: string; showScores?: boolean };

export default function PredictionPanel({ heading, prediction, message, showScores = false }: Props) {
  const confidence = prediction?.confidence ?? 0;
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#101827] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-400">{heading}</p>
      <p className="mt-4 text-sm text-slate-400">Detected gesture</p>
      <p className="mt-1 break-words text-4xl font-bold text-white">{prediction?.gesture ?? "Waiting..."}</p>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-sm text-slate-400">Confidence</span>
        <span className="text-xl font-bold text-indigo-400">{(confidence * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${Math.min(confidence * 100, 100)}%` }} />
      </div>

      {showScores && prediction && Object.keys(prediction.scores).length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-slate-400">
          {Object.entries(prediction.scores).map(([label, p]) => (
            <li key={label} className="flex justify-between">
              <span>{label}</span>
              <span className="font-mono">{(p * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-sm leading-6 text-slate-400" role="status">{message}</p>
    </section>
  );
}
