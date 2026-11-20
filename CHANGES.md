# What changed

| # | Problem found | Fix |
|---|---|---|
| 1 | UI promised A-Z + words; model only knew L, V | Cannot be fixed without data. Training Studio now persists samples, records signer/session, Insights shows exactly which letters are missing |
| 2 | Insights/dashboard hard-coded stale numbers | `ml/train.py` writes `src/data/model-metrics.json`; Insights and Dashboard render it |
| 3 | No trustworthy evaluation | Leave-one-signer/session-out CV, pooled per-class metrics, confusion matrix, 4-model comparison, auto-generated warnings |
| 4 | `AppShell` nested twice / invalid props / nested `<main>` | Shell only in `layout.tsx`; new `PageHeader`; pages use `<div>` |
| 5 | 1,247-line `Webcam.tsx` | Split into 4 hooks, 6 components, 3 views; no `any`; per-frame data stays in refs |
| 6 | Empty + case-duplicate files; duplicated translation tables | Deleted; one `translations.ts`; unused libs removed |
| 7 | CDN `@latest` WASM, runtime model download | Self-hosted via `npm run setup:assets`; exact version pin; pinned-CDN fallback; GPU->CPU delegate fallback |
| 8 | Hard-coded API URL/CORS/threshold | `.env.example`, `config.ts`, API env vars |
| 9 | Default README, no Python deps | Real README, `requirements.txt`, npm scripts, CI workflow |
| 10 | Position/scale/handedness leakage; near-duplicate frames | New canonical features (shape only, mirrored left hand, wrist-x ordering), de-duplication, augmentation, legacy CSV auto-conversion |
| 11 | Static signs only | Motion-clip recorder + `train_sequence.py` (live sequence inference not wired: no motion data to validate) |
| 12 | Pickled legacy model committed | Removed; `.joblib` git-ignored; version-mismatch error message; JSON browser model |
| 13 | Misc | Package renamed, `.gitignore` cleaned, real sidebar status, session-ID collision bug fixed (every page load used `session-1`), CSV formula-injection guard, tests (15 Python + 19 TypeScript) |

New: in-browser inference (no server needed), majority-vote smoothing with release rule, Fingerspelling mode (space/backspace), top-3 scores in Model Testing.

## Voice update
Speech no longer assumes the user has English/Hindi voices installed. 68 bundled clips (generated once with `npm run generate:voice`) are played by `speechEngine.ts`; the browser voice is the fallback. Added language (EN/HI/Both), engine and speed controls, status of bundled audio and detected voices, spelled-word playback letter by letter, reliable Stop. Tests: 27 TypeScript.
