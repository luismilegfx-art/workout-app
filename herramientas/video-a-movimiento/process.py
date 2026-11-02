"""Convierte la pose detectada en un video (MediaPipe, coordenadas del mundo) en muestras de movimiento para el bot.

Salida: direcciones de cada hueso por profundidad t (0 = posición inicial, 1 = posición final), en el sistema del bot
(Y arriba, la figura mira a +Z, su izquierda es +X). El bot reconstruye la pose con sus propias proporciones.
"""
import json, sys, math
import numpy as np

src, out = sys.argv[1], sys.argv[2]
frames = [f for f in json.load(open(src)) if f["w"]]
print("cuadros con pose:", len(frames))

IDX = dict(nose=0, shoulderL=11, shoulderR=12, elbowL=13, elbowR=14, wristL=15, wristR=16, indexL=19, indexR=20,
           hipL=23, hipR=24, kneeL=25, kneeR=26, ankleL=27, ankleR=28, heelL=29, heelR=30, toeL=31, toeR=32)

def pts(f):
    w = f["w"]
    # MediaPipe: x derecha, y abajo, z lejos de la cámara → x, arriba, hacia la cámara (diestro)
    return {k: np.array([w[i]["x"], -w[i]["y"], -w[i]["z"]]) for k, i in IDX.items()}, {k: w[i].get("visibility", 1) for k, i in IDX.items()}

P = [pts(f)[0] for f in frames]
VIS = [pts(f)[1] for f in frames]
n = len(P)

# Rotación global: izquierda de la persona → +X, arriba → +Y, frente → +Z (con los primeros cuadros, de pie)
def unit(v): return v / (np.linalg.norm(v) + 1e-9)
lat = np.mean([p["hipL"] - p["hipR"] for p in P[:6]], axis=0)
up_raw = np.mean([(p["shoulderL"] + p["shoulderR"]) / 2 - (p["hipL"] + p["hipR"]) / 2 for p in P[:6]], axis=0)
u = unit(up_raw)
L = unit(lat - u * lat.dot(u))
F = np.cross(L, u)
R = np.stack([L, u, F])           # filas: nuevo X, Y, Z
P = [{k: R @ v for k, v in p.items()} for p in P]
toe_fwd = np.mean([(p["toeL"] + p["toeR"]) / 2 - (p["heelL"] + p["heelR"]) / 2 for p in P[:6]], axis=0)
print("pies apuntan hacia +Z:", round(float(unit(toe_fwd)[2]), 2), "(debe ser positivo)")

mid = lambda p, a, b: (p[a] + p[b]) / 2
def depth_signal(p):
    # altura de la pelvis respecto a los tobillos
    return float(mid(p, "hipL", "hipR")[1] - mid(p, "ankleL", "ankleR")[1])

h = np.array([depth_signal(p) for p in P])
# suavizado ligero
k = np.array([1, 2, 3, 2, 1], float); k /= k.sum()
hs = np.convolve(np.pad(h, 2, mode="edge"), k, mode="valid")
top, bottom = np.percentile(hs, 95), np.percentile(hs, 3)
t = np.clip((top - hs) / (top - bottom), 0, 1)
print("altura de cadera de pie / abajo (m):", round(float(top), 3), round(float(bottom), 3))

# repeticiones: mínimos locales de altura bajo t > 0.8
reps = [i for i in range(1, n - 1) if t[i] >= 0.8 and t[i] >= t[i - 1] and t[i] >= t[i + 1]]
merged = []
for i in reps:
    if not merged or i - merged[-1] > 8: merged.append(i)
print("repeticiones detectadas:", len(merged), "en cuadros", merged)

def angle(a, b, c):
    v1, v2 = unit(a - b), unit(c - b)
    return math.degrees(math.acos(max(-1, min(1, float(v1.dot(v2))))))

