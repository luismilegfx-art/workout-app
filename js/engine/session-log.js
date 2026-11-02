// Registro durante la sesión: qué se anotó en cada intervalo de trabajo.
// Funciones puras (sin interfaz) para poder probarlas.
import { EXERCISE_BY_ID } from "../data/exercises.js";

export const DEFAULT_REPS = 10;
export const PAUSE_OPTIONS = [
  { v: 0, label: "Sin pausas" }, { v: 1, label: "1 pausa" }, { v: 2, label: "2 pausas" },
  { v: 3, label: "3+ pausas" }, { v: -1, label: "No lo terminé" },
];

export function createLog() { return { entries: {}, pending: [] }; }

/**
 * Valores precargados para un intervalo: lo anotado en la ronda anterior de este ejercicio en esta sesión;
 * si no hay, lo de la última sesión (historial); si no, vacío.
 */
export function prefill(log, step, lastFromHistory) {
  const e = EXERCISE_BY_ID[step.ejercicio];
  const prev = Object.entries(log.entries)
    .filter(([i, x]) => x.id === step.ejercicio && Number(i) < step.i)
    .sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1];
  const base = prev ?? lastFromHistory ?? null;
  return {
    id: step.ejercicio, ronda: step.ronda ?? 0,
    medida: e.medida,
    // Fuerza: la ronda anterior o el objetivo de la serie (las reps de circuitos no sirven de referencia)
    reps: e.medida !== "reps" ? null : step.objetivo ? (prev?.reps ?? step.objetivo[1]) : (base?.reps ?? null),
    peso: e.carga ? (base?.peso ?? null) : null,
    pausas: e.medida === "tiempo" ? 0 : null,
    confirmado: false,
  };
}

// Se terminó (o se saltó hacia adelante) un intervalo de trabajo: queda pendiente de anotar
export function markDone(log, step, lastFromHistory) {
  if (log.entries[step.i]) return log.entries[step.i];
  log.entries[step.i] = prefill(log, step, lastFromHistory);
  log.pending.push(step.i);
  return log.entries[step.i];
}

// ¿Este descanso da tiempo para anotar? Los descansos cortos acumulan lo pendiente hasta uno más largo.
export function canLogIn(step, minSec) {
  return ["descanso", "transicion", "descanso-ronda", "cambio-bloque"].includes(step.tipo) && step.duracion >= minSec;
}

// Al terminar el descanso, lo mostrado se da por anotado (sin tener que confirmar)
export function settle(log, indices) {
  log.pending = log.pending.filter(i => !indices.includes(i));
}

export function update(log, i, patch) {
  Object.assign(log.entries[i], patch, { confirmado: true });
}

// Resumen por ejercicio para el historial: series, promedio de reps y peso usado
export function summarize(log) {
  const by = new Map();
  for (const [i, x] of Object.entries(log.entries).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (!by.has(x.id)) by.set(x.id, []);
    by.get(x.id).push({ i: Number(i), ronda: x.ronda, reps: x.reps, peso: x.peso, pausas: x.pausas, seg: x.seg ?? null });
  }
  return [...by.entries()].map(([id, series]) => {
    const reps = series.map(s => s.reps).filter(v => v != null);
    const pesos = series.map(s => s.peso).filter(v => v != null);
    return { id, series,
      reps: reps.length ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : null,
      peso: pesos.length ? Math.max(...pesos) : null,
      pausas: series.some(s => s.pausas != null) ? series.reduce((t, s) => t + Math.max(0, s.pausas ?? 0), 0) : null,
      incompletos: series.filter(s => s.pausas === -1).length };
  });
}
