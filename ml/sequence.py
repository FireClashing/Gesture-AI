"""Motion-clip utilities (Step 6: signs that need movement, e.g. J, Z, HELLO).

A clip is a short recording of per-frame canonical features (128 values/frame),
exported from the Training Studio as JSON Lines in ``dataset/sequences/``::

    {"label": "J", "signer": "asha", "session_id": "...", "fps": 30,
     "frames": [[...128 values...], ...]}

Each clip is resampled to a fixed number of frames and summarised with temporal
statistics so that an ordinary classifier can model motion.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from features import FEATURE_COUNT

T = 16  # frames after resampling
POOLED_COUNT = FEATURE_COUNT * 5


def resample(frames: np.ndarray, t: int = T) -> np.ndarray:
    frames = np.asarray(frames, dtype=float)
    if frames.ndim != 2 or frames.shape[1] != FEATURE_COUNT or len(frames) < 2:
        raise ValueError(f"clip must be (>=2, {FEATURE_COUNT}), got {frames.shape}")
    src = np.linspace(0.0, 1.0, len(frames))
    dst = np.linspace(0.0, 1.0, t)
    return np.stack([np.interp(dst, src, frames[:, j]) for j in range(frames.shape[1])], axis=1)


def pooled_features(frames: np.ndarray) -> np.ndarray:
    """mean, std, first, last, mean |delta| over time -> 640 values."""
    r = resample(frames)
    delta = np.abs(np.diff(r, axis=0)).mean(axis=0)
    return np.concatenate([r.mean(0), r.std(0), r[0], r[-1], delta])


def load_clips(directory: Path):
    X, y, groups = [], [], []
    for path in sorted(Path(directory).glob("*.jsonl")):
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if not line.strip():
                continue
            clip = json.loads(line)
            try:
                X.append(pooled_features(np.array(clip["frames"], dtype=float)))
            except ValueError as exc:
                print(f"skip {path.name}:{n}: {exc}")
                continue
            y.append(str(clip["label"]).upper())
            groups.append(f'{clip.get("signer") or "unknown"}|{path.stem}:{clip.get("session_id", "s0")}')
    return np.array(X), np.array(y), np.array(groups)
