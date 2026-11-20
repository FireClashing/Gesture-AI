"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { addGesture, addSpace, backspace, compose, groups, speechRequest, toRequest, type EntryMode, type Token } from "@/lib/signa/transcript";
import type { SpeakRequest } from "@/lib/signa/types";

/** Transcript state. Mutators return the text that was just completed (for auto-speak), if any. */
export function useTranscript() {
  const ref = useRef<Token[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const commit = useCallback((next: Token[]) => {
    ref.current = next;
    setTokens(next);
  }, []);

  const add = useCallback((gesture: string, mode: EntryMode): SpeakRequest | null => {
    const next = addGesture(ref.current, gesture, mode);
    if (next === ref.current) return null;
    commit(next);
    const last = next[next.length - 1];
    return last.kind === "word" ? toRequest(groups([last])) : null; // letters are spoken when the word is finished
  }, [commit]);

  const space = useCallback((): SpeakRequest | null => {
    const before = ref.current;
    const next = addSpace(before);
    if (next === before) return null;
    commit(next);
    const finished = before[before.length - 1].kind === "letter" ? groups(before).at(-1) : undefined;
    return finished ? toRequest([finished]) : null;
  }, [commit]);

  const undo = useCallback(() => commit(backspace(ref.current)), [commit]);
  const clear = useCallback(() => commit([]), [commit]);
  const text = useMemo(() => compose(tokens), [tokens]);
  const request = useMemo(() => speechRequest(tokens), [tokens]);

  return { tokens, text, request, add, space, undo, clear };
}
