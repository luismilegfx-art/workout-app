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

test("con pocos ejercicios entran primero las zonas trabajadas hace más tiempo", () => {
  const history = [{ zonas: { pecho: ["superior", "medio"], hombros: ["anterior", "lateral"] } }];
  const r = generateRoutine({ minutos: 20, zonas: PRESETS.push.sel, lugar: "casa", enfasis: "masa", seed: 42 }, settings, history);
  const subs = r.bloques.flatMap(b => b.ejercicios.map(id => EXERCISE_BY_ID[id].sub));
  assert.ok(subs.some(s => s.startsWith("brazos.")), `subzonas: ${subs}`);
});

test("todas las zonas escogidas entran cuando hay ejercicios suficientes (cuerpo completo)", () => {
  for (const enfasis of ["masa", "condicion"]) for (const seed of [1, 2, 3]) {
    const r = generateRoutine({ minutos: 45, zonas: PRESETS.completo.sel, lugar: "casa", preset: "casa", enfasis, seed }, settings);
    const zonas = new Set(r.bloques.flatMap(b => b.ejercicios.map(id => EXERCISE_BY_ID[id].sub.split(".")[0])));
    for (const z of ["piernas", "espalda", "pecho", "hombros", "abdomen"]) assert.ok(zonas.has(z), `${enfasis} ${seed}: falta ${z}`);
  }
});

test("Fuerza usa ejercicios con carga cuando el equipo lo permite", () => {
  for (const [zonas, lugar] of [[PRESETS.piernas.sel, "casa"], [PRESETS.push.sel, "gym"], [PRESETS.pull.sel, "gym"]]) for (const seed of [1, 2, 3, 4]) {
    const r = generateRoutine({ minutos: 50, zonas, lugar, preset: "casa", enfasis: "fuerza", seed }, settings);
    for (const b of r.bloques) {
      const e = EXERCISE_BY_ID[b.ejercicios[0]];
      assert.ok(e.carga || e.equipo.includes("dominadas") || e.medida === "tiempo", `${lugar} ${seed}: ${e.id}`);
    }
    const main = EXERCISE_BY_ID[r.bloques[0].ejercicios[0]];
    assert.ok(main.carga && !main.patron.startsWith("aislamiento"), `principal ${main.id}`);
  }
});

test("no junta un ejercicio con su variante fácil o difícil en la misma sesión", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = generateRoutine({ minutos: 45, zonas: PRESETS.pull.sel, lugar: "casa", preset: "casa", enfasis: "masa", seed }, settings);
    const ids = new Set(r.bloques.flatMap(b => b.ejercicios));
    for (const id of ids) { const e = EXERCISE_BY_ID[id]; assert.ok(!ids.has(e.facil) && !ids.has(e.dificil), `${seed}: ${id}`); }
  }
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

test("los ejercicios unilaterales duran el doble (tiempo completo por lado)", () => {
  const r = generateRoutine({ minutos: 45, zonas: { piernas: ["cuadriceps", "gluteos"] }, lugar: "casa", enfasis: "masa", seed: 1 }, settings);
  const work = r.steps.filter(s => s.tipo === "trabajo");
  const uni = work.find(s => EXERCISE_BY_ID[s.ejercicio].unilateral), bi = work.find(s => !EXERCISE_BY_ID[s.ejercicio].unilateral);
  if (uni && bi) assert.equal(uni.duracion, bi.duracion * 2);
});

test("límite de equipos: no más de 3 equipos distintos por sesión", () => {
  const gear = r => new Set(r.bloques.flatMap(b => b.ejercicios).flatMap(id => EXERCISE_BY_ID[id].equipo.filter(q => q !== "corporal")));
  for (const [k, p] of Object.entries(PRESETS)) for (const lugar of ["casa", "gym"]) for (const seed of [1, 2, 3]) {
    const r = generateRoutine({ minutos: 45, zonas: p.sel, lugar, enfasis: "masa", seed }, settings);
    assert.ok(gear(r).size <= 3, `${k}/${lugar}/${seed}: ${[...gear(r)]}`);
  }
});

test("dentro de un bloque los ejercicios con el mismo equipo quedan seguidos", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = generateRoutine({ minutos: 45, zonas: PRESETS.push.sel, lugar: "gym", enfasis: "masa", seed }, settings);
    for (const b of r.bloques) {
      const keys = b.ejercicios.map(id => EXERCISE_BY_ID[id].equipo.filter(q => q !== "corporal").sort().join("+"));
      const seen = new Set(); let prev = null;
      for (const k of keys) { if (k !== prev) { assert.ok(!seen.has(k), `${keys}`); seen.add(k); } prev = k; }
    }
  }
});

