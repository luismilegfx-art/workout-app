import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA_VERSION, newId, migrateSession, migrateHistory, migrateRoutines, touch } from "../js/engine/records.js";

const NOW = "2026-11-02T20:00:00.000Z";

test("los identificadores nuevos no chocan aunque se creen en el mismo instante", () => {
  const ids = new Set(Array.from({ length: 2000 }, () => newId("s", 1_800_000_000_000)));
  assert.ok(ids.size > 1990);
  assert.match(newId("rt"), /^rt-[a-z0-9]+-[a-z0-9]{4}$/);
});

test("una sesión de la versión anterior conserva todo y gana fechas y versión", () => {
  const vieja = { id: "s-abc", fecha: "2026-10-30T12:00:00.000Z", minutos: 30, ejercicios: [{ id: "flexiones", reps: 12 }], rir: 2 };
  const s = migrateSession(vieja, NOW);
  assert.equal(s.id, "s-abc");
  assert.equal(s.v, DATA_VERSION);
  assert.equal(s.creada, vieja.fecha);
  assert.equal(s.actualizada, vieja.fecha);
  assert.deepEqual(s.ejercicios, vieja.ejercicios);
  assert.equal(s.rir, 2);
});

test("repara registros incompletos sin perder el historial", () => {
  const h = migrateHistory([{ fecha: "2026-10-01T10:00:00Z" }, null, "basura", { id: "s-1", fecha: "x" }, { id: "s-1", fecha: "2026-10-02T10:00:00Z" }], NOW);
  assert.equal(h.length, 3);
  assert.ok(h[0].id.startsWith("s-"));
  assert.equal(h[1].fecha, NOW);                      // fecha ilegible → la de la migración
  assert.notEqual(h[1].id, h[2].id);                  // identificador repetido → uno nuevo
  assert.ok(h.every(s => Array.isArray(s.ejercicios) && s.v === DATA_VERSION));
});

test("las rutinas guardadas reciben valores por defecto y fechas", () => {
  const [r] = migrateRoutines([{ id: "rt-1", guardada: "2026-10-20T09:00:00Z", plan: { minutos: 20 }, estrellas: 3 }], NOW);
  assert.equal(r.estrellas, 3); assert.equal(r.carpeta, ""); assert.equal(r.comentario, "");
  assert.equal(r.creada, "2026-10-20T09:00:00.000Z"); assert.equal(r.v, DATA_VERSION);
});

test("touch marca el cambio sin tocar la fecha de creación", () => {
  const r = touch({ id: "rt-1", creada: "2026-10-20T09:00:00.000Z" }, NOW);
  assert.equal(r.creada, "2026-10-20T09:00:00.000Z"); assert.equal(r.actualizada, NOW);
});

test("el almacenamiento migra una sola vez los datos guardados con la versión anterior", async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  mem.set("wa.history.v1", JSON.stringify([{ id: "s-viejo", fecha: "2026-10-30T12:00:00.000Z", ejercicios: [] }]));
  mem.set("wa.routines.v1", JSON.stringify([{ id: "rt-viejo", guardada: "2026-10-29T12:00:00.000Z", plan: {} }]));
  const store = await import("../js/store.js");
  const [s] = store.getHistory();
  assert.equal(s.id, "s-viejo"); assert.equal(s.v, DATA_VERSION);
  assert.equal(JSON.parse(mem.get("wa.meta.v1")).datos, DATA_VERSION);
  store.addSession({ fecha: NOW, ejercicios: [] });
  const h = store.getHistory();
  assert.equal(h.length, 2); assert.ok(h[0].id && h[0].creada && h[0].v === DATA_VERSION);
  store.deleteSession("s-viejo");
  assert.equal(JSON.parse(mem.get("wa.deleted.v1"))[0].id, "s-viejo");
  const copia = JSON.parse(store.exportData());
  assert.equal(copia.schema, DATA_VERSION); assert.equal(copia.eliminados.length, 1);
  assert.throws(() => store.importData(JSON.stringify({ app: "workout-app", schema: DATA_VERSION + 1 })), /más nueva/);
});