knee = np.array([(angle(p["hipL"], p["kneeL"], p["ankleL"]) + angle(p["hipR"], p["kneeR"], p["ankleR"])) / 2 for p in P])
# cadera: ángulo entre tronco y muslo (no depende de la profundidad que estime la cámara)
hip = np.array([(angle(mid(p, "shoulderL", "shoulderR"), p["hipL"], p["kneeL"]) + angle(mid(p, "shoulderL", "shoulderR"), p["hipR"], p["kneeR"])) / 2 for p in P])
def ground(v): return v - u_fin * v.dot(u_fin)
u_fin = np.array([0, 1, 0.0])
leglen = np.array([np.linalg.norm(p["hipL"] - p["kneeL"]) + np.linalg.norm(p["kneeL"] - p["ankleL"]) for p in P])
stance = np.array([np.linalg.norm(p["ankleL"] - p["ankleR"]) for p in P]) / leglen
def toe_out(p):
    a, b = unit(ground(p["toeL"] - p["heelL"])), unit(ground(p["toeR"] - p["heelR"]))
    return math.degrees(math.acos(max(-1, min(1, float(a.dot(b)))))) / 2
toeout = np.array([toe_out(p) for p in P])
print("cadera: máx", round(float(hip.max())), "mín", round(float(hip.min())), "· apertura de pies / pierna", round(float(np.median(stance)), 2), "· puntas hacia afuera", round(float(np.median(toeout))), "°")
print("ángulo de rodilla: máx", round(float(knee.max())), "mín", round(float(knee.min())))

BONES = {  # hueso: (desde, hasta)
    "thighL": ("hipL", "kneeL"), "thighR": ("hipR", "kneeR"), "shinL": ("kneeL", "ankleL"), "shinR": ("kneeR", "ankleR"),
    "footL": ("heelL", "toeL"), "footR": ("heelR", "toeR"),
    "upperArmL": ("shoulderL", "elbowL"), "upperArmR": ("shoulderR", "elbowR"),
    "forearmL": ("elbowL", "wristL"), "forearmR": ("elbowR", "wristR"), "handL": ("wristL", "indexL"), "handR": ("wristR", "indexR"),
}

def describe(p):
    pelvis, chest = mid(p, "hipL", "hipR"), mid(p, "shoulderL", "shoulderR")
    d = {b: unit(p[e] - p[s]) for b, (s, e) in BONES.items()}
    d["spine"] = unit(chest - pelvis)
    d["hipLat"] = unit(p["hipL"] - p["hipR"])
    d["head"] = unit(p["nose"] - chest)
    # posición de la pelvis respecto al punto medio de los tobillos, en múltiplos del largo de la pierna del video
    leg = np.linalg.norm(p["hipL"] - p["kneeL"]) + np.linalg.norm(p["kneeL"] - p["ankleL"])
    rel = (pelvis - mid(p, "ankleL", "ankleR")) / leg
    d["pelvisRel"] = rel
    d["ankleSpread"] = (p["ankleL"] - p["ankleR"]) / leg
    return d

D = [describe(p) for p in P]

# Muestras por profundidad: promedio de todos los cuadros cercanos a cada t (bajada y subida juntas)
samples = []
for tk in np.linspace(0, 1, 11):
    w = np.exp(-((t - tk) / 0.035) ** 2)
    if w.sum() < 1e-3: continue
    s = {"t": round(float(tk), 2)}
    for key in D[0]:
        v = np.sum([w[i] * D[i][key] for i in range(n)], axis=0) / w.sum()
        s[key] = [round(float(x), 4) for x in (v if key in ("pelvisRel", "ankleSpread") else unit(v))]
    s["kneeDeg"] = round(float(np.sum(w * knee) / w.sum()), 1)
    s["hipDeg"] = round(float(np.sum(w * hip) / w.sum()), 1)
    samples.append(s)

# Tempo real del video (para comparar con el de la ficha)
fps = 15
segs = []
for a, b in zip(merged, merged[1:]):
    segs.append((b - a) / fps)
json.dump({"fuente": "video", "cuadros": n, "fps": fps, "repeticiones": len(merged), "segundosPorRep": segs,
           "rodilla": {"max": round(float(knee.max())), "min": round(float(knee.min()))},
           "cadera": {"max": round(float(hip.max())), "min": round(float(hip.min()))},
           "apertura": round(float(np.median(stance)), 3), "puntas": round(float(np.median(toeout)), 1),
           "muestras": [{"t": s["t"], "rodilla": s["kneeDeg"], "cadera": s["hipDeg"], "brazo": s["upperArmL"]} for s in samples]},
          open(out, "w"), indent=1)
print("muestras:", len(samples), "→", out)
for s in samples: print(s["t"], "rodilla", s["kneeDeg"], "cadera", s["hipDeg"])