test("Fuerza: series abiertas con objetivo de reps, principales primero con aproximación", () => {
  for (const seed of [1, 2, 3]) {
    const r = generateRoutine({ minutos: 45, zonas: PRESETS.piernas.sel, lugar: "gym", enfasis: "fuerza", seed }, settings);
    assert.equal(r.modo, "series");
    assert.ok(r.bloques.every(b => b.ejercicios.length === 1));
    assert.ok(r.bloques.length >= 2 && r.bloques.length <= 6, `${r.bloques.length} ejercicios`);
    const sets = r.steps.filter(s => s.tipo === "trabajo" && s.abierto);
    assert.ok(sets.every(s => Array.isArray(s.objetivo)));
    assert.ok(r.bloques[0].principal);
    const firstWork = r.steps.findIndex(s => s.tipo === "trabajo");
    if (r.bloques[0].aproximacion) assert.equal(r.steps.slice(0, firstWork).some(s => s.tipo === "aproximacion"), true);
  }
});

test("equipo elegido: se usa solo ese equipo y sin el límite automático", () => {
  const equipo = ["corporal", "barra", "banco", "mancuernas", "kettlebell", "balon", "dominadas"];
  let maxSeen = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const r = generateRoutine({ minutos: 60, zonas: PRESETS.completo.sel, lugar: "casa", equipo, maxEquipos: Infinity, enfasis: "masa", seed }, settings);
    const used = new Set(ids(r).flatMap(id => EXERCISE_BY_ID[id].equipo.filter(q => q !== "corporal")));
    for (const q of used) assert.ok(equipo.includes(q), q);
    maxSeen = Math.max(maxSeen, used.size);
  }
  assert.ok(maxSeen > 3, `nunca pasó de ${maxSeen} equipos`);
});

test("avisa las zonas que quedan sin ejercicios con el equipo elegido", () => {
  const r = generateRoutine({ minutos: 30, zonas: { brazos: ["antebrazo"], pecho: ["superior", "medio"] }, lugar: "casa", equipo: ["corporal"], enfasis: "masa", seed: 1 }, settings);
  assert.deepEqual(r.sinEjercicios, ["brazos"]);
});

test("distingue las zonas que quedan fuera por tiempo de las que no tienen equipo", () => {
  const r = generateRoutine({ minutos: 30, zonas: PRESETS.push.sel, lugar: "casa", preset: "casa", enfasis: "fuerza", seed: 3 }, settings);
  assert.deepEqual(r.sinEjercicios, []);
  for (const z of r.sinTiempo) assert.ok(!r.bloques.some(b => b.zona === z), z);
});

test("Fuerza planifica con la duración real de tus series", () => {
  const base = generateRoutine({ minutos: 45, zonas: PRESETS.push.sel, lugar: "gym", enfasis: "fuerza", seed: 4 }, settings);
  const slow = generateRoutine({ minutos: 45, zonas: PRESETS.push.sel, lugar: "gym", enfasis: "fuerza", seed: 4, tiempoSerie: { global: 70 } }, settings);
  const setsOf = r => r.steps.filter(s => s.tipo === "trabajo").length;
  assert.ok(setsOf(slow) <= setsOf(base), `${setsOf(slow)} vs ${setsOf(base)}`);
  assert.ok(Math.abs(slow.totalSec - 45 * 60) / (45 * 60) <= 0.1);
});

test("condición sin suelo: ni ejercicios, ni calentamiento, ni estiramiento en el suelo", () => {
  for (const [zonas, enfasis] of [[PRESETS.completo.sel, "masa"], [PRESETS.push.sel, "condicion"], [PRESETS.core.sel, "masa"], [PRESETS.piernas.sel, "fuerza"]]) for (const seed of [1, 2, 3]) {
    const r = generateRoutine({ minutos: 40, zonas, lugar: "casa", equipo: ["corporal", "mancuernas"], maxEquipos: Infinity, enfasis, seed, condiciones: { sinSuelo: true } }, settings);
    const ids = [...r.calentamiento, ...r.bloques.flatMap(b => b.ejercicios), ...r.estiramiento];
    for (const id of ids) assert.ok(!EXERCISE_BY_ID[id].suelo, `${enfasis} ${seed}: ${id}`);
  }
});
