// Lista de todas las frases que dice la app (nombres de ejercicios, anuncios, avisos de la cámara, números).
// Uso: node herramientas/voz/frases.mjs > herramientas/voz/frases.json
// Cada frase se genera una vez como audio (generar.py) y la app la reproduce por su clave (js/engine/voicepack.js).
import { EXERCISES } from "../../js/data/exercises.js";
import { keyOf } from "../../js/engine/voicepack.js";

const set = new Map();
// clave = como lo pide la app; valor = lo que se pronuncia (sin aclaraciones entre paréntesis)
const add = (t, spoken = t) => { const k = keyOf(t); if (k && !set.has(k)) set.set(k, spoken.replace(/\s*\([^)]*\)/g, "").trim()); };

// Anuncios fijos del reproductor, la cámara y Perfil
[
  "Prepárate", "Primero", "Calentamiento", "Estiramiento", "Descanso", "Próximo", "Cambia el equipo", "Cambio de bloque",
  "Cambia de lado", "Diez segundos", "Sesión completada", "Buen trabajo", "Cambio", "Prueba de voz", "Tres, dos, uno",
  "Listo, empieza", "Sostén la posición", "No te veo completo", "Acomódate en la imagen", "Más lento y controlado",
  "Rango incompleto", "Cámara lista", "Último ejercicio", "Vamos",
].forEach(t => add(t));
// Ejercicios: el nombre de cada uno
EXERCISES.forEach(e => add(e.nombre));
// Avisos de las fichas (límites y puntos fijos)
EXERCISES.forEach(e => [...(e.control?.limites ?? []), ...(e.control?.fijas ?? [])].forEach(x => add(x.texto)));
// Plantillas con números
for (let n = 1; n <= 6; n++) for (let i = 1; i <= n; i++) add(`Serie ${i} de ${n}`);
for (let n = 1; n <= 3; n++) for (let i = 1; i <= n; i++) add(`Aproximación ${i} de ${n}`);
for (let i = 2; i <= 10; i++) { add(`Ronda ${i}`); add(`Luego ronda ${i}`); }
for (let a = 1; a <= 20; a++) for (let b = a + 1; b <= Math.min(30, a + 10); b++) add(`${a} a ${b} repeticiones`);
for (let a = 1; a <= 15; a++) add(`${a} repeticiones ligeras`);
for (let n = 1; n <= 60; n++) add(String(n));

console.log(JSON.stringify(Object.fromEntries(set), null, 1));
