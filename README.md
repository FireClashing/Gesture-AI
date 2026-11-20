# signa - Indian Sign Language gesture workspace

Webcam hand tracking (MediaPipe) -> canonical landmark features -> classifier -> English + Hindi subtitles and speech.
Built with Next.js 16 / React 19 on the front end and scikit-learn + FastAPI on the ML side.

| Page | What it does |
|---|---|
| **Live Translator** | Real-time recognition, majority-vote smoothing, *Words* or *Fingerspelling* transcript, bilingual text-to-speech |
| **Training Studio** | Capture labelled samples (with signer + session metadata) and short motion clips; data persists in the browser until exported |
| **Model Testing** | Live predictions with the top-3 class scores |
| **Model Insights** | Real metrics from the last training run: coverage, held-out accuracy, per-class results, confusion matrix, data-quality warnings |

> **New to this project? Read [`HACKATHON_GUIDE.md`](HACKATHON_GUIDE.md)** - architecture, data flow, demo script and likely mentor Q&A.

## Quick start

```bash
# 1. Web app (Node 20+; 22 recommended)
npm install              # also self-hosts MediaPipe WASM + hand model (needs network once)
npm run dev              # http://localhost:3000

# 2. Python (3.10+) - only needed to retrain or to use the API backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
npm run train            # trains, evaluates, and writes every model/metrics file

# 3. Voice pack (once, needs internet): bundled English + Hindi audio so speech works on any device
pip install -r requirements-voice.txt
npm run generate:voice   # writes public/audio/*.mp3 + manifest.json - commit them
npm run api              # optional: FastAPI on http://127.0.0.1:8000
```

The app works **without the API**: `npm run train` also exports the model to `public/models/gesture-model.json`, which runs in the browser.
Copy `.env.example` to `.env.local` to change the backend, API URL or confidence threshold.

## Architecture

### Speech
Text-to-speech does **not** depend on voices installed on the user's device. `scripts/generate_voice_clips.py` creates ~68 short clips
(26 letters + 8 words, English + Hindi) once; `src/lib/signa/speechEngine.ts` plays them (`clips.ts` builds the playlist from
`public/audio/manifest.json`). The device's browser voice is only a fallback (engine setting: Auto / Built-in audio / Browser voice).

```
camera -> MediaPipe HandLandmarker (self-hosted WASM) -> src/lib/signa/features.ts   (128 values)
       -> predictor: in-browser MLP (public/models/gesture-model.json)  or  POST /predict (ml/api.py)
       -> StabilityVoter (majority vote + release rule) -> transcript -> subtitles / speech
```

```
src/app/                pages (server components); AppShell is mounted once, in layout.tsx
src/components/         CameraPanel, PredictionPanel, SubtitlePanel, TranslatorView, TrainingView, TestingView ...
src/hooks/              useHandTracking, useRecognition, useTranscript, useSpeech
src/lib/signa/          features, mlp (browser inference), smoothing, transcript, translations, predictor, config
src/data/               feature-schema.json (contract), model-metrics.json (written by train.py)
ml/                     features.py, data.py, modeling.py, train.py, inference.py, api.py, sequence.py, train_sequence.py
tests/ts, ml/tests      cross-language parity tests, unit tests
```

### Feature design (`canonical_hands_v2`, 128 values)
Two hand slots of 21 landmarks x (x, y, z), wrist-relative and divided by hand size (63 values each), plus two presence flags.

* Absolute wrist position and hand scale were **removed**; they let a model memorise where the signer sat.
* Hands labelled `Left` are **mirrored**, so left and right hands share one shape space and handedness cannot be a shortcut.
* Two hands are ordered by wrist x, not by MediaPipe's label (which can flip on mirrored cameras).
* `ml/features.py` and `src/lib/signa/features.ts` are the same algorithm; `tests/` verifies they agree on a shared fixture.

### Training and evaluation (`npm run train`)
1. Loads every `dataset/*.csv` (new format or the legacy `left_/right_` format).
2. Removes invalid rows and near-identical consecutive frames (`--min-distance`, default 0.15).
3. Leave-one-**signer**-out evaluation when >= 2 named signers exist, otherwise leave-one-**session**-out. Augmentation (small rotation + noise) touches training folds only.
4. Compares MLP, logistic regression, SVM and random forest; deploys the best **browser-exportable** model by macro-F1 (`--select-from all` to allow any).
5. Writes `ml/models/gesture_model.joblib`, `public/models/gesture-model.json`, `src/data/model-metrics.json`.

`.joblib` files depend on the scikit-learn version and are git-ignored; the JSON browser model is not.

### Motion signs (J, Z, HELLO ...)
A single frame cannot represent movement. In the Training Studio, use **Motion clips** to record short clips, export the `.jsonl`
into `dataset/sequences/`, then run `npm run train:sequence`. **Live use of the sequence model is not wired into the UI yet** - there is
no motion dataset to validate it against.

## Collecting data that makes the model trustworthy
The bundled dataset has **two letters (L, V), one signer, three sessions**, so the reported accuracy is a smoke test, not a benchmark
(the Insights page says so). To cover the alphabet:

1. Open **Training Studio**, enter a signer name, pick a letter, and capture varied samples (distance, angle, lighting, either hand).
2. Start a **new session** whenever the day/lighting/setup changes; use a different signer name per person.
3. **Export CSV**, drop it into `dataset/`, run `npm run train`, and read the warnings on **Model Insights**.

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev / build / start` | Next.js |
| `npm run lint`, `npm run typecheck` | ESLint, `tsc --noEmit` |
| `npm test` | TypeScript (`node --test`) + Python (`unittest`) suites |
| `npm run train`, `train:sequence` | Train models |
| `npm run api` | FastAPI (`/health`, `/predict`) |
| `npm run generate:voice` | Generate the bundled English/Hindi voice clips (`public/audio`) |
| `npm run setup:assets` | (Re)download MediaPipe assets |

## Configuration
| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_INFERENCE` | `auto` | `auto`, `browser` or `api` |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | API origin |
| `NEXT_PUBLIC_CONFIDENCE_THRESHOLD` | `0.65` | below this -> UNKNOWN |
| `SIGNA_MODEL_PATH`, `SIGNA_CONFIDENCE_THRESHOLD`, `SIGNA_CORS_ORIGINS` | see `ml/api.py` | API settings |

## Troubleshooting
* **"Could not load the hand tracker"** - run `npm run setup:assets` once while online (or allow the CDN fallback).
* **Sidebar says "API offline"** - you set `NEXT_PUBLIC_INFERENCE=api` or have no browser model. Run `npm run train` or `npm run api`.
* **"saved with a different scikit-learn version"** - run `npm run train` again.
* **No Hindi (or any) audio / "Built-in audio: not generated yet"** - run `npm run generate:voice` once. Without clips the app falls back to the device's own voices, and Hindi voices are often not installed.
