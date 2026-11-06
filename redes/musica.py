"""Compone una pista corta ORIGINAL (sin derechos de terceros) para las historias de Dynamo Trans.

Uso: python3 redes/musica.py --mood drive|deep|cinematic --seconds 12 --seed 7 --out pista.wav

Moods (todos en tonalidad menor, producción "de agencia", nada infantil):
  drive      tech-house corporativo ~122 bpm: bombo 4x4, sidechain, bajo a contratiempo, pads anchos, pluck con delay
  deep       deep house ~118 bpm: acordes de 7ª en stabs, bajo redondo, hats con swing, mucha reverb
  cinematic  tráiler épico ~100 bpm: pads enormes, ostinato de cuerdas, toms, "braam" en el drop
Estructura: intro con filtro abriéndose + riser -> drop con impacto -> salida limpia.
Alias antiguos: upbeat=drive, chill=deep, minimal=cinematic. Cada seed cambia progresión, voicings y motivos.
Síntesis con numpy/scipy, salida WAV estéreo 44,1 kHz.
"""
import argparse
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
ALIAS = {"upbeat": "drive", "chill": "deep", "minimal": "cinematic"}
QUAL = {"m": [0, 3, 7], "M": [0, 4, 7], "m7": [0, 3, 7, 10], "M7": [0, 4, 7, 11], "7sus": [0, 5, 7, 10], "m9": [0, 3, 7, 10, 14]}


def T(n): return np.arange(n) / SR
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def _f(x, kind, fc, order=2):
    sos = butter(order, fc, kind, fs=SR, output="sos"); return sosfilt(sos, x)
def lp(x, fc, o=2): return _f(x, "low", min(fc, SR / 2 - 100), o)
def hp(x, fc, o=2): return _f(x, "high", fc, o)
def bp(x, lo, hi, o=2): return _f(x, "band", [lo, hi], o)


def saw(f, n, ph=0.0): return 2 * ((f * T(n) + ph) % 1) - 1
def env(n, a=0.005, d=0.1, s=0.7, r=0.05):
    e = np.full(n, s, dtype=float); A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A = min(A, n); e[:A] = np.linspace(0, 1, A) if A else e[:A]
    D2 = min(D, n - A); e[A:A + D2] = np.linspace(1, s, D2) if D2 else e[A:A + D2]
    if R and R < n: e[-R:] *= np.linspace(1, 0, R)
    return e


def pan(x, p):  # p in [-1,1]
    l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
    return np.vstack([x * l, x * r])


def place(buf, sig, t0, g=1.0):
    i = int(t0 * SR)
    if i >= buf.shape[1]: return
    if sig.ndim == 1: sig = np.vstack([sig, sig])
    n = min(sig.shape[1], buf.shape[1] - i); buf[:, i:i + n] += sig[:, :n] * g


def reverb(x, secs=2.2, decay=3.0, tone=6000, rng=None):
    rng = rng or np.random; n = int(secs * SR); t = T(n)
    irs = [lp(rng.randn(n), tone) * np.exp(-t * decay) for _ in range(2)]
    irs = [ir / np.sqrt((ir ** 2).sum()) for ir in irs]
    if x.ndim == 1: x = np.vstack([x, x])
    return np.vstack([fftconvolve(x[c], irs[c])[: x.shape[1]] for c in range(2)])


def delay(x, secs, fb=0.38, taps=5):
    out = x.copy(); d = int(secs * SR)
    for k in range(1, taps + 1):
        sh = d * k
        if sh >= x.shape[-1]: break
        g = fb ** k
        if x.ndim == 1: out[sh:] += x[:-sh] * g
        else:  # ping-pong
            c = k % 2; out[c, sh:] += (x[0, :-sh] + x[1, :-sh]) * 0.5 * g
    return out


