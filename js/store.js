// Persistencia local (en el dispositivo). Todo pasa por aquí para poder cambiar el almacenamiento más adelante.
import { DEFAULT_SETTINGS } from "./data/catalog.js";
import { DATA_VERSION, newId, touch, migrateHistory, migrateRoutines } from "./engine/records.js";

const KEY_SETTINGS = "wa.settings.v1";
const KEY_HISTORY = "wa.history.v1";
const KEY_ROUTINES = "wa.routines.v1";
const KEY_DELETED = "wa.deleted.v1";     // borrados (id, tipo, fecha) para la sincronización futura
const KEY_META = "wa.meta.v1";           // versión del formato de los datos guardados

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

// Al abrir, los datos de versiones anteriores se actualizan una sola vez al formato actual
let migrated = false;
function ensureMigrated() {
  if (migrated) return; migrated = true;
  const meta = read(KEY_META, {});
  if ((meta.datos ?? 1) >= DATA_VERSION) return;
  write(KEY_HISTORY, migrateHistory(read(KEY_HISTORY, [])));
  write(KEY_ROUTINES, migrateRoutines(read(KEY_ROUTINES, [])));
  write(KEY_META, { ...meta, datos: DATA_VERSION, migrada: new Date().toISOString() });
}

function markDeleted(id, tipo) {
  const list = read(KEY_DELETED, []); list.unshift({ id, tipo, fecha: new Date().toISOString() });
  write(KEY_DELETED, list.slice(0, 500));
}
export { newId };

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
export function getHistory() { ensureMigrated(); return read(KEY_HISTORY, []); }
export function addSession(session) {
  const h = getHistory(); h.unshift(touch({ ...session, id: session.id ?? newId("s") }, undefined, true));
  write(KEY_HISTORY, h.slice(0, 500)); return h;
}
export function deleteSession(id) {
  const h = getHistory().filter(s => s.id !== id); write(KEY_HISTORY, h); markDeleted(id, "sesion"); return h;
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
export function getRoutines() { ensureMigrated(); return read(KEY_ROUTINES, []); }
export function saveRoutine(plan, meta = {}) {
  const { steps, totalSec, ...rest } = plan;
  const now = new Date().toISOString();
  const r = touch({ id: newId("rt"), guardada: now, estrellas: 0, carpeta: "", comentario: "",
    nombre: meta.nombre ?? "", ...meta, plan: rest, duracionSeg: totalSec }, now, true);
  const list = getRoutines(); list.unshift(r); write(KEY_ROUTINES, list); return r;
}
export function updateRoutine(id, patch) {
  const list = getRoutines().map(r => r.id === id ? touch({ ...r, ...patch }) : r); write(KEY_ROUTINES, list); return list;
}
export function deleteRoutine(id) {
  const list = getRoutines().filter(r => r.id !== id); write(KEY_ROUTINES, list); markDeleted(id, "rutina"); return list;
}

// Duración real de las series de Fuerza: mediana personal (global y por ejercicio) de las últimas sesiones
export function setTimeStats(limit = 20) {
  const all = [], per = {};
  for (const sess of getHistory().slice(0, limit)) for (const e of sess.ejercicios ?? []) for (const sr of e.series ?? []) {
    if (!(sr.seg > 5 && sr.seg < 300)) continue;
    all.push(sr.seg); (per[e.id] ??= []).push(sr.seg);
  }
  const median = arr => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const out = { global: all.length >= 3 ? median(all) : null };
  for (const [id, arr] of Object.entries(per)) if (arr.length >= 2) out[id] = median(arr);
  return out;
}

export function exportData() {
  return JSON.stringify({ app: "workout-app", schema: DATA_VERSION, exportado: new Date().toISOString(),
    ajustes: read(KEY_SETTINGS, {}), historial: getHistory(), rutinas: getRoutines(), eliminados: read(KEY_DELETED, []) }, null, 2);
}
export function importData(text) {
  const data = JSON.parse(text);
  if (data.app !== "workout-app") throw new Error("El archivo no es una copia de esta app.");
  if ((data.schema ?? 1) > DATA_VERSION) throw new Error("La copia viene de una versión más nueva de la app. Actualiza la página e inténtalo de nuevo.");
  if (data.ajustes) write(KEY_SETTINGS, data.ajustes);
  if (Array.isArray(data.historial)) write(KEY_HISTORY, migrateHistory(data.historial));
  if (Array.isArray(data.rutinas)) write(KEY_ROUTINES, migrateRoutines(data.rutinas));
  if (Array.isArray(data.eliminados)) write(KEY_DELETED, data.eliminados);
}
