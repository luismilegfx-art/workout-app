// Ejercicios del bot armados desde la ficha única (js/data/exercises.js) y su modelo de movimiento (motions.js).
// La ficha dice qué se enseña (tempo, ángulo, puntos fijos, alineaciones, vista); el modelo, cómo se mueve el cuerpo.
import { EXERCISES } from "../../js/data/exercises.js";
import { MUSCLES, ZONES } from "../../js/data/catalog.js";
import { lerp } from "./rig.js";
import { MOTIONS } from "./motions.js";

// Pieza del bot que se ilumina por cada músculo de la ficha
const SEGMENTOS = {
  pecho: ["chest"], espalda: ["chest"], hombros: ["shoulderL", "shoulderR"],
  biceps: ["upperArmL", "upperArmR"], triceps: ["upperArmL", "upperArmR"], antebrazo: ["forearmL", "forearmR"],
  cuadriceps: ["thighL", "thighR"], isquios: ["thighL", "thighR"], aductores: ["thighL", "thighR"],
  gluteos: ["pelvis"], pantorrillas: ["shinL", "shinR"], core: ["abdomen"], cardio: [],
};

function fromFicha(f) {
  const m = MOTIONS[f.movimiento.modelo];
  const musculos = [f.musculo, ...f.secundarios];
  const zona = f.sub ? ZONES[f.sub.split(".")[0]].nombre : MUSCLES[f.musculo];
  const nombres = musculos.map(x => MUSCLES[x]).filter(n => n !== zona)       // "Pecho · Tríceps y hombros", sin repetir la zona
    .map((n, i) => i ? n.toLowerCase() : n);
  const y = /^h?i/i.test(nombres.at(-1)) ? " e " : " y ";
  return {
    id: f.id, nombre: f.nombre, ficha: f,
    zona: `${zona} · ${nombres.length > 1 ? nombres.slice(0, -1).join(", ") + y + nombres.at(-1) : nombres[0]}`,
    isometrico: f.medida === "tiempo",
    vista: f.movimiento.vista, props: f.movimiento.accesorios, flecha: f.movimiento.trayectoria,
    musculos: [...new Set(musculos.flatMap(x => SEGMENTOS[x] ?? []))],
    fijas: f.control.fijas.flatMap(x => x.puntos.map((p, i) => ({ joint: p, label: i === 0 ? x.texto : undefined }))),
    angulo: f.control.angulo, tempo: f.tempo,
    pose: m.pose,
    lineas: (j, p) => { const g = m.lineas?.(j, p) ?? {}; return f.control.alineaciones.filter(a => g[a.id]).map(a => [...g[a.id], a.texto]); },
    ...(m.wallZ != null ? { wallZ: m.wallZ } : {}),
  };
}

// Todos los ejercicios con movimiento disponible, en el orden de la prueba
const ORDEN = ["sentadilla-barra", "flexiones", "curl-mancuernas", "plancha", "sentadilla-pared"];
export const BOT_EXERCISES = EXERCISES.filter(e => e.movimiento && MOTIONS[e.movimiento.modelo])
  .sort((a, b) => (ORDEN.indexOf(a.id) + 1 || 99) - (ORDEN.indexOf(b.id) + 1 || 99))
  .map(fromFicha);

// Posición t y fase actual a partir del tiempo del ciclo
export function sample(ex, time) {
  const total = ex.tempo.reduce((s, p) => s + p.dur, 0);
  let tc = ((time % total) + total) % total;
  for (const ph of ex.tempo) {
    if (tc <= ph.dur) {
      const k = ph.dur ? tc / ph.dur : 1;
      const e = k * k * (3 - 2 * k);
      return { t: lerp(ph.desde, ph.hasta, e), fase: ph, restante: ph.dur - tc, total };
    }
    tc -= ph.dur;
  }
  const last = ex.tempo[ex.tempo.length - 1];
  return { t: last.hasta, fase: last, restante: 0, total };
}
