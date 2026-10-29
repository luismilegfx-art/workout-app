import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRoutine } from "../js/engine/generator.js";
import { DEFAULT_SETTINGS, FOCUSES, PRESETS, ALL_SUBS } from "../js/data/catalog.js";
import { EXERCISE_BY_ID } from "../js/data/exercises.js";

const settings = structuredClone(DEFAULT_SETTINGS);
const minutes = [6, 10, 15, 20, 30, 45, 60, 75];
const places = ["casa", "gym"];
const emphases = ["fuerza", "masa", "condicion"];
const ids = r => r.bloques.flatMap(b => b.ejercicios);

test("la duración cae dentro del margen en todas las combinaciones", () => {
  const misses = [];
  for (const enfoque of Object.keys(FOCUSES))
  for (const lugar of places)
  for (const enfasis of emphases)
  for (const m of minutes)
  for (const seed of [1, 2, 3]) {
    const r = generateRoutine({ minutos: m, enfoque, lugar, enfasis, seed }, settings);
    const diff = Math.abs(r.totalSec - m * 60) / (m * 60);
    if (diff > 0.10) misses.push(`${enfoque}/${lugar}/${enfasis}/${m}min → ${(r.totalSec / 60).toFixed(1)} min`);
  }
  assert.deepEqual(misses, []);
});

test("solo usa el equipo del preset (peso corporal)", () => {
  for (const enfoque of Object.keys(FOCUSES)) {
    const r = generateRoutine({ minutos: 30, enfoque, lugar: "casa", equipo: ["corporal"], enfasis: "masa", seed: 7 }, settings);
    for (const id of ids(r)) assert.deepEqual(EXERCISE_BY_ID[id].equipo, ["corporal"], `${enfoque}: ${id}`);
  }
});

test("preset Solo mancuernas: solo mancuernas o peso corporal", () => {
  for (const [k, p] of Object.entries(PRESETS)) for (const seed of [1, 2]) {
    const r = generateRoutine({ minutos: 40, zonas: p.sel, lugar: "casa", preset: "mancuernas", enfasis: "masa", seed }, settings);
    for (const id of ids(r)) assert.ok(EXERCISE_BY_ID[id].equipo.every(q => ["corporal", "mancuernas"].includes(q)), `${k}: ${id}`);
  }
});

test("respeta las subzonas escogidas (Push no incluye bíceps)", () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = generateRoutine({ minutos: 45, zonas: PRESETS.push.sel, lugar: "gym", enfasis: "masa", seed }, settings);
    for (const id of ids(r)) {
      const sub = EXERCISE_BY_ID[id].sub;
      const [z, s] = sub.split(".");
      assert.ok(PRESETS.push.sel[z], `${id} fuera de las zonas`);
      assert.notEqual(sub, "brazos.biceps", id);
    }
  }
});

test("la subzona prioritaria recibe más ejercicios", () => {
  let prioCount = 0, otherCount = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = generateRoutine({ minutos: 45, zonas: { piernas: ALL_SUBS.piernas }, prioridad: ["piernas.gluteos"], lugar: "gym", enfasis: "masa", seed }, settings);
    for (const id of ids(r)) {
      if (EXERCISE_BY_ID[id].sub === "piernas.gluteos") prioCount++;
      if (EXERCISE_BY_ID[id].sub === "piernas.pantorrillas") otherCount++;
    }
  }
  assert.ok(prioCount > otherCount * 1.5, `glúteos ${prioCount} vs pantorrillas ${otherCount}`);
});

test("varía ángulos y agarres dentro de un bloque de bíceps", () => {
  const r = generateRoutine({ minutos: 30, zonas: { brazos: ["biceps"] }, lugar: "casa", enfasis: "masa", seed: 11 }, settings);
  const patterns = r.bloques[0].ejercicios.map(id => EXERCISE_BY_ID[id].patron);
  assert.ok(new Set(patterns).size >= Math.min(3, patterns.length), patterns.join(", "));
});

test("no repite ejercicios dentro de una rutina cuando hay suficientes", () => {
  const r = generateRoutine({ minutos: 60, enfoque: "completo", lugar: "gym", enfasis: "masa", seed: 3 }, settings);
  assert.equal(new Set(ids(r)).size, ids(r).length);
});

test("exprés: una sola zona, sin descanso y sin estiramiento por defecto", () => {
  const r = generateRoutine({ minutos: 6, enfoque: "core", lugar: "casa", seed: 5 }, settings);
  assert.equal(r.expres, true);
  assert.equal(new Set(r.bloques.map(b => b.zona)).size, 1);
  assert.equal(r.estiramiento.length, 0);
  assert.equal(r.steps.filter(s => s.tipo === "descanso").length, 0);
});

test("incluye calentamiento al inicio y estiramiento al final", () => {
  const r = generateRoutine({ minutos: 45, enfoque: "push", lugar: "casa", enfasis: "masa", seed: 9 }, settings);
  const tipos = r.steps.map(s => s.tipo);
  assert.equal(tipos[0], "preparacion");
  assert.equal(tipos[1], "calentamiento");
  assert.equal(tipos.at(-1), "estiramiento");
});

test("excluye ejercicios marcados por molestias", () => {
  const s = structuredClone(settings); s.evitar = ["flexiones", "press-mancuernas", "press-banca-barra"];
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = generateRoutine({ minutos: 45, enfoque: "pecho", lugar: "casa", enfasis: "masa", seed }, s);
    for (const id of ids(r)) assert.ok(!s.evitar.includes(id));
  }
});

test("con pocos bloques entran primero las zonas trabajadas hace más tiempo", () => {
  const history = [{ zonas: { pecho: ["superior", "medio"], hombros: ["anterior", "lateral"] } }];
  const r = generateRoutine({ minutos: 20, zonas: PRESETS.push.sel, lugar: "casa", enfasis: "masa", seed: 42 }, settings, history);
  assert.ok(r.bloques.some(b => b.zona === "brazos"), `zonas: ${r.bloques.map(b => b.zona)}`);
});

test("el calentamiento de piernas no incluye ejercicios de tren superior", () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = generateRoutine({ minutos: 60, enfoque: "piernas", lugar: "gym", enfasis: "fuerza", seed }, settings);
    for (const id of r.calentamiento) assert.notEqual(EXERCISE_BY_ID[id].zona, "superior", id);
  }
});

test("no sale de las subzonas escogidas aunque falten ejercicios (Pull con solo mancuernas)", () => {
  for (const seed of [1, 2, 3, 21]) {
    const r = generateRoutine({ minutos: 25, zonas: PRESETS.pull.sel, lugar: "casa", preset: "mancuernas", enfasis: "masa", seed }, settings);
    const allowed = new Set(Object.entries(PRESETS.pull.sel).flatMap(([z, subs]) => subs.map(s => `${z}.${s}`)));
    for (const id of ids(r)) assert.ok(allowed.has(EXERCISE_BY_ID[id].sub), `${id} (${EXERCISE_BY_ID[id].sub})`);
  }
});
