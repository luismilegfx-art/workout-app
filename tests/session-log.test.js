import { test } from "node:test";
import assert from "node:assert/strict";
import { createLog, markDone, canLogIn, settle, update, summarize } from "../js/engine/session-log.js";

const step = (i, ejercicio, ronda = 0) => ({ i, tipo: "trabajo", ejercicio, ronda });

test("precarga lo de la ronda anterior del mismo ejercicio", () => {
  const log = createLog();
  markDone(log, step(3, "press-mancuernas"), null);
  update(log, 3, { reps: 12, peso: 35 });
  const e = markDone(log, step(9, "press-mancuernas", 1), { reps: 8, peso: 30 });
  assert.equal(e.reps, 12); assert.equal(e.peso, 35);
});

test("sin ronda anterior usa el historial; isométricos empiezan sin pausas", () => {
  const log = createLog();
  assert.equal(markDone(log, step(2, "curl-mancuernas"), { reps: 10, peso: 20 }).reps, 10);
  const p = markDone(log, step(4, "plancha"), null);
  assert.equal(p.pausas, 0); assert.equal(p.reps, null);
});

test("los descansos cortos no abren el registro; lo pendiente se acumula", () => {
  const log = createLog();
  markDone(log, step(1, "flexiones"), null);
  assert.equal(canLogIn({ tipo: "descanso", duracion: 10 }, 15), false);
  markDone(log, step(3, "fondos-banco"), null);
  assert.equal(canLogIn({ tipo: "descanso-ronda", duracion: 60 }, 15), true);
  assert.deepEqual(log.pending, [1, 3]);
  settle(log, [1, 3]);
  assert.deepEqual(log.pending, []);
});

test("el resumen agrupa series por ejercicio", () => {
  const log = createLog();
  markDone(log, step(1, "flexiones"), null); update(log, 1, { reps: 15 });
  markDone(log, step(5, "flexiones", 1), null); update(log, 5, { reps: 11 });
  const [x] = summarize(log);
  assert.equal(x.series.length, 2); assert.equal(x.reps, 13);
});
