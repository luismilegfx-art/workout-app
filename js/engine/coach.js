// Entrenador con cámara: cuenta repeticiones y detecta errores a partir de la ficha del ejercicio.
// Recibe los puntos del cuerpo que entrega la cámara (MediaPipe Pose) y devuelve el estado y los avisos.
// Es lógica pura (sin cámara ni pantalla) para poder probarla: tests/coach.test.js.
//
// De la ficha usa: control.angulo (tres puntos y rango), control.fijas (puntos que no deben moverse),
// medida (reps o tiempo) y tempo (duración esperada de una repetición). Agregar un ejercicio es llenar su ficha.
import { PUNTOS } from "../data/exercise-schema.js";

export const COACH_DEFAULTS = {
  visibilidad: 0.6,       // confianza mínima de cada punto
  listoMs: 1000,          // posición inicial estable antes de empezar a contar
  perdidoMs: 600,         // tiempo sin verte antes de pausar
  extremo: 0.25,          // fracción del rango que cuenta como "en un extremo"
  completo: 0.2,          // la repetición es completa si llega a esta fracción del extremo lejano
  fijaMax: 0.18,          // desplazamiento máximo de un punto fijo (en largos de torso)
  tempoMin: 0.5,          // repetición más rápida que esta fracción del tempo de la ficha → "más lento"
  isoTolerancia: 8,       // grados fuera del rango que se toleran en un isométrico
};

const mirror = name => name.replace(/L$/, "§").replace(/R$/, "L").replace(/§$/, "R");
const visOf = (lm, name) => {
  const i = PUNTOS[name];
  return Array.isArray(i) ? Math.min(...i.map(k => lm[k]?.visibility ?? 0)) : lm[i]?.visibility ?? 0;
};
function point(lm, name) {
  const i = PUNTOS[name];
  if (!Array.isArray(i)) return lm[i];
  const ps = i.map(k => lm[k]);
  return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length, z: ps.reduce((s, p) => s + (p.z ?? 0), 0) / ps.length };
}
export function angleAt(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)], v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const d = Math.hypot(...u) * Math.hypot(...v) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / d))) * 180 / Math.PI;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * @param ficha  ficha del ejercicio (js/data/exercises.js)
 * update(frame, now) con frame = { lm: puntos en la imagen (0–1), world?: puntos en metros }.
 * Los ángulos se miden con `world` si existe (no dependen de desde dónde grabe la cámara).
 */
