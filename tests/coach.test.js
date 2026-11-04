import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoach } from "../js/engine/coach.js";
import { EXERCISE_BY_ID as E } from "../js/data/exercises.js";

// Cuerpo sintético visto de lado (coordenadas de imagen 0–1). Solo se mueve la articulación medida.
function body({ knee = 175, elbow = 165, hip = 178, heelLift = 0, elbowFwd = 0, vis = 1 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
  const set = (i, x, y) => { lm[i] = { x, y, z: 0, visibility: vis }; };
  const r = d => d * Math.PI / 180;
  // pierna: tobillo abajo, rodilla encima, cadera según el ángulo de rodilla
  for (const [an, kn, hp, he] of [[27, 25, 23, 29], [28, 26, 24, 30]]) {
    set(an, 0.5, 0.9); set(kn, 0.5, 0.7); set(he, 0.47, 0.92 - heelLift);
    set(hp, 0.5 + 0.2 * Math.sin(r(knee)), 0.7 + 0.2 * Math.cos(r(knee)));
  }
  // tronco: hombros sobre la cadera, con el ángulo de cadera hombro-cadera-rodilla
  const hpY = lm[23].y, hpX = lm[23].x;
  for (const [sh, el, wr] of [[11, 13, 15], [12, 14, 16]]) {
    set(sh, hpX + 0.3 * Math.sin(r(180 - hip)), hpY - 0.3 * Math.cos(r(180 - hip)));
    const s = lm[sh];
    set(el, s.x + elbowFwd, s.y + 0.15);
    set(wr, s.x + elbowFwd + 0.15 * Math.sin(r(180 - elbow)), s.y + 0.15 + 0.15 * Math.cos(r(180 - elbow)));
  }
  return { lm };
}
// Recorre una secuencia de [segundos, parámetros de inicio, parámetros de fin] a 30 cuadros por segundo
function run(coach, plan) {
  let t = 0; const eventos = [];
  for (const [sec, from, to] of plan) {
    const n = Math.round(sec * 30);
    for (let k = 0; k < n; k++) {
      const f = n > 1 ? k / (n - 1) : 1, p = {};
      for (const key of Object.keys(to)) p[key] = typeof to[key] === "number" ? from[key] + (to[key] - from[key]) * f : to[key];
      eventos.push(...coach.update(body(p), t).eventos);
      t += 1000 / 30;
    }
  }
  return eventos;
}
const reps = (n, sec, top, bottom, key) => Array.from({ length: n }, () => [[sec / 2, { [key]: top }, { [key]: bottom }], [sec / 2, { [key]: bottom }, { [key]: top }]]).flat();

test("sentadilla: espera la posición inicial y cuenta repeticiones completas", () => {
  const c = createCoach(E["sentadilla-barra"]);
  const ev = run(c, [[1.5, { knee: 175 }, { knee: 175 }], ...reps(3, 3, 175, 70, "knee"), [0.5, { knee: 175 }, { knee: 175 }]]);
  assert.ok(ev.some(e => e.tipo === "listo"));
  assert.equal(c.reps, 3);
  assert.ok(ev.filter(e => e.tipo === "rep").every(e => e.completa && !e.rapida));
});

test("sentadilla: una bajada corta cuenta pero avisa el rango incompleto", () => {
  const c = createCoach(E["sentadilla-barra"]);
  const ev = run(c, [[1.5, { knee: 175 }, { knee: 175 }], ...reps(1, 3, 175, 125, "knee"), [0.5, { knee: 175 }, { knee: 175 }]]);
  const rep = ev.find(e => e.tipo === "rep");
  assert.equal(rep.completa, false); assert.match(rep.texto, /Rango incompleto/);
});

test("sentadilla: repeticiones mucho más rápidas que el tempo piden ir más lento", () => {
  const c = createCoach(E["sentadilla-barra"]);
  const ev = run(c, [[1.5, { knee: 175 }, { knee: 175 }], ...reps(2, 1, 175, 70, "knee"), [0.5, { knee: 175 }, { knee: 175 }]]);
  assert.equal(c.reps, 2); assert.ok(ev.some(e => e.rapida));
});

test("sentadilla: despegar los talones dispara el aviso de la ficha", () => {
  const c = createCoach(E["sentadilla-barra"]);
  const ev = run(c, [[1.5, { knee: 175, heelLift: 0 }, { knee: 175, heelLift: 0 }], [1.5, { knee: 175, heelLift: 0 }, { knee: 80, heelLift: 0.08 }], [1.5, { knee: 80, heelLift: 0.08 }, { knee: 175, heelLift: 0 }]]);
  assert.ok(ev.some(e => e.tipo === "aviso" && e.texto === "Talones apoyados"));
});

test("si deja de verte se pausa y no cuenta hasta volver a estar estable", () => {
  const c = createCoach(E["sentadilla-barra"]);
  run(c, [[1.5, { knee: 175 }, { knee: 175 }], ...reps(1, 3, 175, 70, "knee")]);
  const ev = run(c, [[1, { knee: 175, vis: 0 }, { knee: 175, vis: 0 }]]);
  assert.equal(c.estado, "perdido"); assert.ok(ev.some(e => /No te veo/.test(e.texto)));
  run(c, [[0.3, { knee: 175 }, { knee: 175 }], ...reps(1, 3, 175, 70, "knee")]);
  assert.equal(c.reps, 1, "no cuenta antes de la posición estable");
});

test("curl: empieza con el brazo extendido y cuenta al volver", () => {
  const c = createCoach(E["curl-mancuernas"]);
  run(c, [[1.5, { elbow: 165 }, { elbow: 165 }], ...reps(4, 3.5, 165, 45, "elbow"), [0.5, { elbow: 165 }, { elbow: 165 }]]);
  assert.equal(c.reps, 4);
});

test("plancha: mide el tiempo sostenido y avisa si la cadera se sale del rango", () => {
  const c = createCoach(E["plancha"]);
  run(c, [[1.5, { hip: 176 }, { hip: 176 }], [3, { hip: 176 }, { hip: 176 }]]);
  assert.equal(c.estado, "sosteniendo");
  const ev = run(c, [[1.5, { hip: 176 }, { hip: 150 }], [1, { hip: 150 }, { hip: 150 }]]);
  assert.ok(ev.some(e => e.tipo === "aviso"));
});

test("sentadilla: dejar caer el torso hacia adelante avisa “pecho arriba”", () => {
  const c = createCoach(E["sentadilla-barra"]);
  const ev = run(c, [[1.5, { knee: 175, hip: 178 }, { knee: 175, hip: 178 }], [1.5, { knee: 175, hip: 178 }, { knee: 80, hip: 110 }], [1.5, { knee: 80, hip: 110 }, { knee: 175, hip: 178 }]]);
  assert.ok(ev.some(e => e.tipo === "aviso" && /Pecho arriba/.test(e.texto)), ev.map(e => e.texto).join(" | "));
});

test("sentadilla: con el torso firme no hay aviso de espalda", () => {
  const c = createCoach(E["sentadilla-barra"]);
  const ev = run(c, [[1.5, { knee: 175, hip: 178 }, { knee: 175, hip: 178 }], [1.5, { knee: 175, hip: 178 }, { knee: 80, hip: 150 }], [1.5, { knee: 80, hip: 150 }, { knee: 175, hip: 178 }]]);
  assert.ok(!ev.some(e => /Pecho arriba/.test(e.texto)));
});

test("plancha: la cadera que cae dispara el límite de la ficha", () => {
  const c = createCoach(E["plancha"]);
  run(c, [[1.5, { hip: 176 }, { hip: 176 }]]);
  const ev = run(c, [[1, { hip: 176 }, { hip: 160 }], [1, { hip: 160 }, { hip: 160 }]]);
  assert.ok(ev.some(e => /Cadera arriba/.test(e.texto)), ev.map(e => e.texto).join(" | "));
});

test("curl: el codo que se mueve con el cuerpo no dispara el aviso; el que se adelanta sí", () => {
  const c = createCoach(E["curl-mancuernas"]);
  const ev = run(c, [[1.5, { elbow: 165 }, { elbow: 165 }], ...reps(3, 3.5, 165, 45, "elbow"), [0.5, { elbow: 165 }, { elbow: 165 }]]);
  assert.ok(!ev.some(e => /Codos/.test(e.texto)), ev.map(e => e.texto).join(" | "));
});

test("curl: si el codo se adelanta durante la subida, avisa “Codos pegados al torso”", () => {
  const c = createCoach(E["curl-mancuernas"]);
  const ev = run(c, [[1.5, { elbow: 165, elbowFwd: 0 }, { elbow: 165, elbowFwd: 0 }], [1.5, { elbow: 165, elbowFwd: 0 }, { elbow: 50, elbowFwd: 0.12 }], [1.5, { elbow: 50, elbowFwd: 0.12 }, { elbow: 165, elbowFwd: 0 }]]);
  assert.ok(ev.some(e => /Codos pegados/.test(e.texto)), ev.map(e => e.texto).join(" | "));
});
