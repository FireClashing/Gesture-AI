import { clipCounts, parseManifest, type ClipManifest } from "./clips";

export type ClipState = {
  status: "loading" | "ready" | "missing";
  en: number;
  hi: number;
  manifest: ClipManifest | null;
};

const LOADING: ClipState = { status: "loading", en: 0, hi: 0, manifest: null };
let state: ClipState = LOADING;
let started = false;
const listeners = new Set<() => void>();

const set = (next: ClipState) => {
  state = next;
  listeners.forEach((l) => l());
};

export const subscribeClips = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getClipState = () => state;
export const getServerClipState = () => LOADING;

/** Fetch the manifest once (call again with force=true after regenerating clips). */
export function loadClipManifest(force = false): void {
  if (started && !force) return;
  started = true;
  fetch("/audio/manifest.json", { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((raw) => {
      const manifest = parseManifest(raw);
      const counts = clipCounts(manifest);
      set({ status: manifest.generated && counts.en + counts.hi > 0 ? "ready" : "missing", ...counts, manifest });
    })
    .catch(() => set({ status: "missing", en: 0, hi: 0, manifest: null }));
}
