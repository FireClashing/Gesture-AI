"""Canonical hand-feature layout shared by training, the API and the browser.

Layout (128 values, ``canonical_hands_v2``):
    slot a: 21 landmarks x (x, y, z)  -> 63 values
    slot b: 21 landmarks x (x, y, z)  -> 63 values
    a_present, b_present              ->  2 flags

Design choices (see README "Feature design"):
  * Only hand *shape* is encoded. Absolute wrist position and hand scale were
    dropped because they let a model memorise where the signer sat.
  * Hands labelled "Left" are mirrored so left/right hands share one shape
    space and the model cannot use handedness as a shortcut.
  * Two hands are ordered by wrist x (image space), not by handedness label,
    which MediaPipe can flip on mirrored webcams.

``src/lib/signa/features.ts`` implements the same algorithm; both are checked
against ``src/data/feature-schema.json`` and a shared fixture by the tests.
"""
from __future__ import annotations

import numpy as np

INPUT_FORMAT = "canonical_hands_v2"
LANDMARKS = 21
AXES = ("x", "y", "z")
SLOTS = ("a", "b")
HAND_VALUES = LANDMARKS * len(AXES)  # 63
FEATURE_COUNT = HAND_VALUES * len(SLOTS) + len(SLOTS)  # 128
META_COLUMNS = ("label", "hand", "signer", "timestamp", "session_id")


def feature_columns() -> list[str]:
    cols = [f"{s}_{ax}{i}" for s in SLOTS for i in range(LANDMARKS) for ax in AXES]
    cols += [f"{s}_present" for s in SLOTS]
    return cols


def normalize_hand(raw: np.ndarray, side: str | None) -> np.ndarray:
    """raw: (21, 3) image-space landmarks -> 63 canonical values."""
    raw = np.asarray(raw, dtype=float)
    rel = raw - raw[0]
    scale = max(float(np.linalg.norm(rel, axis=1).max()), 1e-6)
    rel = rel / scale
    if side == "Left":
        rel[:, 0] = -rel[:, 0]
    return rel.reshape(-1)


def build_features(hands: list[tuple[np.ndarray, str | None]]) -> np.ndarray:
    """hands: [(raw (21,3) landmarks, 'Left'|'Right'|None), ...] -> (128,)."""
    ordered = sorted(hands[:2], key=lambda h: float(h[0][0][0]))  # stable
    vec = np.zeros(FEATURE_COUNT, dtype=float)
    for slot, (raw, side) in enumerate(ordered):
        vec[slot * HAND_VALUES:(slot + 1) * HAND_VALUES] = normalize_hand(raw, side)
        vec[HAND_VALUES * 2 + slot] = 1.0
    return vec


def hand_label(vec: np.ndarray, sides: list[str | None] | None = None) -> str:
    n = int(round(vec[-1] + vec[-2]))
    return {0: "None", 1: "One", 2: "Both"}[n]


def legacy_to_canonical(left: np.ndarray, right: np.ndarray,
                        left_present: np.ndarray, right_present: np.ndarray,
                        left_wrist_x: np.ndarray, right_wrist_x: np.ndarray) -> np.ndarray:
    """Convert legacy ``left_/right_`` (134-value) rows to canonical features.

    Legacy hands were already wrist-relative and scale-normalised, so only the
    mirroring of the left slot and the wrist-x ordering have to be applied.
    """
    n = len(left)
    out = np.zeros((n, FEATURE_COUNT), dtype=float)
    for i in range(n):
        hands = []
        if left_present[i] > 0.5:
            v = left[i].reshape(LANDMARKS, 3).copy()
            v[:, 0] = -v[:, 0]  # left -> mirrored
            hands.append((float(left_wrist_x[i]), v.reshape(-1)))
        if right_present[i] > 0.5:
            hands.append((float(right_wrist_x[i]), right[i].copy()))
        hands.sort(key=lambda h: h[0])
        for slot, (_, v) in enumerate(hands[:2]):
            out[i, slot * HAND_VALUES:(slot + 1) * HAND_VALUES] = v
            out[i, HAND_VALUES * 2 + slot] = 1.0
    return out
