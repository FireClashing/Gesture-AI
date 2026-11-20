"""Train the ISL gesture classifier.

    python ml/train.py                       # all CSVs in dataset/
    python ml/train.py --select-from all     # allow non-exportable winners (RF/SVM)
    python ml/train.py --min-distance 0      # keep every frame

What it does
  1. Loads every ``dataset/*.csv`` (canonical v2 or legacy left/right format).
  2. Drops invalid rows and near-duplicate consecutive frames.
  3. Evaluates each candidate with leave-one-group-out CV (groups = signers when
     >= 2 signers exist, otherwise capture sessions). Augmentation is applied to
     training folds only, never to the held-out group.
  4. Picks the best model by pooled macro-F1, refits on all data and writes:
       ml/models/gesture_model.joblib          (served by ml/api.py)
       public/models/gesture-model.json        (in-browser inference; MLP/logreg)
       src/data/model-metrics.json             (read by the Insights page)
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.model_selection import LeaveOneGroupOut

from data import DATASET_DIR, PROJECT_ROOT, clean, load_dataset, matrix, thin_near_duplicates
from features import FEATURE_COUNT, INPUT_FORMAT, feature_columns
from modeling import ALL_CANDIDATES, EXPORTABLE, export_browser_model, fit

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "gesture_model.joblib"
BROWSER_MODEL_PATH = PROJECT_ROOT / "public" / "models" / "gesture-model.json"
METRICS_PATH = PROJECT_ROOT / "src" / "data" / "model-metrics.json"
ALPHABET = [chr(c) for c in range(65, 91)]
SEED = 42


def pick_groups(df) -> tuple[str, np.ndarray]:
    known = df.loc[df["signer"] != "unknown", "signer"].nunique()
    if known >= 2 and (df["signer"] == "unknown").mean() < 0.5:
        return "leave-one-signer-out", df["signer"].to_numpy()
    return "leave-one-session-out", df["session"].to_numpy()


def cross_validate(name, X, y, groups, augment_copies):
    pooled_true, pooled_pred, folds = [], [], 0
    for train_idx, test_idx in LeaveOneGroupOut().split(X, y, groups):
        if len(set(y[train_idx])) < 2:
            continue  # cannot train a classifier on one class
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ConvergenceWarning)
            model = fit(name, X[train_idx], y[train_idx], SEED, augment_copies)
        pooled_true.extend(y[test_idx])
        pooled_pred.extend(model.predict(X[test_idx]))
        folds += 1
    return np.array(pooled_true), np.array(pooled_pred), folds


def build_warnings(labels, df, strategy, folds, best_f1) -> list[str]:
    out = []
    missing = [c for c in ALPHABET if c not in labels]
    if missing:
        out.append(f"Only {len(labels)} of 26 alphabet letters have data ({', '.join(labels)}). "
                   f"The model can never output the other {len(missing)} letters until they are collected.")
    if df["signer"].nunique() < 2 or (df["signer"] == "unknown").all():
        out.append("Only one (or no recorded) signer. Results measure generalisation across capture sessions, "
                   "not across people. Record a signer name in the Training Studio and collect several people.")
    if df["session"].nunique() < 3:
        out.append("Fewer than 3 capture sessions. Collect each letter in several sessions "
                   "(different days, lighting and distances).")
    per_label = df["label"].value_counts()
    if len(per_label) and per_label.min() < 30:
        out.append(f"Some labels have fewer than 30 de-duplicated samples (smallest: {per_label.idxmin()} = {int(per_label.min())}).")
    if folds < 2:
        out.append("Too few evaluation folds to trust any accuracy figure.")
    if len(labels) <= 2:
        out.append("With only two classes, chance accuracy is 50%; treat the numbers as a smoke test, not a benchmark.")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", nargs="*", type=Path, help="CSV files (default: dataset/*.csv)")
    ap.add_argument("--min-distance", type=float, default=0.15, help="near-duplicate threshold (0 = off)")
    ap.add_argument("--augment-copies", type=int, default=3)
    ap.add_argument("--candidates", nargs="*", default=list(ALL_CANDIDATES), choices=ALL_CANDIDATES)
    ap.add_argument("--select-from", choices=("exportable", "all"), default="exportable",
                    help="exportable = only models that can also run in the browser (default)")
    args = ap.parse_args()

    df = load_dataset(args.csv)
    files = sorted(df["source"].unique().tolist())
    raw_n = len(df)
    df, invalid = clean(df)
    df = thin_near_duplicates(df, args.min_distance)
    X, y = matrix(df), df["label"].to_numpy(str)
    labels = sorted(set(y))

    print(f"Files: {files}\nRows: {raw_n} raw | {invalid} invalid | {len(df)} after de-duplication")
    print("Samples per label:", df["label"].value_counts().sort_index().to_dict())
    print(f"Signers: {df['signer'].nunique()} | sessions: {df['session'].nunique()}")
    if len(labels) < 2:
        raise SystemExit("ERROR: need at least two labels to train a classifier.")

    strategy, groups = pick_groups(df)
    if len(set(groups)) < 2:
        raise SystemExit("ERROR: need at least two sessions/signers for an out-of-group evaluation.")
    print(f"Evaluation: {strategy} ({len(set(groups))} groups)\n")

    results, preds = [], {}
    for name in args.candidates:
        yt, yp, folds = cross_validate(name, X, y, groups, args.augment_copies)
        if folds == 0:
            continue
        acc = accuracy_score(yt, yp)
        f1 = f1_score(yt, yp, average="macro", labels=labels, zero_division=0)
        results.append({"name": name, "accuracy": round(acc, 4), "macroF1": round(f1, 4),
                        "folds": folds, "exportable": name in EXPORTABLE})
        preds[name] = (yt, yp)
        print(f"  {name:14s} accuracy={acc:.3f} macro-F1={f1:.3f} ({folds} folds)")

    pool = [r for r in results if r["exportable"]] if args.select_from == "exportable" else results
    if not pool:
        raise SystemExit("ERROR: no candidate could be evaluated.")
    best = max(pool, key=lambda r: (r["macroF1"], r["accuracy"]))
    yt, yp = preds[best["name"]]
    print(f"\nSelected: {best['name']}")

    p, r_, f, s = precision_recall_fscore_support(yt, yp, labels=labels, zero_division=0)
    per_class = [{"label": l, "precision": round(float(a), 4), "recall": round(float(b), 4),
                  "f1": round(float(c), 4), "support": int(d)} for l, a, b, c, d in zip(labels, p, r_, f, s)]
    cm = confusion_matrix(yt, yp, labels=labels).tolist()
    for row in per_class:
        print(f"  {row['label']:>4s} P={row['precision']:.2f} R={row['recall']:.2f} F1={row['f1']:.2f} n={row['support']}")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        final = fit(best["name"], X, y, SEED, args.augment_copies)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": final, "feature_columns": feature_columns(), "feature_count": FEATURE_COUNT,
        "input_format": INPUT_FORMAT, "labels": labels, "model_name": best["name"],
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }, MODEL_PATH)
    print(f"\nSaved API model:     {MODEL_PATH}")

    export = export_browser_model(final)
    BROWSER_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if export:
        BROWSER_MODEL_PATH.write_text(json.dumps(export, separators=(",", ":")))
        print(f"Saved browser model: {BROWSER_MODEL_PATH}")
    else:
        BROWSER_MODEL_PATH.unlink(missing_ok=True)
        print("Selected model is not exportable; the frontend will use the API.")

    counts = df["label"].value_counts().sort_index()
    metrics = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "inputFormat": INPUT_FORMAT, "featureCount": FEATURE_COUNT, "handsSupported": 2,
        "datasetFiles": files,
        "samples": {"raw": raw_n, "invalid": invalid, "used": len(df)},
        "labels": labels, "labelCounts": {k: int(v) for k, v in counts.items()},
        "signers": int(df["signer"].nunique()), "sessions": int(df["session"].nunique()),
        "evaluation": {"strategy": strategy, "groups": int(len(set(groups))), "candidates": results,
                       "selected": best["name"], "accuracy": best["accuracy"], "macroF1": best["macroF1"],
                       "perClass": per_class, "confusion": {"labels": labels, "matrix": cm}},
        "deployment": {"api": MODEL_PATH.name, "browser": BROWSER_MODEL_PATH.name if export else None},
        "warnings": build_warnings(labels, df, strategy, best["folds"], best["macroF1"]),
    }
    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2) + "\n")
    print(f"Saved metrics:       {METRICS_PATH}")
    for w in metrics["warnings"]:
        print(f"WARNING: {w}")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, ValueError) as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
