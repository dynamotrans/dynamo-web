"""Convierte una imagen de historia (1080x1920) en un vídeo MP4 vertical fija (sin zoom) y música original.

Uso: python3 redes/video.py --image images/redes/AAAA-MM-DD-slug-story.jpg --out images/redes/AAAA-MM-DD-slug-story.mp4 [--seconds 12] [--mood drive|deep|cinematic] [--seed 3]
Requiere ffmpeg. La música se genera con musica.py (sin derechos de terceros).
"""
import argparse, subprocess, pathlib, tempfile, sys
HERE = pathlib.Path(__file__).parent

ap = argparse.ArgumentParser()
ap.add_argument("--image", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--seconds", type=int, default=12); ap.add_argument("--mood", default="drive"); ap.add_argument("--seed", type=int, default=1)
a = ap.parse_args()

wav = pathlib.Path(tempfile.mkdtemp()) / "pista.wav"
subprocess.run([sys.executable, str(HERE / "musica.py"), "--mood", a.mood, "--seconds", str(a.seconds + 1), "--seed", str(a.seed), "--out", str(wav)], check=True)

fps = 30; frames = a.seconds * fps
# imagen fija, sin zoom (el zoom recortaba los bordes) + fade de entrada/salida
vf = (f"scale=1080:1920,setsar=1,fps={fps},"
      f"fade=t=in:st=0:d=0.6,fade=t=out:st={a.seconds-0.8}:d=0.8,format=yuv420p")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", a.image, "-i", str(wav),
                "-vf", vf, "-t", str(a.seconds), "-r", str(fps),
                "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-level", "4.1",
                "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-shortest", "-movflags", "+faststart", a.out], check=True)
print(a.out)
