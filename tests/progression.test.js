import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest, calibrate, exerciseHistory } from "../js/engine/progression.js";
import { createLog, markDone, update, plannedWeight, summarize } from "../js/engine/session-log.js";
import { DEFAULT_SETTINGS } from "../js/data/catalog.js";

const P = DEFAULT_SETTINGS.params;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const day = n => new Date(NOW - n * 86_400_000).toISOString();
// sesión con un ejercicio y sus series [reps, peso, rir]
const ses = (dias, id, series, extra = {}) => ({ fecha: day(dias), enfasis: "masa", ejercicios: [{ id, series: series.map(([reps, peso, rir]) => ({ reps, peso, rir })) }], ...extra });

test("primera vez: estado nuevo, sin peso, invita a calibrar", () => {
  const s = suggest("press-mancuernas", [], P, NOW);
  assert.equal(s.estado, "nuevo"); assert.equal(s.peso, null); assert.match(s.motivo, /serie a serie/);
});

test("sube el peso tras dos sesiones superando el rango con reserva (tren superior +5)", () => {
  const h = [ses(2, "press-mancuernas", [[12, 30, "2"], [12, 30, "3"]]), ses(5, "press-mancuernas", [[12, 30, "2"], [13, 30, "2"]])];
  const s = suggest("press-mancuernas", h, P, NOW);
  assert.equal(s.estado, "subir"); assert.equal(s.peso, 35);
});

test("en piernas el paso es de 10 lb", () => {
  const h = [ses(2, "sentadilla-barra", [[12, 135, "2"]]), ses(5, "sentadilla-barra", [[12, 135, "3"]])];
  assert.equal(suggest("sentadilla-barra", h, P, NOW).peso, 145);
});

test("no sube si una de las dos sesiones fue con otro peso o sin reserva", () => {
  const otroPeso = [ses(2, "press-mancuernas", [[12, 30, "2"]]), ses(5, "press-mancuernas", [[12, 25, "2"]])];
  assert.equal(suggest("press-mancuernas", otroPeso, P, NOW).estado, "mantener");
  const sinReserva = [ses(2, "press-mancuernas", [[12, 30, "0"]]), ses(5, "press-mancuernas", [[12, 30, "2"]])];
  assert.equal(suggest("press-mancuernas", sinReserva, P, NOW).estado, "mantener");
});

test("sin esfuerzo anotado solo sube con dos repeticiones por encima del tope", () => {
  const justo = [ses(2, "press-mancuernas", [[12, 30]]), ses(5, "press-mancuernas", [[12, 30]])];
  assert.equal(suggest("press-mancuernas", justo, P, NOW).estado, "mantener");
  const sobra = [ses(2, "press-mancuernas", [[14, 30]]), ses(5, "press-mancuernas", [[15, 30]])];
  assert.equal(suggest("press-mancuernas", sobra, P, NOW).estado, "subir");
});

test("tres sesiones sin llegar al mínimo bajan un paso", () => {
  const h = [1, 4, 7].map(d => ses(d, "press-mancuernas", [[6, 40, "0"], [5, 40, "0"]]));
  const s = suggest("press-mancuernas", h, P, NOW);
  assert.equal(s.estado, "bajar"); assert.equal(s.peso, 35);
});

test("tras una pausa se retoma con menos carga (10 % a las 2 semanas, 20 % al mes)", () => {
  assert.deepEqual([suggest("press-mancuernas", [ses(16, "press-mancuernas", [[10, 50, "2"]])], P, NOW)].map(s => [s.estado, s.peso]), [["retomar", 45]]);
  assert.equal(suggest("press-mancuernas", [ses(35, "press-mancuernas", [[10, 50, "2"]])], P, NOW).peso, 40);
});

test("peso corporal: superar el rango propone la variante difícil", () => {
  const h = [ses(2, "flexiones", [[14, null, "3"]]), ses(4, "flexiones", [[15, null, "3"]])];
  const s = suggest("flexiones", h, P, NOW);
  assert.equal(s.estado, "variante"); assert.equal(s.variante, "flexiones-pies-elevados");
});

test("Fuerza usa el rango guardado con la sesión", () => {
  const h = [1, 4].map(d => ({ fecha: day(d), enfasis: "fuerza", ejercicios: [{ id: "sentadilla-barra", objetivo: [4, 6], series: [{ reps: 6, peso: 185, rir: "2" }] }] }));
  assert.equal(suggest("sentadilla-barra", h, P, NOW).estado, "subir");
});

test("calibración serie a serie según la reserva", () => {
  assert.equal(calibrate({ peso: 20, reps: 12, rir: "4+" }, [8, 12], 5).peso, 30);
  assert.equal(calibrate({ peso: 20, reps: 12, rir: "3" }, [8, 12], 5).peso, 25);
  assert.equal(calibrate({ peso: 20, reps: 10, rir: "2" }, [8, 12], 5).peso, 20);
  assert.equal(calibrate({ peso: 20, reps: 5, rir: "0" }, [8, 12], 5).peso, 15);
  assert.equal(calibrate({ peso: 20, reps: 10, rir: null }, [8, 12], 5), null);
});

test("en la sesión: la primera vez el peso de la siguiente serie se calibra con la reserva anotada", () => {
  const log = createLog();
  const sug = suggest("press-mancuernas", [], P, NOW);
  const st = (i, ronda) => ({ i, tipo: "trabajo", ejercicio: "press-mancuernas", ronda, objetivo: [8, 12] });
  markDone(log, st(3, 0), null, sug);
  update(log, 3, { reps: 12, peso: 25, rir: "4+" });
  assert.equal(plannedWeight(log, st(7, 1), null, sug).peso, 35);
  const e = markDone(log, st(7, 1), null, sug);
  assert.equal(e.peso, 35);
  const [res] = summarize(log);
  assert.deepEqual(res.objetivo, [8, 12]); assert.equal(res.series[0].rir, "4+");
});

test("con historial, la sugerencia precarga el peso de la primera serie", () => {
  const h = [ses(2, "press-mancuernas", [[12, 30, "2"]]), ses(5, "press-mancuernas", [[12, 30, "2"]])];
  const sug = suggest("press-mancuernas", h, P, NOW);
  const e = markDone(createLog(), { i: 2, tipo: "trabajo", ejercicio: "press-mancuernas", ronda: 0 }, { peso: 30 }, sug);
  assert.equal(e.peso, 35);
});

test("el historial ignora sesiones sin registro del ejercicio", () => {
  const h = [{ fecha: day(1), ejercicios: [{ id: "press-mancuernas", series: [] , reps: null, peso: null }] }, ses(3, "press-mancuernas", [[10, 30]])];
  assert.equal(exerciseHistory(h, "press-mancuernas").length, 1);
});
