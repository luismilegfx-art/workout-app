import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRoutine } from "../js/engine/generator.js";
import { DEFAULT_SETTINGS, FOCUSES } from "../js/data/catalog.js";
import { EXERCISE_BY_ID } from "../js/data/exercises.js";

const settings = structuredClone(DEFAULT_SETTINGS);
const minutes = [6, 10, 15, 20, 30, 45, 60, 75];
const places = ["casa", "gym"];
const emphases = ["fuerza", "masa", "condicion"];

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

test("en casa solo usa el equipo disponible", () => {
  const s = structuredClone(settings); s.equipoCasa = ["corporal"];
  for (const enfoque of Object.keys(FOCUSES)) {
    const r = generateRoutine({ minutos: 30, enfoque, lugar: "casa", enfasis: "masa", seed: 7 }, s);
    for (const b of r.bloques) for (const id of b.ejercicios)
      assert.deepEqual(EXERCISE_BY_ID[id].equipo, ["corporal"], `${enfoque}: ${id}`);
  }
});

test("no repite ejercicios dentro de una rutina", () => {
  const r = generateRoutine({ minutos: 60, enfoque: "completo", lugar: "gym", enfasis: "masa", seed: 3 }, settings);
  const ids = r.bloques.flatMap(b => b.ejercicios);
  assert.equal(new Set(ids).size, ids.length);
});

test("exprés: un solo grupo, sin descanso y sin estiramiento por defecto", () => {
  const r = generateRoutine({ minutos: 6, enfoque: "core", lugar: "casa", seed: 5 }, settings);
  assert.equal(r.expres, true);
  assert.equal(new Set(r.bloques.map(b => b.grupo)).size, 1);
  assert.equal(r.estiramiento.length, 0);
  assert.ok(r.steps.filter(s => s.tipo === "descanso").length === 0);
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
    for (const id of r.bloques.flatMap(b => b.ejercicios)) assert.ok(!s.evitar.includes(id));
  }
});

test("rota los grupos según el historial cuando no caben todos", () => {
  const history = [{ grupos: ["pecho", "hombros"] }];
  const r = generateRoutine({ minutos: 20, enfoque: "push", lugar: "casa", enfasis: "masa", seed: 42 }, settings, history);
  assert.ok(r.grupos.includes("triceps"), `grupos: ${r.grupos}`);
});

test("el calentamiento de piernas no incluye ejercicios de tren superior", () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = generateRoutine({ minutos: 60, enfoque: "piernas", lugar: "gym", enfasis: "fuerza", seed }, settings);
    for (const id of r.calentamiento) assert.notEqual(EXERCISE_BY_ID[id].zona, "superior", id);
  }
});
