"""Framework-independent model loading + prediction (used by api.py and tests)."""
from __future__ import annotations

import os
from pathlib import Path

import joblib
import numpy as np

from features import FEATURE_COUNT, INPUT_FORMAT

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "models" / "gesture_model.joblib"


class ModelError(RuntimeError):
    pass


class GestureModel:
    def __init__(self, path: Path | None = None, threshold: float | None = None):
        self.path = Path(path or os.getenv("SIGNA_MODEL_PATH") or DEFAULT_MODEL_PATH)
        self.threshold = float(threshold if threshold is not None
                               else os.getenv("SIGNA_CONFIDENCE_THRESHOLD", "0.65"))
        if not self.path.exists():
            raise ModelError(f"Model not found: {self.path}. Run `python ml/train.py` first.")
        try:
            saved = joblib.load(self.path)
        except Exception as exc:  # unpickling errors / sklearn version mismatch
            raise ModelError(
                f"Could not load {self.path.name} ({exc}). It was probably saved with a different "
                "scikit-learn version - retrain with `python ml/train.py`."
            ) from exc
        if saved.get("input_format") != INPUT_FORMAT:
            raise ModelError(
                f"{self.path.name} uses input format {saved.get('input_format')!r}, "
                f"expected {INPUT_FORMAT!r}. Retrain with `python ml/train.py`."
            )
        self.model = saved["model"]
        self.feature_count = int(saved.get("feature_count", FEATURE_COUNT))
        self.labels = [str(c) for c in self.model.classes_]
        self.model_name = saved.get("model_name", "unknown")

    def predict(self, features: list[float]) -> dict:
        if len(features) != self.feature_count:
            raise ValueError(f"expected {self.feature_count} features, got {len(features)}")
        x = np.asarray(features, dtype=float).reshape(1, -1)
        if not np.isfinite(x).all():
            raise ValueError("features must be finite numbers")
        proba = self.model.predict_proba(x)[0]
        order = np.argsort(proba)[::-1]
        best = int(order[0])
        confidence = float(proba[best])
        gesture = self.labels[best] if confidence >= self.threshold else "UNKNOWN"
        return {
            "gesture": gesture,
            "confidence": round(confidence, 4),
            "scores": {self.labels[i]: round(float(proba[i]), 4) for i in order[:3]},
        }
