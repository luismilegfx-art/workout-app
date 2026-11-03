// Progresión: qué peso (o variante) toca en cada ejercicio, a partir del historial.
// Funciones puras, probadas en tests/progression.test.js. Las reglas siguen la especificación técnica
// (doble progresión, peso corporal, si no se completa, inactividad) y sus números viven en params.progresion.
import { EXERCISE_BY_ID } from "../data/exercises.js";

const DAY = 86_400_000;
const rirNum = r => r == null || r === "" ? null : r === "4+" ? 4 : Number(r);

export const isLowerBody = e => e.sub?.startsWith("piernas.") || ["sentadilla", "bisagra", "zancada"].includes(e.patron);
export const increment = (e, P) => isLowerBody(e) ? P.incrementoInferior : P.incrementoSuperior;
export const roundTo = (v, step = 5) => Math.max(step, Math.round(v / step) * step);

/** Rango de repeticiones objetivo de una sesión: el guardado con el ejercicio o el del énfasis. */
export function targetFor(rec, P) {
  return rec.objetivo ?? P.objetivos[rec.expres ? "expres" : rec.enfasis] ?? P.objetivos.masa;
}

/** Sesiones en las que se registró el ejercicio, de la más reciente a la más vieja. */
export function exerciseHistory(history, id) {
  const out = [];
  for (const s of history) {
    const x = s.ejercicios?.find(e => e.id === id);
    if (!x) continue;
    const series = (x.series?.length ? x.series : [{ reps: x.reps, peso: x.peso }]).filter(r => r.reps != null || r.peso != null);
    if (!series.length) continue;
    const pesos = series.map(r => r.peso).filter(v => v != null);
    out.push({ fecha: s.fecha, enfasis: s.enfasis, expres: s.expres, objetivo: x.objetivo ?? null,
      series, peso: pesos.length ? Math.max(...pesos) : null, rir: rirNum(s.rir) });
  }
  return out;
}

// ¿La sesión superó el rango con margen? Con esfuerzo anotado: todas las series en el tope y RIR suficiente.
// Sin esfuerzo anotado: todas las series al menos 2 por encima del tope.
function exceeded(rec, P) {
  const [, hi] = targetFor(rec, P);
  const work = rec.series.filter(r => r.reps != null && (rec.peso == null || r.peso == null || r.peso >= rec.peso));
  if (!work.length) return false;
  const rirs = work.map(r => rirNum(r.rir) ?? rec.rir).filter(v => v != null);
  if (rirs.length) return work.every(r => r.reps >= hi) && Math.min(...rirs) >= P.rirParaSubir;
  return work.every(r => r.reps >= hi + 2);
}
// ¿Se quedó corta? Alguna serie por debajo del mínimo sin reserva (RIR 0 o no anotado).
function missed(rec, P) {
  const [lo] = targetFor(rec, P);
  return rec.series.some(r => r.reps != null && r.reps < lo && (rirNum(r.rir) ?? rec.rir ?? 0) <= 0);
}

/**
 * Sugerencia para la próxima vez.
 * Devuelve { estado, peso, variante, motivo, incremento }:
 *   nuevo · subir · mantener · bajar · retomar · variante (peso corporal: pasar a la variante difícil o fácil)
 */
export function suggest(exId, history, params, now = Date.now()) {
  const e = EXERCISE_BY_ID[exId], P = params.progresion;
  const inc = increment(e, P);
  const base = { estado: "mantener", peso: null, variante: null, motivo: "", incremento: inc };
  const recs = exerciseHistory(history, exId);
  if (!recs.length) {
    return { ...base, estado: "nuevo",
      motivo: e.carga ? "Primera vez: escoge un peso con el que te sobren 2–3 repeticiones; se ajusta serie a serie" : "Primera vez con este ejercicio" };
  }
  const last = recs[0];
  const days = Math.floor((now - Date.parse(last.fecha)) / DAY);

  // Inactividad: se retoma con menos carga en vez de seguir subiendo
  if (days >= P.diasPausa && last.peso != null && e.carga) {
    const cut = days >= P.diasPausaLarga ? P.recortePausaLarga : P.recortePausa;
    return { ...base, estado: "retomar", peso: roundTo(last.peso * (1 - cut / 100)),
      motivo: `Llevas ${days} días sin hacerlo: retoma un ${cut}% más ligero` };
  }

  // Racha al mismo peso (o sin peso)
  const streak = recs.filter((r, i) => recs.slice(0, i + 1).every(x => x.peso === last.peso));
  const up = streak.slice(0, P.sesionesParaSubir);
  if (up.length === P.sesionesParaSubir && up.every(r => exceeded(r, P))) {
    if (e.carga && last.peso != null) {
      return { ...base, estado: "subir", peso: last.peso + inc,
        motivo: `${P.sesionesParaSubir} sesiones completando el rango con repeticiones de sobra` };
    }
    if (e.dificil && EXERCISE_BY_ID[e.dificil]) {
      return { ...base, estado: "variante", variante: e.dificil,
        motivo: `Listo para pasar a ${EXERCISE_BY_ID[e.dificil].nombre.toLowerCase()}` };
    }
    return { ...base, motivo: "Completas el rango con margen: suma repeticiones o haz el movimiento más lento" };
  }
  const down = streak.slice(0, P.sesionesParaBajar);
  if (down.length === P.sesionesParaBajar && down.every(r => missed(r, P))) {
    if (e.carga && last.peso != null && last.peso - inc > 0) {
      return { ...base, estado: "bajar", peso: last.peso - inc, motivo: `${P.sesionesParaBajar} sesiones sin llegar al mínimo: baja un paso` };
    }
    if (e.facil && EXERCISE_BY_ID[e.facil]) {
      return { ...base, estado: "variante", variante: e.facil, motivo: `Pasa a ${EXERCISE_BY_ID[e.facil].nombre.toLowerCase()} un tiempo` };
    }
  }
  const [lo, hi] = targetFor(last, P);
  return { ...base, peso: last.peso,
    motivo: missed(last, P) ? `Mantén el peso hasta llegar a ${lo} repeticiones en todas las series` : `Busca ${hi} repeticiones en todas las series` };
}

/**
 * Calibración la primera vez: después de cada serie con esfuerzo anotado se ajusta el peso de la siguiente.
 * RIR 4+ → dos pasos más · RIR 3 → un paso más · RIR 0 con repeticiones bajo el mínimo → un paso menos.
 */
export function calibrate(prev, objetivo, inc) {
  const rir = rirNum(prev?.rir);
  if (prev?.peso == null || rir == null) return null;
  if (rir <= 0 && prev.reps != null && objetivo && prev.reps < objetivo[0]) return { peso: Math.max(inc, prev.peso - inc), motivo: "Calibrando: baja un paso" };
  if (rir >= 4) return { peso: prev.peso + 2 * inc, motivo: "Calibrando: sube dos pasos" };
  if (rir === 3) return { peso: prev.peso + inc, motivo: "Calibrando: sube un paso" };
  return { peso: prev.peso, motivo: "Calibrando: este peso va bien" };
}
