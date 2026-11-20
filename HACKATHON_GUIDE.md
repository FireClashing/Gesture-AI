# Signa - Hackathon Study Guide

Read this top to bottom once (20 minutes). Then use the Q&A section (Part 7) to rehearse.

---

## Part 1 - The 30-second pitch (memorise this)

> "Signa recognises Indian Sign Language from a normal webcam. MediaPipe finds the 21 joints of each hand in real time.
> We turn those joints into a size- and position-independent feature vector, and a small neural network classifies the sign.
> The recognised signs become live English and Hindi subtitles and are spoken aloud in both languages.
> Everything runs in the browser - no video ever leaves the user's device - and we built a Training Studio so anyone can add new signs."

Three words that describe it: **landmarks -> classifier -> subtitles + voice**.

---

## Part 2 - The big picture

```
 Webcam video
     |
     v
 MediaPipe HandLandmarker   (Google's pre-trained model, runs in the browser)
     |   21 points (x, y, z) per hand, up to 2 hands
     v
 features.ts   ->  128 numbers   (shape of the hand only; position and size removed)
     |
     v
 Classifier   (small neural network, 100 KB JSON, runs in the browser)
     |   "L" with 99.9% confidence
     v
 Smoothing (StabilityVoter)   (only accept a sign if it is held steadily)
     |
     v
 Transcript   ->  English text + Hindi text
     |
     v
 Text-to-speech (Web Speech API)  ->  voice in English and/or Hindi
```

**Two halves of the project:**

| Half | Language | Job | When it runs |
|---|---|---|---|
| **Web app** (`src/`) | TypeScript / React / Next.js | Camera, hand tracking, UI, predictions, subtitles, speech, data collection | Every time a user opens the site |
| **ML pipeline** (`ml/`) | Python | Read the dataset, train and evaluate models, export them | Only when you retrain (`npm run train`) |

The Python side produces **files** the web app uses (`public/models/gesture-model.json`, `src/data/model-metrics.json`).
The Python API (`ml/api.py`) is an **optional** alternative way to get predictions.

---

## Part 3 - Folder map (what each thing is)

```
signa/
|- src/
|  |- app/                  The 5 pages (Next.js "App Router")
|  |   |- layout.tsx        Wraps every page in the sidebar (AppShell) - once
|  |   |- page.tsx          Overview/dashboard (numbers come from model-metrics.json)
|  |   |- translator/       Live Translator page
|  |   |- training/         Training Studio page
|  |   |- testing/          Model Testing page
|  |   '- insights/         Model Insights page (reads model-metrics.json)
|  |
|  |- components/           Visual building blocks
|  |   |- AppShell.tsx      Sidebar + mobile nav
|  |   |- BackendStatus.tsx Sidebar box: "In-browser model" / "API offline"
|  |   |- CameraPanel.tsx   Video + hand drawing + Start/Stop buttons
|  |   |- PredictionPanel   Big letter + confidence bar (+ top-3 scores when testing)
|  |   |- SubtitlePanel     English/Hindi text, speech buttons, voice settings
|  |   |- TranslatorView    Glues the hooks together for the translator page
|  |   |- TrainingView      Data collection UI (capture, export, motion clips)
|  |   '- TestingView       Same as translator but shows scores, no transcript
|  |
|  |- hooks/                Reusable logic (React "hooks")
|  |   |- useHandTracking   Camera + MediaPipe + the 30 FPS loop
|  |   |- useRecognition    Throttled predictions + smoothing
|  |   |- useTranscript     The list of recognised words/letters
|  |   '- useSpeech         Language choice, speed, voice detection, speaking
|  |
|  |- lib/signa/            Pure logic (no React) - the "brain" of the front end
|  |   |- features.ts       Landmarks -> 128 numbers      (MOST IMPORTANT FILE)
|  |   |- mlp.ts            Runs the neural network in the browser
|  |   |- predictor.ts      Chooses browser model or Python API
|  |   |- smoothing.ts      StabilityVoter (majority vote)
|  |   |- transcript.ts     Words mode vs Fingerspelling mode
|  |   |- translations.ts   Label -> English/Hindi text (A-Z + words)
|  |   |- speechEngine.ts   Speech orchestrator: bundled clips first, browser voice fallback
|  |   |- clips.ts          Manifest + playlist building for the bundled audio
|  |   |- clipStore.ts      Loads the audio manifest once
|  |   |- mediapipe.ts      Loads the hand tracker (local files, CDN fallback)
|  |   |- dataset.ts        Builds the CSV / motion-clip files for export
|  |   |- config.ts         All settings (thresholds, URLs, timings)
|  |   '- metrics.ts        Types for model-metrics.json
|  |
|  '- data/
|      |- feature-schema.json   The contract: "128 features, this layout"
|      '- model-metrics.json    Written by training; shown on Insights
|
|- ml/                      Python
|   |- features.py          Same algorithm as features.ts (kept identical by tests)
|   |- data.py              Loads CSVs, removes near-duplicate frames
|   |- modeling.py          Model definitions, augmentation, export to JSON
|   |- train.py             THE training script (run this)
|   |- inference.py / api.py  Optional FastAPI prediction server
|   |- sequence.py / train_sequence.py   Motion-clip experiment (see Part 8)
|   |- models/gesture_model.joblib       Trained model for the API
|   '- tests/               Python tests
|
|- dataset/isl_alphabet_dataset.csv      Your collected samples (letters L and V)
|- public/models/gesture-model.json      The model the browser runs
|- tests/ts/ + tests/fixtures/           TypeScript tests (+ shared Python<->TS fixtures)
|- scripts/setup-mediapipe-assets.mjs    Downloads/copies MediaPipe files for offline use
|- scripts/generate_voice_clips.py       Creates the 68 English/Hindi voice clips (run once)
|- public/audio/                         The voice clips + manifest.json
|- README.md, CHANGES.md, this guide
'- package.json, requirements.txt, .env.example, .github/workflows/ci.yml
```

