"use client";

import { useEffect, useState } from "react";
import { getBackendStatus, type BackendStatus as Status } from "@/lib/signa/predictor";

/** Sidebar indicator that reflects the real inference backend instead of a static green dot. */
export default function BackendStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let active = true;
    const check = () => getBackendStatus().then((s) => active && setStatus(s));
    check();
    const timer = window.setInterval(check, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const dot = !status ? "bg-slate-500" : status.ok ? "bg-emerald-400" : "bg-red-400";
  return (
    <div className="m-4 rounded-2xl border border-slate-800 bg-[#080d18] p-4" role="status">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inference</span>
      </div>
      <p className="text-sm font-semibold text-white">{status?.title ?? "Checking…"}</p>
      <p className="mt-2 break-words text-xs leading-5 text-slate-500">{status?.detail ?? "Looking for a model."}</p>
    </div>
  );
}