# ---------------- instrumentos ----------------
def kick(punch=1.0, rng=None):
    n = int(0.5 * SR); t = T(n)
    f = 46 + 120 * np.exp(-t * 32) * punch
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.5)
    click = hp((rng or np.random).randn(n), 3000) * np.exp(-t * 350) * 0.35
    return np.tanh(1.8 * (body + click)) * 0.95


def clap(rng):
    n = int(0.6 * SR); t = T(n); x = np.zeros(n)
    for k, off in enumerate((0, 0.011, 0.023)):
        i = int(off * SR); seg = rng.randn(n - i) * np.exp(-T(n - i) * (60 if k < 2 else 18))
        x[i:] += seg
    return bp(x, 900, 4500) * 0.55


def snare(rng):
    n = int(0.5 * SR); t = T(n)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 28)
    noise = bp(rng.randn(n), 1500, 8000) * np.exp(-t * 16)
    return np.tanh(1.4 * (tone * 0.6 + noise * 0.7)) * 0.7


def hat(rng, open_=False):
    n = int((0.35 if open_ else 0.08) * SR); t = T(n)
    return hp(rng.randn(n), 7500, 4) * np.exp(-t * (11 if open_ else 75)) * 0.5


def tom(f0=95):
    n = int(0.7 * SR); t = T(n); f = f0 * (1 + 0.6 * np.exp(-t * 25))
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)) * 0.8


def supersaw(notes, dur, cutoff, rng, voices=7, spread=0.16, amp=0.06):
    n = int(dur * SR); L = np.zeros(n); R = np.zeros(n)
    det = np.linspace(-spread, spread, voices)
    for m in notes:
        f = midi(m)
        for k, c in enumerate(det):
            v = saw(f * 2 ** (c / 12), n, rng.rand())
            p = (k / (voices - 1)) * 2 - 1
            L += v * np.cos((p + 1) * np.pi / 4); R += v * np.sin((p + 1) * np.pi / 4)
    return np.vstack([lp(L, cutoff), lp(R, cutoff)]) * amp / max(1, len(notes) ** 0.5)


def bass_note(m, dur, cutoff=520, amp=0.5, sub=0.6):
    n = int(dur * SR); f = midi(m)
    s = lp(saw(f, n), cutoff, 4) * 0.55 + np.sin(2 * np.pi * f * T(n)) * sub
    return np.tanh(1.3 * s * env(n, 0.004, 0.12, 0.75, 0.04)) * amp


def pluck(m, dur=0.35, amp=0.22):
    n = int(dur * SR); t = T(n); f = midi(m)
    raw = saw(f, n) * 0.6 + np.sign(np.sin(2 * np.pi * f * 1.005 * t)) * 0.4
    bright = lp(raw, 4200) * np.exp(-t * 18); body = lp(raw, 1200) * np.exp(-t * 7)
    return (bright + body) * amp


def stab(notes, dur=0.22, cutoff=2200, amp=0.12):
    n = int(dur * SR); x = np.zeros(n)
    for m in notes:
        f = midi(m); x += saw(f, n) + saw(f * 1.004, n)
    return lp(x, cutoff) * env(n, 0.003, 0.08, 0.35, 0.06) * amp


def riser(dur, rng):
    n = int(dur * SR); t = T(n); r = (t / dur) ** 2.2
    noise = hp(rng.randn(n), 1500) * r * 0.35
    sweep = np.sin(2 * np.pi * np.cumsum(220 + 1400 * r) / SR) * r * 0.08
    return noise + sweep


def impact(rng):
    n = int(2.5 * SR); t = T(n)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 6)) / SR) * np.exp(-t * 2.2)
    crash = hp(rng.randn(n), 4000) * np.exp(-t * 2.8) * 0.25
    return np.tanh(1.5 * boom) * 0.8 + crash


def sidechain_curve(n, kicks, depth=0.65, rate=9.0):
    g = np.ones(n)
    for k in kicks:
        i = int(k * SR); m = min(n - i, int(0.6 * SR))
        if m <= 0: continue
        g[i:i + m] = np.minimum(g[i:i + m], 1 - depth * np.exp(-T(m) * rate))
    return g