---

## Part 4 - Follow one gesture through the system

You hold up the letter **L**. Here is exactly what happens, with the file responsible:

1. **Camera + tracking** - `useHandTracking.ts` opens the webcam and, ~30 times a second, asks MediaPipe to find hands.
   MediaPipe returns, for each hand, **21 landmarks** (wrist, each finger joint, fingertips) as (x, y, z) plus a label "Left"/"Right".
2. **Features** - `features.ts -> buildFeatures()` converts them to **128 numbers**:
   - subtract the wrist position from every point (so *where* your hand is in the frame no longer matters),
   - divide by the hand size (so *how close* you are to the camera no longer matters),
   - mirror "Left" hands (so a left hand L and a right hand L look the same to the model),
   - put each hand in a slot (63 numbers each = 21 x 3), plus 2 flags saying which slots are filled -> 63 + 63 + 2 = **128**.
3. **Prediction** - `useRecognition.ts` sends the 128 numbers to the predictor (at most every 100 ms).
   `predictor.ts` uses `mlp.ts` (neural network in the browser). Result: `{gesture: "L", confidence: 0.9997, scores: {...}}`.
   If confidence is under **0.65**, the gesture becomes `UNKNOWN`.
4. **Smoothing** - `smoothing.ts` keeps the last 5 predictions. A sign is **accepted only if it wins 3 of the last 5**. That stops flicker.
   The same sign is not accepted again until you "release" it (3 frames of something else or no hand) - so double letters like "LL" work but a held pose doesn't repeat forever.
5. **Transcript** - `useTranscript.ts` / `transcript.ts` adds it to the text. *Words* mode: each sign is a word. *Fingerspelling* mode: letters join into one word until you press Space.
6. **Translation** - `translations.ts` maps "L" to English "L" and Hindi "एल" (and e.g. HELLO -> "नमस्ते").
7. **Voice** - `speechEngine.ts` speaks the text in English, Hindi or both using the browser's built-in voices.

---

## Part 5 - The ML explained simply

**Why landmarks instead of the raw image?**
A neural network on raw images needs thousands of images per sign and is sensitive to background, skin tone and lighting.
MediaPipe already solved "where are the fingers". Using its 21 points means a tiny dataset works, it is fast on a laptop, and no image is stored.

**Why normalise (subtract wrist, divide by size, mirror left)?**
Without it the model could learn "L is whatever appears on the left of the screen" instead of "L is this hand shape".
Your original dataset actually had this problem: L and V were mostly recorded with different hands, so handedness was a shortcut.
The 128-feature design removes position, size and handedness, so the model must learn the *shape*.

**What is the model?**
An MLP (multi-layer perceptron): 128 inputs -> 64 neurons -> 32 neurons -> output probabilities. About 10,000 numbers (weights), stored in a 100 KB JSON file.
The browser multiplies the inputs through those weights (`mlp.ts`, ~40 lines). We checked the browser result matches scikit-learn to within 0.0000005.

