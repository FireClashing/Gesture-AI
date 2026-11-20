"""Dataset loading (canonical v2 + legacy CSVs) and near-duplicate thinning."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from features import (
    FEATURE_COUNT, LANDMARKS, feature_columns, legacy_to_canonical,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = PROJECT_ROOT / "dataset"


def _legacy_cols(side: str) -> list[str]:
    return [f"{side}_{ax}{i}" for i in range(LANDMARKS) for ax in "xyz"]


def load_csv(path: Path) -> pd.DataFrame:
    """Return DataFrame[label, signer, session, timestamp, *canonical features]."""
    raw = pd.read_csv(path)
    cols = feature_columns()
    if "label" not in raw.columns:
        raise ValueError(f"{path.name}: missing 'label' column")

    if set(cols).issubset(raw.columns):
        feats = raw[cols].apply(pd.to_numeric, errors="coerce")
    elif "left_x0" in raw.columns and "right_x0" in raw.columns:
        num = lambda names: raw[names].apply(pd.to_numeric, errors="coerce").to_numpy(float)
        meta = lambda n: pd.to_numeric(raw[n], errors="coerce").to_numpy(float)
        matrix = legacy_to_canonical(
            num(_legacy_cols("left")), num(_legacy_cols("right")),
            meta("left_present"), meta("right_present"),
            meta("left_wrist_x"), meta("right_wrist_x"),
        )
        feats = pd.DataFrame(matrix, columns=cols, index=raw.index)
        # Rows with NaN in legacy input propagate NaN -> dropped below.
        bad = np.isnan(num(_legacy_cols("left"))).any(axis=1) | np.isnan(num(_legacy_cols("right"))).any(axis=1)
        feats.loc[bad, :] = np.nan
    else:
        raise ValueError(
            f"{path.name}: unrecognised format (expected canonical a_x0.. columns or legacy left_x0.. columns)"
        )

    session = raw["session_id"].astype("string").str.strip() if "session_id" in raw else pd.Series("session-0", index=raw.index)
    signer = raw["signer"].astype("string").str.strip() if "signer" in raw else pd.Series("unknown", index=raw.index)
    out = pd.DataFrame({
        "label": raw["label"].astype("string").str.strip().str.upper(),
        "signer": signer.fillna("unknown").replace("", "unknown"),
        "session": path.stem + ":" + session.fillna("session-0"),
        "timestamp": pd.to_datetime(raw["timestamp"], errors="coerce", utc=True) if "timestamp" in raw else pd.NaT,
        "source": path.name,
    })
    return pd.concat([out, feats], axis=1)


def load_dataset(paths: list[Path] | None = None) -> pd.DataFrame:
    paths = paths or sorted(DATASET_DIR.glob("*.csv"))
    if not paths:
        raise FileNotFoundError(f"No CSV files found in {DATASET_DIR}")
    frames = [load_csv(p) for p in paths]
    return pd.concat(frames, ignore_index=True)


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    cols = feature_columns()
    valid = df[cols].notna().all(axis=1) & df["label"].notna() & df["label"].ne("")
    valid &= np.isfinite(df[cols].to_numpy(float)).all(axis=1)
    return df.loc[valid].reset_index(drop=True), int((~valid).sum())


def thin_near_duplicates(df: pd.DataFrame, min_distance: float) -> pd.DataFrame:
    """Drop frames closer than ``min_distance`` (L2) to the last kept frame of
    the same (session, label). Removes the near-identical consecutive frames a
    held pose produces, so sample counts reflect real variety."""
    if min_distance <= 0 or df.empty:
        return df
    cols = feature_columns()
    keep: list[int] = []
    for _, group in df.groupby(["session", "label"], sort=False):
        group = group.sort_values("timestamp", kind="stable", na_position="last")
        X = group[cols].to_numpy(float)
        last = None
        for idx, row in zip(group.index, X):
            if last is None or float(np.linalg.norm(row - last)) >= min_distance:
                keep.append(idx)
                last = row
    return df.loc[sorted(keep)].reset_index(drop=True)


def matrix(df: pd.DataFrame) -> np.ndarray:
    X = df[feature_columns()].to_numpy(float)
    assert X.shape[1] == FEATURE_COUNT
    return X
