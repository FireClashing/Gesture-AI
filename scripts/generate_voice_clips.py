#!/usr/bin/env python3
"""Generate the bundled English + Hindi voice clips (run once, needs internet).

    pip install -r requirements-voice.txt
    python scripts/generate_voice_clips.py                 # natural Microsoft neural voices (edge-tts)
    python scripts/generate_voice_clips.py --engine gtts   # Google Translate voice (gTTS)
    python scripts/generate_voice_clips.py --engine espeak # offline but robotic (needs espeak-ng installed)

Reads  src/data/voice-script.json   (what to say for each label, per language)
Writes public/audio/<lang>/<LABEL>.mp3  and  public/audio/manifest.json

~68 tiny files (letters + a few words, English + Hindi). Commit them: after that the
app speaks on ANY device with no browser voices installed and no internet.
Both online engines use unofficial public endpoints: fine for a project/hackathon, but
check the provider's terms (or use a licensed cloud TTS) for commercial use.

`--engine test-tone` writes short beeps. It exists only to test the plumbing, never ship it.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "src" / "data" / "voice-script.json"
EDGE_VOICES = {"en": "en-IN-NeerjaNeural", "hi": "hi-IN-SwaraNeural"}


def synth_edge(text: str, lang: str, out: Path) -> Path:
    import edge_tts  # pip install edge-tts

    asyncio.run(edge_tts.Communicate(text, EDGE_VOICES[lang]).save(str(out)))
    return out


def synth_gtts(text: str, lang: str, out: Path) -> Path:
    from gtts import gTTS  # pip install gTTS

    gTTS(text=text, lang=lang, tld="co.in" if lang == "en" else "com").save(str(out))
    return out


def synth_espeak(text: str, lang: str, out: Path) -> Path:
    exe = shutil.which("espeak-ng") or shutil.which("espeak")
    if not exe:
        raise RuntimeError("espeak-ng is not installed")
    wav = out.with_suffix(".wav")
    subprocess.run([exe, "-v", "hi" if lang == "hi" else "en-in", "-s", "140", "-w", str(wav), text], check=True)
    return wav


def synth_test_tone(text: str, lang: str, out: Path) -> Path:
    """TEST ONLY: a beep whose pitch depends on the text. Not speech."""
    wav = out.with_suffix(".wav")
    freq = 300 + (sum(map(ord, text)) % 500) + (150 if lang == "hi" else 0)
    rate, n = 16000, 3200
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * freq * i / rate))) for i in range(n)))
    return wav


ENGINES = {"edge": synth_edge, "gtts": synth_gtts, "espeak": synth_espeak, "test-tone": synth_test_tone}


def trim_silence(path: Path) -> Path:
    """Best effort: strip leading/trailing silence so spelled words sound snappy."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return path
    tmp = path.with_name(path.stem + ".trim" + path.suffix)
    flt = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
    result = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(path), "-af", flt, str(tmp)])
    if result.returncode == 0 and tmp.exists() and tmp.stat().st_size > 200:
        tmp.replace(path)
    else:
        tmp.unlink(missing_ok=True)
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", choices=ENGINES, default="edge")
    ap.add_argument("--out", type=Path, default=ROOT / "public" / "audio")
    ap.add_argument("--force", action="store_true", help="regenerate existing clips")
    ap.add_argument("--no-trim", action="store_true", help="skip ffmpeg silence trimming")
    args = ap.parse_args()

    script = json.loads(SCRIPT.read_text(encoding="utf-8"))
    synth = ENGINES[args.engine]
    clips: dict[str, dict[str, str]] = {"en": {}, "hi": {}}
    failures: list[str] = []

    for lang in ("en", "hi"):
        (args.out / lang).mkdir(parents=True, exist_ok=True)
        for label, text in script[lang].items():
            target = args.out / lang / f"{label}.mp3"
            existing = next((p for p in (target, target.with_suffix(".wav")) if p.exists()), None)
            try:
                if existing and not args.force:
                    produced = existing
                else:
                    produced = synth(text, lang, target)
                    if not args.no_trim and args.engine != "test-tone":
                        trim_silence(produced)
                clips[lang][label] = f"{lang}/{produced.name}"
                print(f"  {lang}/{label:<6} {text}")
            except Exception as exc:  # keep going, report at the end
                failures.append(f"{lang}/{label}: {exc}")
                print(f"  {lang}/{label:<6} FAILED: {exc}", file=sys.stderr)

    manifest = {
        "version": 1,
        "generated": not failures and args.engine != "test-tone",
        "engine": args.engine,
        "voices": EDGE_VOICES if args.engine == "edge" else {},
        "clips": clips,
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(len(v) for v in clips.values())
    print(f"\nWrote {total} clips + manifest.json to {args.out}")
    if failures:
        print(f"{len(failures)} clip(s) failed. Check your internet connection / installed packages and re-run.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
