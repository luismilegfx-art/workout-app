// Ficha del ejercicio: un solo registro por ejercicio que leen la biblioteca, el generador, el bot y la cámara.
// Este módulo define su formato y la validación que corre en las pruebas (tests/exercises.test.js).
//
// Secciones de la ficha (ver js/data/exercises.js):
//   datos        id, nombre, tipo, sub, musculo, secundarios, patron, equipo, nivel, medida, unilateral, carga…
//   técnica      tecnica[], respiracion, error
//   tempo        fases del ciclo: { fase, desde, hasta, dur, resp, cue, esfuerzo }
//                desde/hasta van de 0 (posición inicial) a 1 (posición final); dur en segundos
//   control      lo que se mide y se corrige: { angulo, fijas, alineaciones, limites }
//                limites: reglas de postura que se vigilan todo el tiempo:
//                  { tipo: "angulo", puntos: [a, b, c], min?, max?, texto }   ángulo en b dentro de un rango
//                  { tipo: "inclinacion", puntos: [abajo, arriba], max, texto } segmento respecto a la vertical
//   tension      { articulacion, carga }: la luz del bot se calcula con el brazo de palanca de la carga sobre esa articulación
//   movimiento   { fuente, modelo, vista, accesorios, trayectoria }: de dónde sale la animación y cómo se presenta
// Todo lo que no está definido para un ejercicio queda en null o vacío; se va llenando sin tocar código.

export const FICHA_VERSION = 1;

// Puntos del cuerpo con nombre estable (L = lado izquierdo de la persona).
// El número es el punto equivalente de la cámara (MediaPipe Pose); los arreglos son puntos medios.
export const PUNTOS = {
  head: 0,
  shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16, handL: 19, handR: 20,
  hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28, heelL: 29, heelR: 30, toeL: 31, toeR: 32,
  pelvis: [23, 24], chest: [11, 12], neck: [11, 12],
};

export const TIPOS = ["calentamiento", "principal", "estiramiento"];
export const MEDIDAS = ["reps", "tiempo"];
export const FUENTES = ["manual", "video"];
export const ACCESORIOS = ["barbell", "dumbbells", "kettlebell", "bench", "mat", "wall", "pullup-bar", "ball"];

const isStr = x => typeof x === "string" && x.trim().length > 0;
const isNum = x => typeof x === "number" && Number.isFinite(x);
const isPunto = p => Object.hasOwn(PUNTOS, p);

/**
 * Revisa una ficha y devuelve la lista de problemas (vacía si está bien).
 * `ctx` trae lo que la ficha puede referenciar: { ids, equipos, subs, musculos, modelos? }.
 */
