"""Candidate models, training-time augmentation and browser export."""
from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from features import FEATURE_COUNT, HAND_VALUES, INPUT_FORMAT

# Models whose weights can be exported to JSON and run in the browser.
EXPORTABLE = ("mlp", "logreg")
ALL_CANDIDATES = ("mlp", "logreg", "svm", "random_forest")


def make_model(name: str, seed: int = 42):
    if name == "mlp":
        clf = MLPClassifier(hidden_layer_sizes=(64, 32), alpha=1e-3, max_iter=800, random_state=seed)
        return Pipeline([("scaler", StandardScaler()), ("clf", clf)])
    if name == "logreg":
        clf = LogisticRegression(C=1.0, max_iter=3000, class_weight="balanced")
        return Pipeline([("scaler", StandardScaler()), ("clf", clf)])
    if name == "svm":
        # SVC(probability=True) is deprecated in scikit-learn 1.9; calibrate explicitly.
        clf = CalibratedClassifierCV(SVC(C=3.0, class_weight="balanced"), ensemble=False, cv=3)
        return Pipeline([("scaler", StandardScaler()), ("clf", clf)])
    if name == "random_forest":
        return Pipeline([("clf", RandomForestClassifier(
            n_estimators=300, min_samples_leaf=2, class_weight="balanced_subsample",
            random_state=seed, n_jobs=-1))])
    raise ValueError(f"Unknown model: {name}")


def augment(X: np.ndarray, y: np.ndarray, copies: int = 3, noise: float = 0.01,
            max_rot_deg: float = 10.0, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """Return X/y plus ``copies`` jittered versions (small in-plane rotation of
    each present hand and Gaussian noise). Apply to *training* data only."""
    rng = np.random.default_rng(seed)
    xs, ys = [X], [y]
    for _ in range(copies):
        Xa = X.copy()
        theta = rng.normal(0.0, math.radians(max_rot_deg) / 2.0, size=len(X))
        c, s = np.cos(theta)[:, None], np.sin(theta)[:, None]
        for slot in (0, 1):
            base = slot * HAND_VALUES
            present = (Xa[:, HAND_VALUES * 2 + slot] > 0.5)[:, None]
            px = Xa[:, base:base + HAND_VALUES:3].copy()
            py = Xa[:, base + 1:base + HAND_VALUES:3].copy()
            Xa[:, base:base + HAND_VALUES:3] = np.where(present, c * px - s * py, px)
            Xa[:, base + 1:base + HAND_VALUES:3] = np.where(present, s * px + c * py, py)
            jitter = rng.normal(0.0, noise, size=(len(X), HAND_VALUES)) * present
            Xa[:, base:base + HAND_VALUES] += jitter
        xs.append(Xa)
        ys.append(y)
    return np.vstack(xs), np.concatenate(ys)


def fit(name: str, X: np.ndarray, y: np.ndarray, seed: int = 42, augment_copies: int = 3):
    Xa, ya = augment(X, y, copies=augment_copies, seed=seed) if augment_copies else (X, y)
    model = make_model(name, seed)
    model.fit(Xa, ya)
    return model


def export_browser_model(pipeline: Pipeline) -> dict | None:
    """Serialise an MLP / logistic-regression pipeline for ``src/lib/signa/mlp.ts``."""
    scaler = pipeline.named_steps.get("scaler")
    clf = pipeline.steps[-1][1]
    if scaler is None:
        return None
    r = lambda a: np.round(np.asarray(a, dtype=float), 6).tolist()
    if isinstance(clf, MLPClassifier):
        layers = []
        for i, (w, b) in enumerate(zip(clf.coefs_, clf.intercepts_)):
            last = i == len(clf.coefs_) - 1
            layers.append({"w": r(w), "b": r(b),
                           "activation": clf.out_activation_ if last else clf.activation})
    elif isinstance(clf, LogisticRegression):
        activation = "logistic" if len(clf.classes_) == 2 else "softmax"
        layers = [{"w": r(clf.coef_.T), "b": r(clf.intercept_), "activation": activation}]
    else:
        return None
    return {
        "format": "signa-mlp-v1",
        "inputFormat": INPUT_FORMAT,
        "featureCount": FEATURE_COUNT,
        "labels": [str(c) for c in clf.classes_],
        "scaler": {"mean": r(scaler.mean_), "scale": r(scaler.scale_)},
        "layers": layers,
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def numpy_forward(export: dict, X: np.ndarray) -> np.ndarray:
    """Reference implementation of the browser forward pass (used by tests)."""
    h = (X - np.array(export["scaler"]["mean"])) / np.array(export["scaler"]["scale"])
    for layer in export["layers"]:
        z = h @ np.array(layer["w"]) + np.array(layer["b"])
        a = layer["activation"]
        if a == "relu":
            h = np.maximum(z, 0)
        elif a == "tanh":
            h = np.tanh(z)
        elif a == "logistic":
            h = 1 / (1 + np.exp(-z))
        elif a == "identity":
            h = z
        elif a == "softmax":
            e = np.exp(z - z.max(axis=1, keepdims=True))
            h = e / e.sum(axis=1, keepdims=True)
        else:
            raise ValueError(a)
    if h.shape[1] == 1:  # binary logistic output
        h = np.hstack([1 - h, h])
    return h
