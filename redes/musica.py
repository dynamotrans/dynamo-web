"""Compone una pista corta ORIGINAL (sin derechos de terceros) para las historias de Dynamo Trans.

Uso: python3 redes/musica.py --mood upbeat|chill|minimal --seconds 12 --seed 3 --out /tmp/pista.wav

Es síntesis pura con numpy: pad de acordes, bajo, kick, hi-hat y arpegio. Cada seed da una pista distinta.
"""
import argparse, numpy as np
from scipy.io import wavfile

SR = 44100

def note(freq, dur, kind="sine", a=0.01, d=0.1, s=0.7, r=0.1, vol=0.3):
    n = int(SR * dur); t = np.arange(n) / SR
    if kind == "sine": w = np.sin(2 * np.pi * freq * t)
    elif kind == "saw": w = 2 * (t * freq % 1) - 1
    elif kind == "square": w = np.sign(np.sin(2 * np.pi * freq * t))
    elif kind == "tri": w = 2 * np.abs(2 * (t * freq % 1) - 1) - 1
    else: w = np.sin(2 * np.pi * freq * t)
    env = np.ones(n)
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    if A: env[:A] = np.linspace(0, 1, A)
    if D: env[A:A + D] = np.linspace(1, s, D)
    env[A + D:] = s
    if R: env[-R:] *= np.linspace(1, 0, R)
    return w * env * vol

def lowpass(x, cutoff):
    # filtro IIR de un polo, suficiente para suavizar
    rc = 1 / (2 * np.pi * cutoff); dt = 1 / SR; alpha = dt / (rc + dt)
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc); y[i] = acc
    return y

def kick(dur=0.35, vol=0.9):
    n = int(SR * dur); t = np.arange(n) / SR
    f = 120 * np.exp(-t * 18) + 40
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * vol

def hat(dur=0.08, vol=0.18, rng=None):
    n = int(SR * dur); t = np.arange(n) / SR
    noise = (rng or np.random).uniform(-1, 1, n)
    return noise * np.exp(-t * 60) * vol

def midi(m): return 440 * 2 ** ((m - 69) / 12)

MOODS = {
    "upbeat":  dict(bpm=112, prog=[[0, 4, 7, 11], [5, 9, 12, 16], [7, 11, 14, 17], [9, 12, 16, 19]], root=57, hats=2, pad="saw", cutoff=1800, arp=True),
    "chill":   dict(bpm=92,  prog=[[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], root=55, hats=1, pad="tri", cutoff=1200, arp=True),
    "minimal": dict(bpm=100, prog=[[0, 7, 12, 16], [5, 12, 16, 19], [0, 7, 12, 16], [7, 14, 17, 19]], root=52, hats=1, pad="sine", cutoff=900, arp=False),
}

def compose(mood="upbeat", seconds=12, seed=1):
    rng = np.random.RandomState(seed); m = MOODS[mood]
    beat = 60 / m["bpm"]; bar = beat * 4
    total = int(SR * seconds); out = np.zeros(total)
    tpos = 0.0; bar_i = 0
    while tpos < seconds:
        chord = m["prog"][bar_i % 4]
        # pad
        pad = sum(note(midi(m["root"] + 12 + c), bar, m["pad"], a=0.15, d=0.3, s=0.6, r=0.4, vol=0.08) for c in chord)
        pad = lowpass(pad, m["cutoff"])
        # bajo: fundamental en negras, con octava alterna
        bass = np.zeros(int(SR * bar))
        for b in range(4):
            f = midi(m["root"] + chord[0] - 12 + (12 if b == 3 and rng.rand() < .5 else 0))
            seg = note(f, beat * 0.9, "tri", a=0.005, d=0.1, s=0.5, r=0.08, vol=0.25)
            i = int(b * beat * SR); bass[i:i + len(seg)] += seg[:len(bass) - i]
        # batería
        drums = np.zeros(int(SR * bar))
        for b in range(4):
            i = int(b * beat * SR)
            if b in (0, 2):
                k = kick(); drums[i:i + len(k)] += k[:len(drums) - i]
            for h in range(m["hats"] * 2):
                j = i + int(h * beat / (m["hats"] * 2) * SR)
                hh = hat(vol=0.18 if h == 0 else 0.1, rng=rng); drums[j:j + len(hh)] += hh[:len(drums) - j]
        # arpegio
        arp = np.zeros(int(SR * bar))
        if m["arp"]:
            steps = 8; pattern = [chord[k % 4] + (12 if k >= 4 else 0) for k in range(steps)]
            rng.shuffle(pattern) if rng.rand() < .3 else None
            for k, c in enumerate(pattern):
                i = int(k * bar / steps * SR)
                seg = note(midi(m["root"] + 24 + c), bar / steps * 0.8, "sine", a=0.005, d=0.05, s=0.4, r=0.1, vol=0.12)
                arp[i:i + len(seg)] += seg[:len(arp) - i]
        mix = pad + bass + drums + arp
        i0 = int(tpos * SR); seg = mix[:total - i0]
        out[i0:i0 + len(seg)] += seg
        tpos += bar; bar_i += 1
    # fade in/out y normalización
    fi, fo = int(0.3 * SR), int(1.5 * SR)
    out[:fi] *= np.linspace(0, 1, fi); out[-fo:] *= np.linspace(1, 0, fo)
    out = out / (np.max(np.abs(out)) + 1e-9) * 0.85
    return (out * 32767).astype(np.int16)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mood", default="upbeat", choices=list(MOODS))
    ap.add_argument("--seconds", type=float, default=12)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    wavfile.write(a.out, SR, compose(a.mood, a.seconds, a.seed)); print(a.out)
