/**
 * Majority-vote smoothing over the last N predictions.
 *
 * A gesture is emitted once it holds `minVotes` of the last `window` frames.
 * The same gesture is not emitted again until the signer "releases" it
 * (`releaseFrames` consecutive frames of something else, or no hand), so
 * fingerspelling a double letter ("LL") works while a held pose does not repeat.
 */
export type VoterOptions = {
  window: number;
  minVotes: number;
  minConfidence: number;
  releaseFrames: number;
};

export const DEFAULT_VOTER: VoterOptions = { window: 5, minVotes: 3, minConfidence: 0.65, releaseFrames: 3 };

export class StabilityVoter {
  private history: (string | null)[] = [];
  private lastEmitted: string | null = null;
  private release = 0;
  private readonly opts: VoterOptions;

  constructor(options: Partial<VoterOptions> = {}) {
    this.opts = { ...DEFAULT_VOTER, ...options };
    if (this.opts.minVotes * 2 <= this.opts.window) {
      throw new Error("minVotes must be a majority of window.");
    }
  }

  /** Pass `null` when no hand is visible. Returns a gesture when one becomes stable. */
  push(entry: { gesture: string; confidence: number } | null): string | null {
    const valid =
      entry && entry.gesture !== "UNKNOWN" && entry.confidence >= this.opts.minConfidence ? entry.gesture : null;
    this.history.push(valid);
    if (this.history.length > this.opts.window) this.history.shift();

    if (this.lastEmitted !== null) {
      this.release = valid === this.lastEmitted ? 0 : this.release + 1;
      if (this.release >= this.opts.releaseFrames) this.lastEmitted = null;
    }

    const votes = new Map<string, number>();
    for (const g of this.history) if (g) votes.set(g, (votes.get(g) ?? 0) + 1);
    let best: string | null = null;
    let bestVotes = 0;
    for (const [g, n] of votes) {
      if (n >= this.opts.minVotes && g !== this.lastEmitted && n > bestVotes) {
        best = g;
        bestVotes = n;
      }
    }
    if (best) {
      this.lastEmitted = best;
      this.release = 0;
    }
    return best;
  }

  reset(): void {
    this.history = [];
    this.lastEmitted = null;
    this.release = 0;
  }
}