export function validateFicha(e, ctx) {
  const err = [];
  const bad = m => err.push(`${e?.id ?? "?"}: ${m}`);

  // Datos
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id ?? "")) bad("id con formato inválido");
  if (!isStr(e.nombre)) bad("falta el nombre");
  if (!TIPOS.includes(e.tipo)) bad(`tipo desconocido "${e.tipo}"`);
  if (!ctx.musculos.includes(e.musculo)) bad(`músculo desconocido "${e.musculo}"`);
  for (const m of e.secundarios ?? []) if (!ctx.musculos.includes(m)) bad(`músculo secundario desconocido "${m}"`);
  if (e.tipo === "principal" && e.musculo !== "cardio" && !ctx.subs.includes(e.sub)) bad(`subzona inválida "${e.sub}"`);
  if (!Array.isArray(e.equipo) || !e.equipo.length) bad("falta el equipo");
  for (const q of e.equipo ?? []) if (!ctx.equipos.includes(q)) bad(`equipo desconocido "${q}"`);
  if (!MEDIDAS.includes(e.medida)) bad(`medida desconocida "${e.medida}"`);
  if (!(Number.isInteger(e.nivel) && e.nivel >= 1 && e.nivel <= 3)) bad("nivel fuera de 1–3");
  for (const k of ["facil", "dificil"]) if (e[k] != null && !ctx.ids.has(e[k])) bad(`${k} apunta a un ejercicio que no existe ("${e[k]}")`);

  // Técnica
  if (!Array.isArray(e.tecnica) || !e.tecnica.length || !e.tecnica.every(isStr)) bad("falta la técnica");
  if (!isStr(e.respiracion)) bad("falta la respiración");
  if (!isStr(e.error)) bad("falta el error común");

  // Tempo: fases encadenadas que cierran el ciclo
  if (e.tempo != null) {
    if (!Array.isArray(e.tempo) || !e.tempo.length) bad("tempo vacío");
    else {
      e.tempo.forEach((f, i) => {
        if (!isStr(f.fase)) bad(`tempo[${i}] sin nombre de fase`);
        if (!(isNum(f.dur) && f.dur > 0)) bad(`tempo[${i}] con duración inválida`);
        for (const k of ["desde", "hasta"]) if (!(isNum(f[k]) && f[k] >= 0 && f[k] <= 1)) bad(`tempo[${i}].${k} fuera de 0–1`);
        if (f.esfuerzo != null && !(isNum(f.esfuerzo) && f.esfuerzo >= 0 && f.esfuerzo <= 1)) bad(`tempo[${i}].esfuerzo fuera de 0–1`);
        if (!isStr(f.cue)) bad(`tempo[${i}] sin indicación`);
        const prev = e.tempo[(i - 1 + e.tempo.length) % e.tempo.length];
        if (Math.abs(prev.hasta - f.desde) > 1e-6) bad(`tempo[${i}] no continúa donde terminó la fase anterior`);
      });
      if (e.medida === "tiempo" && e.tempo.some(f => f.desde !== f.hasta)) bad("un isométrico no debe moverse en el tempo");
    }
  }

  // Control
  const c = e.control;
  if (!c || typeof c !== "object") bad("falta la sección de control");
  else {
    if (c.angulo != null) {
      const a = c.angulo;
      if (!isStr(a.nombre)) bad("ángulo sin nombre");
      if (!(Array.isArray(a.puntos) && a.puntos.length === 3 && a.puntos.every(isPunto))) bad("el ángulo necesita tres puntos válidos");
      if (!(Array.isArray(a.rango) && a.rango.length === 2 && a.rango.every(isNum) && a.rango[0] < a.rango[1] && a.rango[0] >= 0 && a.rango[1] <= 180))
        bad("rango del ángulo inválido");
    }
    for (const f of c.fijas ?? []) {
      if (!(Array.isArray(f.puntos) && f.puntos.length && f.puntos.every(isPunto))) bad("punto fijo inválido");
      if (!isStr(f.texto)) bad("punto fijo sin texto");
      if (f.respecto != null && !isPunto(f.respecto)) bad("punto fijo con referencia inválida");
    }
    for (const l of c.limites ?? []) {
      if (!["angulo", "inclinacion"].includes(l.tipo)) bad(`límite de tipo desconocido "${l.tipo}"`);
      const n = l.tipo === "angulo" ? 3 : 2;
      if (!(Array.isArray(l.puntos) && l.puntos.length === n && l.puntos.every(isPunto))) bad(`límite ${l.tipo} con puntos inválidos`);
      if (l.min == null && l.max == null) bad("límite sin mínimo ni máximo");
      for (const k of ["min", "max"]) if (l[k] != null && !(isNum(l[k]) && l[k] >= 0 && l[k] <= 180)) bad(`límite.${k} fuera de 0–180`);
      if (!isStr(l.texto)) bad("límite sin texto");
    }
    const ids = new Set();
    for (const a of c.alineaciones ?? []) {
      if (!isStr(a.id) || ids.has(a.id)) bad(`alineación con id inválido o repetido "${a.id}"`);
      ids.add(a.id);
      if (!isStr(a.texto)) bad("alineación sin texto");
    }
  }

  // Tensión
  if (e.tension != null && !(isPunto(e.tension.articulacion) && isPunto(e.tension.carga))) bad("tensión con puntos inválidos");

  // Movimiento
  const m = e.movimiento;
  if (m != null) {
    if (!FUENTES.includes(m.fuente)) bad(`fuente de movimiento desconocida "${m.fuente}"`);
    if (!isStr(m.modelo)) bad("movimiento sin modelo");
    if (ctx.modelos && !ctx.modelos.has(m.modelo)) bad(`no existe el modelo de movimiento "${m.modelo}"`);
    if (!e.tempo) bad("un ejercicio con movimiento necesita tempo");
    const v = m.vista;
    if (!(v && isNum(v.az) && isNum(v.el) && isNum(v.radius) && Array.isArray(v.target) && v.target.length === 3 && v.target.every(isNum))) bad("vista inválida");
    for (const p of m.accesorios ?? []) if (!ACCESORIOS.includes(p)) bad(`accesorio desconocido "${p}"`);
    if (m.trayectoria != null && !isPunto(m.trayectoria)) bad("trayectoria con punto inválido");
  }
  return err;
}