# ---------------- composición ----------------
MOODS = {
    "drive": dict(bpm=122, root=45, progs=[[(0, "m"), (8, "M"), (3, "M"), (10, "M")], [(0, "m"), (10, "M"), (8, "M"), (7, "m")]]),
    "deep": dict(bpm=118, root=41, progs=[[(0, "m9"), (8, "M7"), (3, "M7"), (10, "7sus")], [(0, "m7"), (5, "m7"), (10, "7sus"), (3, "M7")]]),
    "cinematic": dict(bpm=100, root=38, progs=[[(0, "m"), (8, "M"), (3, "M"), (10, "M")], [(0, "m"), (8, "M"), (5, "m"), (7, "M")]]),
}


def compose(mood="drive", seconds=12.0, seed=1):
    mood = ALIAS.get(mood, mood); cfg = MOODS[mood]; rng = np.random.RandomState(seed)
    beat = 60 / cfg["bpm"]; bar = beat * 4; root = cfg["root"]
    prog = cfg["progs"][seed % 2]
    N = int(seconds * SR); nb = int(np.ceil(seconds / bar)) + 1
    drop_bar = 1 if mood == "cinematic" else 2
    drop_t = drop_bar * bar
    drums = np.zeros((2, N)); music = np.zeros((2, N)); fx = np.zeros((2, N)); bassb = np.zeros((2, N))
    kicks = []
    swing = 0.12 if mood == "deep" else 0.0
    motif = rng.choice([0, 3, 7, 10, 12, 15], 8)
    hat_vel = 0.6 + 0.4 * rng.rand(16)

    for b in range(nb):
        t0 = b * bar; deg, q = prog[b % 4]; chord = [deg + i for i in QUAL[q]]
        full = t0 >= drop_t - 1e-6
        inv = rng.randint(0, 2)
        voicing = [root + 12 + c + (12 if (inv and i == 0) else 0) for i, c in enumerate(chord)]

        # ---- pads ----
        cutoff = 5200 if full else 900 + 2600 * (b / max(1, drop_bar))
        pad_amp = 0.05 if mood != "cinematic" else 0.075
        music_part = supersaw(voicing, bar + 0.4, cutoff, rng, amp=pad_amp)
        place(music, music_part, t0)
        if mood == "cinematic":
            place(music, supersaw([root + deg - 12, root + deg], bar + 0.4, 900, rng, voices=5, amp=0.06), t0)

        # ---- batería ----
        if mood in ("drive", "deep"):
            for s in range(16):
                ts = t0 + s * beat / 4 + (swing * beat / 4 if s % 2 else 0)
                if s % 4 == 0 and (full or b == drop_bar - 1):
                    place(drums, kick(rng=rng), ts); kicks.append(ts)
                if s % 2 == 1 or full:
                    place(drums, pan(hat(rng) * hat_vel[s] * (1 if full else 0.6), 0.25 if s % 4 == 1 else -0.2), ts)
                if s % 4 == 2 and full:
                    place(drums, pan(hat(rng, True) * 0.55, 0.3), ts)
                if s in (4, 12) and full:
                    c = clap(rng); place(drums, c, ts); place(fx, reverb(c * 0.5, 1.4, 3.5, rng=rng), ts)
        else:  # cinematic: half-time + toms
            if full:
                place(drums, kick(1.3, rng), t0); kicks.append(t0)
                place(drums, kick(1.3, rng) * 0.8, t0 + beat * 1.5); kicks.append(t0 + beat * 1.5)
                sn = snare(rng); place(drums, sn, t0 + 2 * beat); place(fx, reverb(sn, 2.5, 2.2, rng=rng) * 0.7, t0 + 2 * beat)
                if b % 2 == 1:
                    for k in range(4):
                        place(drums, pan(tom(110 - 12 * k), -0.4 + 0.27 * k) * 0.7, t0 + 3 * beat + k * beat / 4)
            for s in range(8):
                place(drums, pan(hat(rng) * (0.5 if full else 0.3), 0.3), t0 + s * beat / 2)

        # ---- bajo ----
        bn = root - 12 + deg
        if mood == "drive" and full:
            for s in range(4):
                place(bassb, bass_note(bn + (12 if rng.rand() < .15 else 0), beat * 0.45, 650), t0 + s * beat + beat / 2)
        elif mood == "deep" and full:
            pat = [0, 0.75, 1.5, 2.5, 3.0, 3.5]
            for k, p in enumerate(pat):
                place(bassb, bass_note(bn + (7 if k == 4 else 0), beat * 0.4, 480, 0.55), t0 + p * beat)
        elif mood == "cinematic":
            for s in range(8):  # ostinato de "cuerdas"
                m = root + deg + (12 if s % 2 else 0)
                o = lp(saw(midi(m), int(beat / 2 * SR)) + saw(midi(m) * 1.003, int(beat / 2 * SR)), 1600 if full else 700)
                o *= env(len(o), 0.004, 0.08, 0.5, 0.03) * 0.09
                place(music, pan(o, -0.35 if s % 2 else 0.35), t0 + s * beat / 2)
            if full:
                place(bassb, bass_note(root - 12 + deg, bar, 300, 0.55, 0.8), t0)

        # ---- elemento melódico ----
        if mood == "drive" and full:
            pl = np.zeros(int(bar * SR) + SR)
            for s in range(8):
                if (s + seed) % 3 == 0: continue
                m = root + 24 + chord[0] + int(motif[s])
                p = pluck(m); i = int(s * beat / 2 * SR); pl[i:i + len(p)] += p
            pl2 = delay(pan(pl, 0.0), beat * 0.75, 0.35)
            place(music, pl2, t0); place(fx, reverb(pl2 * 0.35, 1.8, 3.0, rng=rng), t0)
        if mood == "deep":
            for p in (1.5, 3.5):
                st = stab([root + 12 + c for c in chord], 0.24, 2400 if full else 1200, 0.13)
                st = pan(st, -0.25 if p == 1.5 else 0.25)
                place(music, st, t0 + p * beat); place(fx, reverb(st, 2.4, 2.4, rng=rng) * 0.6, t0 + p * beat)

    # ---- FX de transición ----
    place(fx, pan(riser(drop_t - 0.02, rng), 0) * 0.9, 0)
    place(fx, impact(rng), drop_t)
    if mood == "cinematic":  # braam
        n = int(2.2 * SR); br = np.zeros(n)
        for m in (root - 12, root - 5, root):
            br += saw(midi(m), n) + saw(midi(m) * 1.006, n)
        br = np.tanh(2.2 * lp(br, 700)) * np.exp(-T(n) * 1.1) * 0.22
        place(fx, br, drop_t)

    # ---- mezcla ----
    sc = sidechain_curve(N, kicks, 0.6 if mood != "cinematic" else 0.3)
    music *= sc; bassb *= sidechain_curve(N, kicks, 0.75, 14) if mood != "cinematic" else 1
    music = music + reverb(music * 0.25, 2.6, 2.4, rng=rng)
    mix = drums * 0.9 + music * 1.0 + bassb * 0.85 + fx * 0.75
    mix = np.vstack([hp(mix[0], 28), hp(mix[1], 28)])
    # bus: compresión suave + saturación + limitador
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 1.4; mix = np.tanh(mix) / np.tanh(1.4)
    peak = np.max(np.abs(mix)) + 1e-9; mix = mix / peak * 0.93
    fi, fo = int(0.02 * SR), int(0.9 * SR)
    mix[:, :fi] *= np.linspace(0, 1, fi); mix[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5
    return (mix.T * 32767).astype(np.int16)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mood", default="drive", choices=list(MOODS) + list(ALIAS))
    ap.add_argument("--seconds", type=float, default=12)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    wavfile.write(a.out, SR, compose(a.mood, a.seconds, a.seed)); print(a.out)
