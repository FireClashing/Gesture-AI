"""FastAPI prediction service.

    python -m uvicorn api:app --app-dir ml --port 8000

Environment variables
    SIGNA_MODEL_PATH             override model file
    SIGNA_CONFIDENCE_THRESHOLD   below this, /predict returns UNKNOWN (default 0.65)
    SIGNA_CORS_ORIGINS           comma-separated allowed origins
                                 (default http://localhost:3000,http://127.0.0.1:3000)
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from features import FEATURE_COUNT, INPUT_FORMAT
from inference import GestureModel, ModelError

try:
    gesture_model: GestureModel | None = GestureModel()
    load_error: str | None = None
except ModelError as exc:  # keep the server up so /health can explain what is wrong
    gesture_model, load_error = None, str(exc)

app = FastAPI(title="Signa ISL Gesture API")
origins = [o.strip() for o in os.getenv(
    "SIGNA_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


class PredictionRequest(BaseModel):
    features: list[float] = Field(..., min_length=1, max_length=FEATURE_COUNT)


@app.get("/")
def home():
    return {"message": "Signa ISL Gesture API", "input_format": INPUT_FORMAT, "feature_count": FEATURE_COUNT}


@app.get("/health")
def health():
    if gesture_model is None:
        return {"status": "degraded", "model_loaded": False, "error": load_error}
    return {"status": "healthy", "model_loaded": True, "model": gesture_model.model_name,
            "input_format": INPUT_FORMAT, "feature_count": gesture_model.feature_count,
            "threshold": gesture_model.threshold, "gestures": gesture_model.labels}


@app.post("/predict")
def predict(request: PredictionRequest):
    if gesture_model is None:
        raise HTTPException(status_code=503, detail=load_error)
    try:
        return gesture_model.predict(request.features)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
