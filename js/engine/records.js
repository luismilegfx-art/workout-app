// Formato de los datos guardados (sesiones y rutinas). Funciones puras, probadas en tests/records.test.js.
// Cada registro lleva:
//   id          único entre dispositivos (tiempo + azar), para poder sincronizar sin choques
//   v           versión del formato, para migrar datos viejos sin perderlos
//   creada      cuándo se creó · actualizada: último cambio (la sincronización conserva el más reciente)
// Los borrados se anotan aparte (id y fecha) para que otro dispositivo sepa que se eliminaron.

export const DATA_VERSION = 2;

export function newId(prefix, now = Date.now(), rand = Math.random) {
  const tail = Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0");
  return `${prefix}-${now.toString(36)}-${tail}`;
}

const iso = (x, fallback) => {
  const t = typeof x === "number" ? x : Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
};

// Sesión del historial (versión 1 → 2: identificador garantizado, fechas y versión)
export function migrateSession(s, now = new Date().toISOString()) {
  const fecha = iso(s.fecha, iso(s.creada, now));
  return {
    ...s,
    id: typeof s.id === "string" && s.id ? s.id : newId("s", Date.parse(fecha)),
    fecha,
    creada: iso(s.creada, fecha),
    actualizada: iso(s.actualizada, iso(s.creada, fecha)),
    ejercicios: Array.isArray(s.ejercicios) ? s.ejercicios : [],
    v: DATA_VERSION,
  };
}

// Rutina guardada
export function migrateRoutine(r, now = new Date().toISOString()) {
  const guardada = iso(r.guardada, iso(r.creada, now));
  return {
    estrellas: 0, carpeta: "", comentario: "", nombre: "",
    ...r,
    id: typeof r.id === "string" && r.id ? r.id : newId("rt", Date.parse(guardada)),
    guardada,
    creada: iso(r.creada, guardada),
    actualizada: iso(r.actualizada, guardada),
    v: DATA_VERSION,
  };
}

// Listas completas: descarta lo que no es un registro y resuelve identificadores repetidos
function migrateList(list, fn, prefix, now) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter(x => x && typeof x === "object").map(x => {
    const r = fn(x, now);
    if (seen.has(r.id)) r.id = newId(prefix, Date.parse(r.creada));
    seen.add(r.id);
    return r;
  });
}
export const migrateHistory = (list, now) => migrateList(list, migrateSession, "s", now);
export const migrateRoutines = (list, now) => migrateList(list, migrateRoutine, "rt", now);

// Marca un registro como recién creado o cambiado
export function touch(rec, now = new Date().toISOString(), creating = false) {
  return { ...rec, v: DATA_VERSION, actualizada: now, ...(creating || !rec.creada ? { creada: rec.creada ?? now } : {}) };
}