**How is it trained and evaluated?** (`ml/train.py`)
1. Load all CSVs in `dataset/`. 343 rows -> **213 used** (130 were near-identical consecutive frames, removed so the model isn't tested on copies of what it trained on).
2. **Augmentation**: during training only, make 3 slightly rotated (about +/-10 degrees) and noisy copies of each sample so the model tolerates small differences.
3. **Leave-one-session-out evaluation**: you recorded 3 sessions. Train on 2, test on the 3rd, repeat 3 times. This measures *"does it work on a new recording?"*, which is far more honest than testing on frames from the same session.
4. Try 4 models and keep the best that can run in the browser.

**Results you can quote (real numbers from the last run):**

| Model | Held-out accuracy | Runs in browser? |
|---|---|---|
| MLP (deployed) | 96.2% | yes |
| Logistic regression | 95.8% | yes |
| SVM | 98.1% | no |
| Random forest | 99.1% | no |

Confusion matrix for the deployed model: L correct 104, L-as-V 4; V correct 101, V-as-L 4.

**Metric words:** *accuracy* = % correct. *Precision* = when it says "L", how often is it right. *Recall* = of all real Ls, how many it found.
*Macro-F1* = average of per-class F1 (balance of precision and recall), so a rare class can't hide.

**Important honesty:** the dataset has **2 letters, 1 signer, 3 sessions**. With 2 classes, random guessing is 50%. So 96% shows the pipeline works - it is **not** a claim about all of ISL. The Insights page says this itself.

---

## Part 6 - Text-to-speech (English + Hindi)

**The problem we solved:** the browser's built-in speech (`speechSynthesis`) only uses voices *installed on the user's device*.
English is almost always there; **Hindi often is not** (many Windows laptops). So relying on it alone is fragile.

**Our solution: ship the voices with the app (bundled audio clips).**
Our vocabulary is tiny and fixed - 26 letters + 8 words, in 2 languages = **68 short audio files**. We generate them once
(`npm run generate:voice`, ~15 seconds, needs internet once) and commit them to `public/audio/`. After that the app speaks on **any device, offline**,
with no voice installed. (MediaPipe cannot do this - it only *recognises* things; it has no speech synthesis.)

**How a sentence is spoken** (`speechEngine.ts`, `clips.ts`):
1. The transcript gives a list of *labels* grouped into words, e.g. `[["H","I"], ["YES"]]` (spelled "HI" then the word YES).
2. For each language, `resolveClips` looks each label up in `public/audio/manifest.json` and builds a playlist: `en/H.mp3, en/I.mp3, (pause), en/YES.mp3`.
   Letters inside one word have a 60 ms gap; between words 300 ms.
3. The clips play one after another using the normal HTML `Audio` element. Speed slider = playback rate.
4. **Engine setting:** *Auto* (default) = use clips when every needed clip exists, otherwise the browser voice. *Built-in audio* = clips only. *Browser voice* = device voice only.
5. English plays first, then Hindi if "Both" is selected. Pressing Stop cancels everything immediately.

**Where the words come from:** `src/data/voice-script.json` says what to speak for each label. English letters are phonetic ("ay", "bee", "see") because a TTS engine reading the letter "A" would say the article "uh". A test checks the script and `translations.ts` never drift apart.

**How the clips are made:** `scripts/generate_voice_clips.py` calls a text-to-speech service **once, offline from the app**:
`edge` (Microsoft neural voices en-IN-Neerja / hi-IN-Swara, best quality), `gtts` (Google Translate voice), or `espeak` (fully offline, robotic).
Then it trims silence with ffmpeg (if installed) and writes the manifest. Both online engines use unofficial public endpoints - fine for a hackathon; for a commercial product use a licensed cloud TTS.

**What the user sees** (Subtitle panel): Speak / Stop, language selector (English / हिन्दी / Both), engine selector, speed slider, Test buttons,
"Built-in audio: ready - English 34 clips, Hindi 34 clips" status, and the detected browser voices (only the fallback).

**Say this to a mentor:** "We don't depend on the user's device having a Hindi voice. We pre-generate a small voice pack for our fixed vocabulary
and play it locally, with the browser's speech as a fallback for any custom text."

**Honest limits:**
- Whole-word pronunciation only exists for the 8 vocabulary words. A *spelled* word is read letter by letter ("aitch, eye") - which is correct for fingerspelling.
- A new custom word needs a clip (add it to `voice-script.json` and re-run the generator) or it falls back to the browser voice.
- If you have not run `npm run generate:voice`, the app silently uses browser voices and the panel says "not generated yet".

---

## Part 7 - Questions mentors will likely ask (with answers)

**Q: What does your project do / what problem does it solve?**
Real-time ISL recognition from a webcam, turned into bilingual subtitles and speech, to help communication between signers and non-signers. Includes a tool to collect data and retrain.

**Q: Why only two letters? / What is the accuracy?**
Honest answer: "This is a working end-to-end pipeline with a small starter dataset - letters L and V from one signer. On held-out recordings it scores about 96%, but with two classes that is a smoke test. The system is built so that adding signs is: record in the Training Studio, drop the CSV in `dataset/`, run `npm run train`." (Then, if you have time before the hackathon, collect more letters - see Part 9.)

**Q: Why MediaPipe landmarks and not a CNN on images?**
Much less data needed, runs fast on a laptop, is robust to background/lighting/skin tone, and no images are stored (privacy).

**Q: Why an MLP? Random forest scored higher.**
"Random forest and SVM scored slightly higher in our comparison, but they can't run inside the browser. The MLP can be exported to a 100 KB JSON and runs client-side - that means no server, lower latency, offline use and privacy. We chose deployability over a ~3 point difference on a tiny dataset. The API server can serve any model if we choose `--select-from all`."

**Q: How do you handle different hand sizes, distances and left/right hands?**
Normalisation: subtract the wrist, divide by hand size, mirror left hands. Plus rotation/noise augmentation in training.

**Q: How do you avoid flickering predictions?**
Majority vote: a sign must win 3 of the last 5 predictions, and repeats need a release in between. Plus a 65% confidence threshold - below it we show UNKNOWN.

**Q: How do you know it generalises? / Isn't that overfitting?**
We evaluate on a session the model never saw (leave-one-session-out) and removed near-duplicate frames so test data isn't a copy of training data. With more signers the app switches to leave-one-*signer*-out automatically. Limitation: one signer so far.

**Q: Where does the Hindi come from?**
A dictionary in `translations.ts` (label -> English/Hindi) and the browser's Hindi voice for audio. It is a lookup, not machine translation, so it is accurate for the labels we define but only covers those.

**Q: What if the user's device has no Hindi voice?**
It doesn't matter: we ship pre-generated English and Hindi audio clips for our whole vocabulary and play them locally. The browser voice is only a fallback for custom text. (Part 6)

**Q: Why not use MediaPipe for text-to-speech?**
MediaPipe is for perception (vision, audio *classification*); it has no speech synthesis. We use it for hand tracking and use a separate TTS step to make the audio pack.

**Q: What about privacy?**
Video is processed in the browser by MediaPipe; only 128 numbers per frame are used; nothing is uploaded. The optional Python API receives only those numbers, never images. (Note: some browsers use online TTS voices.)

**Q: What's the latency?**
Hand tracking ~30 FPS; prediction is a tiny matrix multiplication (under a millisecond), throttled to every 100 ms; a sign is confirmed after about 3 stable predictions (~0.3 s).

**Q: How would you add a new sign?**
Training Studio -> choose the label -> capture 40+ varied samples in 3 sessions (different days/lighting/signers) -> Export CSV -> put it in `dataset/` -> `npm run train` -> refresh. If it's a new word, add its English/Hindi text in `translations.ts`.

**Q: Does it handle signs with motion (J, Z, HELLO)?**
Not live yet. The current model reads one frame. We built the recording tool and a training script for motion clips (`train_sequence.py`), but we have no motion dataset to validate it, so it isn't enabled in the UI. That's our next step.

**Q: Does it do full sentences / ISL grammar?**
No. It recognises individual signs and can spell words letter by letter. ISL grammar translation is future work and a research problem.

**Q: What makes it different from other sign projects?**
Runs entirely in the browser; bilingual EN/HI output with speech; built-in data collection + honest evaluation dashboard; tests that keep Python and TypeScript feature code identical.

**Q: How did you test it?**
27 TypeScript and 15 Python automated tests. The key ones check that the TS and Python feature code give identical numbers, and that the browser neural network matches scikit-learn.

**Q: Who built what / did you use AI?**
Be honest and specific. Something like: "I used an AI assistant to help refactor and extend the project. I've gone through the architecture and can explain each part, and I made decisions like <X>." Mentors respect honesty far more than a bluff - and the guide you're reading is how you earn the right to say it.

**Q: What are the limitations?** (say this *before* they ask)
2 letters so far; single signer; static signs only; lighting/camera dependent; Hindi voice depends on the device; no sentence-level ISL grammar.

**Q: What's next?** Collect all 26 letters from several signers, add motion signs with the sequence model, add more words, mobile-friendly PWA.

---

## Part 8 - Honest status (know this cold)

| Works and tested | Exists but limited | Not done |
|---|---|---|
| Hand tracking, feature extraction, in-browser model, smoothing, English/Hindi subtitles, speech, data collection, training + evaluation, Insights page | Only letters **L** and **V** are recognised; one signer; motion-clip recorder + trainer exist but no live motion recognition | Other letters/words (need data), sentence grammar, real camera test of the whole app in CI |

**Not verified by me when I built it:** a full `next build`, ESLint, and a live webcam run. Do these yourself before the event:
`npm install` -> `npm run lint` -> `npm run build` -> `npm run dev`, then try the camera.

---

## Part 9 - Before the hackathon: checklist

1. `npm install` (needs internet once; downloads the hand-tracking files).
2. `npm run dev`, open http://localhost:3000, click **Live Translator -> Start Camera**. Sign **L** and **V**.
3. **Generate the voice pack once:** `pip install -r requirements-voice.txt` then `npm run generate:voice`, refresh the page, and confirm the panel says "Built-in audio: ready". Click **Test English** and **Test हिन्दी**. Commit `public/audio/`.
4. Optional but powerful: **collect more letters**. Use the **correct ISL chart** (ISL differs from American Sign Language). Target 40+ varied samples per letter, in 3 separate sessions (click *New session* between them), ideally with a friend as a second signer (change the signer name). Export CSV -> `dataset/` -> `npm run train`. Look at Model Insights.
5. Keep the browser model: `npm run train` regenerates `public/models/gesture-model.json` automatically.
6. Run `npm test` so you can say the tests pass.

**5-minute demo script**
1. Overview page: "workspace with four tools".
2. Training Studio: capture a few samples, show signer/session fields and the alphabet counter.
3. Terminal: `npm run train` - point at the evaluation lines and the warnings.
4. Model Insights: coverage, comparison table, confusion matrix, and the warning box (it shows you understand the limits).
5. Live Translator: sign L then V; show confidence, subtitles in English and Hindi; press Speak; switch language to Hindi; toggle Fingerspelling and Space.
6. Close with limitations and roadmap (Part 7, last two questions).

---

## Part 10 - Command cheat sheet

| Command | What it does |
|---|---|
| `npm run dev` | Start the website at localhost:3000 |
| `npm run train` | Train on everything in `dataset/`, print evaluation, update model + Insights |
| `npm run api` | (optional) start the Python prediction server on port 8000 |
| `npm test` | Run all tests |
| `npm run generate:voice` | (once) create the English/Hindi voice clips in `public/audio/` |
| `npm run setup:assets` | Re-download MediaPipe files |
| `npm run lint` / `npm run typecheck` / `npm run build` | Code quality checks / production build |

**Where do I look when asked "where is X?"**

| Question | File |
|---|---|
| How are features computed? | `src/lib/signa/features.ts` (and `ml/features.py`) |
| How does the browser run the model? | `src/lib/signa/mlp.ts` |
| How are predictions smoothed? | `src/lib/signa/smoothing.ts` |
| Where are Hindi translations? | `src/lib/signa/translations.ts` |
| How is speech done? | `src/lib/signa/speechEngine.ts`, `clips.ts`, `src/hooks/useSpeech.ts`, `scripts/generate_voice_clips.py` |
| How is the model trained/evaluated? | `ml/train.py`, `ml/modeling.py` |
| What thresholds/timings can I change? | `src/lib/signa/config.ts` |
| Where do the Insights numbers come from? | `src/data/model-metrics.json` (written by `ml/train.py`) |

---

## Glossary

- **Landmark** - one tracked point on the hand (21 per hand).
- **Feature vector** - the list of numbers (128) the model receives.
- **Normalisation** - removing position/size so only shape remains.
- **MLP / neural network** - layers of weighted sums that learn to map features to labels.
- **Softmax / confidence** - converts outputs to probabilities that sum to 1; the biggest is the confidence.
- **Threshold** - minimum confidence (0.65) to trust a prediction.
- **Overfitting** - memorising training data; fails on new data.
- **Augmentation** - training on slightly altered copies to improve robustness.
- **Cross-validation (leave-one-out)** - repeatedly hold out one group (session/person) as the test set.
- **Macro-F1** - class-balanced score combining precision and recall.
- **WASM** - compiled code that lets MediaPipe run fast in the browser.
- **Hook** - a reusable React function holding state/logic (`useSomething`).
- **Ref** - a React box that stores a value without re-drawing the screen (used for per-frame data).
- **TTS** - text-to-speech.