export function createCoach(ficha, opts = {}) {
  const P = { ...COACH_DEFAULTS, ...opts };
  const ang = ficha.control?.angulo;
  if (!ang) throw new Error(`La ficha de ${ficha.id} no define el ángulo de control`);
  const [lo, hi] = ang.rango, span = hi - lo;
  const iso = ficha.medida === "tiempo";
  // Duración esperada del movimiento (solo las fases en que el cuerpo se mueve)
  const repMs = (ficha.tempo ?? []).filter(f => f.desde !== f.hasta).reduce((t, f) => t + f.dur, 0) * 1000;
  let side = null;                       // "L" o "R": se fija al empezar
  const names = () => side === "R" ? ang.puntos.map(mirror) : ang.puntos;
  const fijas = () => (ficha.control.fijas ?? []).map(f => ({ ...f, puntos: f.puntos.map(p => side === "R" ? mirror(p) : p) }));

  const s = { estado: "esperando", reps: 0, segundos: 0, angulo: null, mensaje: "Colócate de lado, con el cuerpo completo en la imagen" };
  let stableSince = null, stableRef = null, lostSince = null, lastNow = null;
  let startEnd = null, phase = "inicio", repStart = 0, farthest = null, repWarn = new Set(), base = null, scale = 1, outSince = null;

  const out = (eventos = []) => ({ ...s, rango: ang.rango, nombre: ang.nombre, eventos });
  const say = (eventos, tipo, texto, extra = {}) => { s.mensaje = texto; eventos.push({ tipo, texto, ...extra }); };

  function measure(frame) {
    const lm = frame.lm, geo = frame.world ?? frame.lm;
    if (!side) {                                     // el lado más visible
      const v = n => n.reduce((t, x) => t + visOf(lm, x), 0);
      side = v(ang.puntos.map(mirror)) > v(ang.puntos) ? "R" : "L";
    }
    const pts = names();
    const visible = pts.every(n => visOf(lm, n) >= P.visibilidad);
    return { visible, angle: visible ? angleAt(point(geo, pts[0]), point(geo, pts[1]), point(geo, pts[2])) : null };
  }

  function update(frame, now) {
    const ev = [];
    const dt = lastNow == null ? 0 : now - lastNow; lastNow = now;
    const m = measure(frame);
    if (!m.visible) {
      lostSince ??= now;
      if (now - lostSince >= P.perdidoMs && s.estado !== "perdido" && s.estado !== "esperando") {
        s.estado = "perdido"; say(ev, "aviso", "No te veo completo: acomódate en la imagen");
        stableSince = null; side = null;
      }
      return out(ev);
    }
    lostSince = null;
    // suavizado ligero del ángulo
    s.angulo = s.angulo == null ? m.angle : s.angulo + 0.4 * (m.angle - s.angulo);
    const a = s.angulo;

    // ── Preparación: posición estable antes de empezar ──
    if (s.estado === "esperando" || s.estado === "perdido") {
      const nearLo = a <= lo + span * P.extremo, nearHi = a >= hi - span * P.extremo;
      const ok = iso ? (a >= lo - P.isoTolerancia && a <= hi + P.isoTolerancia) : (nearLo || nearHi);
      if (ok && stableRef != null && Math.abs(a - stableRef) < 8) {
        if (now - stableSince >= P.listoMs) {
          s.estado = iso ? "sosteniendo" : "listo";
          startEnd = nearHi ? "hi" : "lo"; phase = "inicio";
          base = Object.fromEntries(fijas().flatMap(f => f.puntos).map(n => [n, { ...point(frame.lm, n) }]));
          scale = dist(point(frame.lm, "chest"), point(frame.lm, "pelvis")) || 0.25;
          say(ev, "listo", iso ? "Sostén la posición" : "Listo, empieza");
        }
      } else { stableSince = now; stableRef = a; if (s.estado === "esperando") s.mensaje = iso ? "Ponte en posición" : "Quédate quieto en la posición inicial"; }
      return out(ev);
    }

    // ── Puntos fijos: avisan una vez por repetición ──
    const checkFijas = () => {
      for (const f of fijas()) {
        if (repWarn.has(f.texto)) continue;
        const moved = f.puntos.some(n => base[n] && dist(point(frame.lm, n), base[n]) / scale > P.fijaMax);
        if (moved) { repWarn.add(f.texto); say(ev, "aviso", f.texto); }
      }
    };

    // ── Isométrico: tiempo dentro del rango ──
    if (iso) {
      const inRange = a >= lo - P.isoTolerancia && a <= hi + P.isoTolerancia;
      if (inRange) { s.segundos += dt / 1000; outSince = null; s.estado = "sosteniendo"; checkFijas(); }
      else {
        outSince ??= now;
        if (now - outSince > 500 && s.estado !== "fuera") {
          s.estado = "fuera";
          say(ev, "aviso", ficha.control.fijas?.[0]?.texto ?? `${ang.nombre}: vuelve a ${lo}–${hi}°`);
        }
      }
      return out(ev);
    }

    // ── Repeticiones: inicio → extremo lejano → inicio ──
    const atStart = startEnd === "hi" ? a >= hi - span * P.extremo : a <= lo + span * P.extremo;
    const leftStart = startEnd === "hi" ? a < hi - span * 0.4 : a > lo + span * 0.4;
    if (phase === "inicio" && leftStart) { phase = "moviendo"; repStart = now; farthest = a; repWarn = new Set(); s.estado = "moviendo"; }
    if (phase === "moviendo") {
      farthest = startEnd === "hi" ? Math.min(farthest, a) : Math.max(farthest, a);
      checkFijas();
      if (atStart) {
        phase = "inicio"; s.estado = "listo";
        const reached = startEnd === "hi" ? farthest <= lo + span * P.completo : farthest >= hi - span * P.completo;
        const dur = now - repStart;
        s.reps++;
        if (!reached) say(ev, "rep", `${s.reps}. Rango incompleto: ${ang.nombre.toLowerCase()} hasta ${startEnd === "hi" ? lo : hi}°`, { n: s.reps, completa: false });
        else if (repMs && dur < repMs * P.tempoMin) say(ev, "rep", `${s.reps}. Más lento y controlado`, { n: s.reps, completa: true, rapida: true });
        else say(ev, "rep", repWarn.size ? `${s.reps}. ${[...repWarn][0]}` : `${s.reps}`, { n: s.reps, completa: true });
      }
    }
    return out(ev);
  }

  return { update, get estado() { return s.estado; }, get reps() { return s.reps; } };
}
