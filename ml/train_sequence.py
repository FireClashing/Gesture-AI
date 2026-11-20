"""Train a motion-clip classifier from dataset/sequences/*.jsonl.

    python ml/train_sequence.py

Uses leave-one-group-out evaluation (groups = signer + session) and saves
ml/models/sequence_model.joblib. Collect clips with the Training Studio's
"Motion clips" panel. Live in-browser use of this model is not wired up yet
because no motion dataset exists to validate it against.
"""
from __future__ import annotations

import argparse
import warnings
from pathlib import Path

import joblib
import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import classification_report
from sklearn.model_selection import LeaveOneGroupOut

from data import PROJECT_ROOT
from features import INPUT_FORMAT
from modeling import make_model
from sequence import POOLED_COUNT, T, load_clips

OUT = Path(__file__).resolve().parent / "models" / "sequence_model.joblib"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, default=PROJECT_ROOT / "dataset" / "sequences")
    ap.add_argument("--model", default="logreg", choices=("logreg", "mlp", "random_forest"))
    args = ap.parse_args()

    X, y, groups = load_clips(args.dir)
    if len(y) == 0:
        raise SystemExit(f"No clips found in {args.dir}. Record some in the Training Studio first.")
    print(f"{len(y)} clips, labels={sorted(set(map(str, y)))}, groups={len(set(groups))}")
    if len(set(y)) < 2:
        raise SystemExit("Need at least two labels.")

    if len(set(groups)) >= 2:
        yt, yp = [], []
        for tr, te in LeaveOneGroupOut().split(X, y, groups):
            if len(set(y[tr])) < 2:
                continue
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", ConvergenceWarning)
                m = make_model(args.model).fit(X[tr], y[tr])
            yt += list(y[te]); yp += list(m.predict(X[te]))
        print(classification_report(yt, yp, zero_division=0))
    else:
        print("Only one signer/session: skipping evaluation (record more sessions).")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        final = make_model(args.model).fit(X, y)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": final, "labels": [str(c) for c in final.classes_], "frames": T,
                 "pooled_count": POOLED_COUNT, "input_format": INPUT_FORMAT}, OUT)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
