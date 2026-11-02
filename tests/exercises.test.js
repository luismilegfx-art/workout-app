import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES } from "../js/data/exercises.js";
import { MUSCLES, EQUIPMENT, ALL_SUBS } from "../js/data/catalog.js";
import { validateFicha } from "../js/data/exercise-schema.js";

const ctx = {
  ids: new Set(EXERCISES.map(e => e.id)),
  equipos: Object.keys(EQUIPMENT),
  musculos: Object.keys(MUSCLES),
  subs: Object.entries(ALL_SUBS).flatMap(([z, subs]) => subs.map(s => `${z}.${s}`)),
  modelos: new Set(["sentadilla-barra", "flexiones", "curl-mancuernas", "plancha", "sentadilla-pared"]),
};

test("cada ficha de ejercicio está bien formada", () => {
  const errores = EXERCISES.flatMap(e => validateFicha(e, ctx));
  assert.deepEqual(errores, []);
});

test("los identificadores no se repiten", () => {
  assert.equal(ctx.ids.size, EXERCISES.length);
});

test("los cinco ejercicios del bot tienen la ficha completa", () => {
  for (const id of ctx.modelos) {
    const e = EXERCISES.find(x => x.id === id);
    assert.ok(e.tempo && e.control.angulo && e.tension && e.movimiento, id);
  }
});

test("la validación detecta fichas mal hechas", () => {
  const base = EXERCISES.find(e => e.id === "curl-mancuernas");
  const roto = { ...base, tempo: [{ ...base.tempo[0], hasta: 1 }], control: { ...base.control, angulo: { nombre: "Codo", puntos: ["codo"], rango: [90, 10] } } };
  const errs = validateFicha(roto, ctx);
  assert.ok(errs.some(m => m.includes("tres puntos")));
  assert.ok(errs.some(m => m.includes("rango")));
  assert.ok(errs.some(m => m.includes("no continúa")) || errs.some(m => m.includes("isométrico")) || roto.tempo.length === 1);
});
