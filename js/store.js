// Persistencia local (en el dispositivo). Todo pasa por aquí para poder cambiar el almacenamiento más adelante.
import { DEFAULT_SETTINGS } from "./data/catalog.js";

const KEY_SETTINGS = "wa.settings.v1";
const KEY_HISTORY = "wa.history.v1";
const SCHEMA_VERSION = 1;

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function deepMerge(base, extra) {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return extra ?? base;
  const out = { ...base };
  for (const k of Object.keys(extra ?? {})) {
    out[k] = (k in base && typeof base[k] === "object" && !Array.isArray(base[k]) && base[k] !== null)
      ? deepMerge(base[k], extra[k]) : extra[k];
  }
  return out;
}

export function getSettings() { return deepMerge(DEFAULT_SETTINGS, read(KEY_SETTINGS, {})); }
export function saveSettings(s) { return write(KEY_SETTINGS, s); }
export function resetParams() {
  const s = getSettings(); s.params = structuredClone(DEFAULT_SETTINGS.params); saveSettings(s); return s;
}

// Historial: lista de sesiones, más reciente primero
export function getHistory() { return read(KEY_HISTORY, []); }
export function addSession(session) {
  const h = getHistory(); h.unshift(session); write(KEY_HISTORY, h.slice(0, 500)); return h;
}
export function deleteSession(id) {
  const h = getHistory().filter(s => s.id !== id); write(KEY_HISTORY, h); return h;
}

// Último registro de un ejercicio (para mostrar referencia de peso/reps)
export function lastLogFor(exerciseId) {
  for (const s of getHistory()) {
    const e = s.ejercicios?.find(x => x.id === exerciseId && (x.peso || x.reps));
    if (e) return { fecha: s.fecha, peso: e.peso, reps: e.reps, rir: e.rir ?? s.rir };
  }
  return null;
}

// Rutinas guardadas (se guarda el plan sin la línea de tiempo; se reconstruye al usarla)
const KEY_ROUTINES = "wa.routines.v1";
export function getRoutines() { return read(KEY_ROUTINES, []); }
export function saveRoutine(plan, meta = {}) {
  const { steps, totalSec, ...rest } = plan;
  const r = { id: `rt-${Date.now().toString(36)}`, guardada: new Date().toISOString(), estrellas: 0, carpeta: "", comentario: "",
    nombre: meta.nombre ?? "", ...meta, plan: rest, duracionSeg: totalSec };
  const list = getRoutines(); list.unshift(r); write(KEY_ROUTINES, list); return r;
}
export function updateRoutine(id, patch) {
  const list = getRoutines().map(r => r.id === id ? { ...r, ...patch } : r); write(KEY_ROUTINES, list); return list;
}
export function deleteRoutine(id) { const list = getRoutines().filter(r => r.id !== id); write(KEY_ROUTINES, list); return list; }

export function exportData() {
  return JSON.stringify({ app: "workout-app", schema: SCHEMA_VERSION, exportado: new Date().toISOString(),
    ajustes: read(KEY_SETTINGS, {}), historial: getHistory(), rutinas: read("wa.routines.v1", []) }, null, 2);
}
export function importData(text) {
  const data = JSON.parse(text);
  if (data.app !== "workout-app") throw new Error("El archivo no es una copia de esta app.");
  if (data.ajustes) write(KEY_SETTINGS, data.ajustes);
  if (Array.isArray(data.historial)) write(KEY_HISTORY, data.historial);
  if (Array.isArray(data.rutinas)) write("wa.routines.v1", data.rutinas);
}
