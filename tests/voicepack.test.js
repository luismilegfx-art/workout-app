import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { setManifest, clipsFor, keyOf } from "../js/engine/voicepack.js";
import { EXERCISES } from "../js/data/exercises.js";
import { generateRoutine } from "../js/engine/generator.js";
import { DEFAULT_SETTINGS, PRESETS } from "../js/data/catalog.js";

const manifest = JSON.parse(readFileSync(new URL("../assets/voz/manifest.json", import.meta.url)));
setManifest(manifest);

test("cada clip del manifiesto existe como archivo", () => {
  for (const f of new Set(Object.values(manifest))) assert.ok(existsSync(new URL(`../assets/voz/${f}`, import.meta.url)), f);
});

test("todos los ejercicios y avisos de las fichas tienen su voz", () => {
  for (const e of EXERCISES) {
    assert.ok(clipsFor(e.nombre), e.nombre);
    for (const x of [...e.control.limites, ...e.control.fijas]) assert.ok(clipsFor(x.texto), x.texto);
  }
});

test("los anuncios de sesiones reales se pueden decir completos con la voz grabada", () => {
  const N = id => EXERCISES.find(e => e.id === id).nombre;
  for (const [zonas, enfasis] of [[PRESETS.push.sel, "fuerza"], [PRESETS.completo.sel, "masa"], [PRESETS.pull.sel, "condicion"]]) {
    const r = generateRoutine({ minutos: 45, zonas, lugar: "casa", preset: "casa", enfasis, seed: 2 }, DEFAULT_SETTINGS);
    for (const s of r.steps) {
      const texts = [];
      if (s.tipo === "trabajo" && s.serie && s.objetivo) texts.push(`Serie ${s.ronda + 1} de ${s.rondas}. ${N(s.ejercicio)}. ${s.objetivo[0]} a ${s.objetivo[1]} repeticiones`);
      if (s.tipo === "aproximacion") texts.push(`Aproximación ${s.paso} de ${s.pasos}. ${N(s.ejercicio)}. ${s.objetivo[0]} repeticiones ligeras`);
      if (s.tipo === "trabajo" && !s.serie) texts.push(s.ronda > 0 ? `Ronda ${s.ronda + 1}. ${N(s.ejercicio)}` : N(s.ejercicio));
      if (s.siguiente) texts.push(`Descanso. Próximo: ${N(s.siguiente)}`, `Cambia el equipo. Próximo: ${N(s.siguiente)}`, `Prepárate. Primero: ${N(s.siguiente)}`);
      for (const t of texts) assert.ok(clipsFor(t), t);
    }
  }
});

test("frases de la cámara y del cierre", () => {
  for (const t of ["12. Más lento y controlado", "3. Rango incompleto", "No te veo completo: acomódate en la imagen", "Listo, empieza",
    "Sesión completada. Buen trabajo.", "Prueba de voz. Tres, dos, uno.", "Cambia de lado", "Diez segundos", "Descanso. Luego ronda 3"]) assert.ok(clipsFor(t), t);
  assert.equal(keyOf("¡Vamos!"), "vamos");
});
