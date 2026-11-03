import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendToday, subzoneRecovery } from "../js/engine/recommend.js";
import { DEFAULT_SETTINGS, PRESETS } from "../js/data/catalog.js";

const S = DEFAULT_SETTINGS;
const NOW = Date.parse("2026-11-03T18:00:00Z");
const ago = h => new Date(NOW - h * 3_600_000).toISOString();
const ses = (h, preset, enfasis = "masa") => ({ fecha: ago(h), zonas: PRESETS[preset].sel, enfasis });

test("sin historial propone cuerpo completo", () => {
  const r = recommendToday([], S, NOW);
  assert.equal(r.preset, "completo"); assert.equal(r.estado, "entrenar");
});

test("después de Push ayer no repite Push", () => {
  const r = recommendToday([ses(20, "push")], S, NOW);
  assert.notEqual(r.preset, "push"); assert.ok(["pull", "piernas"].includes(r.preset), r.preset);
  assert.match(r.motivo, /Pecho|Hombros|Brazos/);
});

test("Push y Pull se pueden alternar en días seguidos: no comparten subzonas", () => {
  const r = recommendToday([ses(20, "pull"), ses(44, "piernas"), ses(70, "push")], S, NOW);
  assert.equal(r.preset, "push");
});

test("con todo trabajado en las últimas 48 horas recomienda descanso", () => {
  const r = recommendToday([ses(10, "completo")], S, NOW);
  assert.equal(r.estado, "descanso"); assert.ok(r.alternativa);
});

test("entre opciones descansadas gana la que lleva más tiempo sin trabajarse", () => {
  const r = recommendToday([ses(60, "push"), ses(100, "pull"), ses(200, "piernas")], S, NOW);
  assert.equal(r.preset, "piernas");
});

test("el énfasis rota empezando por el usado hace más tiempo", () => {
  const r = recommendToday([ses(60, "push", "masa"), ses(100, "pull", "fuerza")], S, NOW);
  assert.equal(r.enfasis, "condicion");
});

test("registros sin zonas se leen por sus ejercicios", () => {
  const rec = subzoneRecovery([{ fecha: ago(5), ejercicios: [{ id: "sentadilla-barra" }] }], NOW);
  assert.ok(rec["piernas.cuadriceps"] < 6); assert.equal(rec["pecho.medio"], null);
});
