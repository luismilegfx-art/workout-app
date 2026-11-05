"""Genera la voz grabada de la app con Piper (voz es_AR-daniela-high).

Uso: python3 herramientas/voz/generar.py <modelo.onnx> herramientas/voz/frases.json assets/voz
Escribe un mp3 por frase y assets/voz/manifest.json (clave → archivo). Requiere: pip install piper-tts, ffmpeg.
El modelo se descarga de Hugging Face (rhasspy/piper-voices, es/es_AR/daniela/high).
"""
import json, os, re, subprocess, sys, tempfile, unicodedata, wave
from piper import PiperVoice, SynthesisConfig

model, frases_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
frases = json.load(open(frases_path, encoding="utf-8"))
voice = PiperVoice.load(model)
cfg = SynthesisConfig(length_scale=0.95)          # un poco más ágil que el ritmo por defecto

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "frase"

manifest, used = {}, set()
with tempfile.TemporaryDirectory() as tmp:
    for key, text in frases.items():
        name = slug(key); base = name; i = 2
        while name in used: name = f"{base}-{i}"; i += 1
        used.add(name)
        wav = os.path.join(tmp, name + ".wav")
        with wave.open(wav, "wb") as wf:
            voice.synthesize_wav(text, wf, syn_config=cfg)
        # mp3 mono 48 kb/s: claro para voz, archivos pequeños; recorta silencios al inicio y al final
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-af",
                        "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                        "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k", os.path.join(out, name + ".mp3")], check=True)
        manifest[key] = name + ".mp3"
# silencio corto para desbloquear el audio en iPhone
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "0.2",
                "-c:a", "libmp3lame", "-b:a", "32k", os.path.join(out, "silencio.mp3")], check=True)
json.dump(manifest, open(os.path.join(out, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(manifest), "frases")
