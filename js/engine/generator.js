// Generador de rutinas y distribución del tiempo.
// Implementa el algoritmo de la especificación técnica. Es una función pura: misma entrada + misma semilla = misma rutina.
import { EXERCISES, EXERCISE_BY_ID } from "../data/exercises.js";
import { ZONES, FOCUSES, equipmentFor } from "../data/catalog.js";

const PREP_SEC = 10;            // cuenta regresiva inicial
const RECENT_SESSIONS = 2;      // sesiones recientes cuyos ejercicios se evitan

// ───────── utilidades ─────────
export function rngFrom(seed) {             // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const range = (lo, hi, step) => { const out = []; for (let v = lo; v <= hi; v += step) out.push(v); return out.length ? out : [lo]; };
const isIsolation = e => e.patron.startsWith("aislamiento");

function weightedPick(items, weightOf, rng) {
  const ws = items.map(weightOf); const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function usable(e, equip, settings) {
  return e.equipo.every(q => equip.has(q)) && !settings.desactivados.includes(e.id) && !settings.evitar.includes(e.id);
}
function recentIds(history) {
  const ids = new Set();
  history.slice(0, RECENT_SESSIONS).forEach(s => (s.ejercicios ?? []).forEach(e => ids.add(e.id)));
  return ids;
}
// Índice en el historial de la última sesión que trabajó una zona (más alto = hace más tiempo)
function lastTrained(history, zona) {
  const i = history.findIndex(s => s.zonas ? zona in s.zonas : (FOCUSES[s.enfoque]?.zonas ?? {})[zona]);
  return i === -1 ? Infinity : i;
}

// Énfasis sugerido cuando no se indica: el objetivo usado hace más tiempo
export function pickEmphasis(settings, history, rng) {
  const options = settings.objetivos.length ? settings.objetivos : ["masa"];
  const lastUse = Object.fromEntries(options.map(o => [o, Infinity]));
  history.forEach((s, i) => { if (s.enfasis in lastUse && lastUse[s.enfasis] === Infinity) lastUse[s.enfasis] = i; });
  const best = Math.max(...Object.values(lastUse));
  const tied = options.filter(o => lastUse[o] === best);
  return tied[Math.floor(rng() * tied.length)];
}

// ───────── 1–2. reservar calentamiento y estiramiento ─────────
function reserve(totalSec, include, pct, min, max, paso, expres) {
  if (!include) return { sec: 0, n: 0 };
  if (expres) return { sec: paso, n: 1 };                 // activación breve
  const target = clamp(totalSec * pct / 100, min, Math.min(max, totalSec * 0.25));
  const n = Math.max(1, Math.round(target / paso));
  return { sec: n * paso, n };
}

// ───────── 3–4. formato y estructura que mejor llenan el tiempo ─────────
function blockDuration(f) {
  return f.rondas * f.porBloque * f.trabajo + f.rondas * (f.porBloque - 1) * f.descanso + (f.rondas - 1) * f.descansoRonda;
}
export function planDuration(f) { return f.bloques * blockDuration(f) + (f.bloques - 1) * f.descansoRonda; }

function searchStructure(workSec, fmt, maxBlocks, maxPerBlock) {
  const mid = ([a, b]) => (a + b) / 2;
  let best = null;
  for (let bloques = 1; bloques <= maxBlocks; bloques++)
  for (const porBloque of range(fmt.porBloque[0], Math.max(fmt.porBloque[0], Math.min(fmt.porBloque[1], maxPerBlock)), 1))
  for (const rondas of range(fmt.rondas[0], fmt.rondas[1], 1))
  for (const trabajo of range(fmt.trabajo[0], fmt.trabajo[1], 5))
  for (const descanso of range(fmt.descanso[0], fmt.descanso[1], 5)) {
    const f = { bloques, porBloque, rondas, trabajo, descanso, descansoRonda: fmt.descansoRonda };
    const d = planDuration(f);
    const fit = Math.abs(d - workSec) / workSec;
    const pref = Math.abs(trabajo - mid(fmt.trabajo)) / 60 + Math.abs(descanso - mid(fmt.descanso)) / 60
      + Math.abs(rondas - mid(fmt.rondas)) * 0.03 + Math.abs(porBloque - mid(fmt.porBloque)) * 0.02
      // Formato de circuito: pocos bloques que se repiten, en lugar de muchos ejercicios de una sola pasada
      + (bloques - 1) * 0.03 + (rondas === 1 && fmt.rondas[1] > 1 ? 0.15 : 0);
    const score = fit * 4 + pref * 0.5;
    if (!best || score < best.score) best = { ...f, score, duracion: d };
  }
  return best;
}

// ───────── 5. zonas → bloques ─────────
// Normaliza la selección: { zona: [subzonas] } + prioridades ["zona.sub"]
function normalizeTargets(req) {
  const zonas = req.zonas ?? FOCUSES[req.enfoque]?.zonas ?? FOCUSES.completo.zonas;
  const prio = new Set(req.prioridad ?? []);
  return Object.keys(ZONES)
    .filter(z => zonas[z]?.length)
    .map(z => ({ zona: z, subs: [...zonas[z]], prio: zonas[z].filter(s => prio.has(`${z}.${s}`)) }));
}

// Reparte los bloques entre zonas: con pocos bloques entran primero las zonas con prioridad y las
// trabajadas hace más tiempo; con bloques de sobra, las zonas con más subzonas o prioridades reciben más.
function allocateBlocks(units, n, history) {
  if (n <= units.length) {
    const ranked = [...units].sort((a, b) => (b.prio.length - a.prio.length) || (lastTrained(history, b.zona) - lastTrained(history, a.zona)));
    const chosen = new Set(ranked.slice(0, n).map(u => u.zona));
    return units.filter(u => chosen.has(u.zona)).map(u => ({ zona: u.zona, subs: orderSubs(u), prio: u.prio }));
  }
  const counts = new Map(units.map(u => [u.zona, 1]));
  const weight = u => u.subs.length + 2 * u.prio.length;
  for (let extra = n - units.length; extra > 0; extra--) {
    const u = [...units].sort((a, b) => weight(b) / counts.get(b.zona) - weight(a) / counts.get(a.zona))[0];
    counts.set(u.zona, counts.get(u.zona) + 1);
  }
  const blocks = [];
  for (const u of units) {
    const k = counts.get(u.zona), order = orderSubs(u);
    for (let i = 0; i < k; i++) {
      // Las subzonas se reparten entre los bloques de la zona; las prioritarias aparecen en todos
      const own = order.filter((s, j) => u.prio.includes(s) || j % k === i);
      blocks.push({ zona: u.zona, subs: own.length ? own : order, prio: u.prio });
    }
  }
  // Intercalar zonas para no repetir la misma zona en bloques seguidos
  const out = [], queues = units.map(u => blocks.filter(b => b.zona === u.zona));
  while (queues.some(q => q.length)) queues.forEach(q => q.length && out.push(q.shift()));
  return out;
}
const orderSubs = u => [...u.prio, ...u.subs.filter(s => !u.prio.includes(s))];

// ───────── 6. selección de ejercicios ─────────
function exerciseWeight(e, ctx) {
  let w = 1;
  const lvl = ctx.settings.nivel;
  if (e.nivel > lvl + 1) return 0;
  if (e.nivel === lvl + 1) w *= 0.25; else if (e.nivel < lvl) w *= 0.7;
  if (ctx.recent.has(e.id)) w *= 0.25;
  if (ctx.blockPatterns.has(e.patron)) w *= 0.35;          // ángulos y agarres distintos dentro del bloque
  const compuesto = !isIsolation(e);
  if (ctx.enfasis === "fuerza") w *= ((e.carga && compuesto) ? 1.8 : compuesto ? 1.2 : 0.6) * (e.unilateral ? 0.5 : 1);
  if (ctx.enfasis === "condicion" || ctx.enfasis === "expres") w *= (e.patron === "potencia" || !e.carga) ? 1.5 : 0.8;
  if (ctx.lugar === "gym" && e.equipo.some(q => q === "maquina" || q === "polea")) w *= 1.2;
  const g = gearOf(e);
  if (ctx.maxGear === Infinity) { if (g.some(q => !ctx.gear.has(q))) w *= 1.6; }   // equipo elegido: repartir entre todo lo elegido
  else if (g.length && g.every(q => ctx.gear.has(q))) w *= 1.6;                      // automático: reutilizar lo que ya está a la mano
  return w;
}

function pickForBlock(block, count, ctx, rng) {
  const chosen = []; ctx.blockPatterns = new Set();
  // Orden de subzonas por posición: las prioritarias cuentan doble
  const cycle = [...block.prio, ...block.subs];
  for (let i = 0; i < count; i++) {
    const sub = `${block.zona}.${cycle[i % cycle.length]}`;
    const fresh = e => !ctx.used.has(e.id) && !chosen.includes(e.id);
    const notInBlock = e => !chosen.includes(e.id);
    const blockSub = e => block.subs.some(s => e.sub === `${block.zona}.${s}`);
    const selected = e => ctx.selected.has(e.sub);
    const sameZone = e => e.sub?.startsWith(block.zona + ".");
    // Siempre dentro de lo escogido antes de salir de la selección; repetir es mejor que salirse
    const tiers = [
      ctx.pool.filter(e => e.sub === sub && fresh(e)),
      ctx.pool.filter(e => blockSub(e) && fresh(e)),
      ctx.pool.filter(e => selected(e) && fresh(e)),
      ctx.pool.filter(e => e.sub === sub && notInBlock(e)),       // repetir un ejercicio ya hecho (volver a la ronda)
      ctx.pool.filter(e => blockSub(e) && notInBlock(e)),
      ctx.pool.filter(e => selected(e) && notInBlock(e)),
      ctx.pool.filter(e => sameZone(e) && notInBlock(e)),         // último recurso
    ];
    // Límite de equipos por sesión: primero lo que cabe en el límite; solo si nada cabe, se excede
    const candidates = tiers.map(t => t.filter(e => fitsGear(e, ctx))).find(t => t.length) ?? tiers.find(t => t.length);
    if (!candidates) break;
    const pick = weightedPick(candidates, e => exerciseWeight(e, ctx), rng) ?? candidates[0];
    chosen.push(pick.id); ctx.used.add(pick.id); ctx.blockPatterns.add(pick.patron);
    gearOf(pick).forEach(q => ctx.gear.add(q));
  }
  return groupByGear(chosen);
}

// Equipo que hay que preparar para un ejercicio (el peso corporal no cuenta)
export const gearOf = e => e.equipo.filter(q => q !== "corporal");
function fitsGear(e, ctx) { return new Set([...ctx.gear, ...gearOf(e)]).size <= ctx.maxGear; }
// Ordena el bloque para que los ejercicios con el mismo equipo queden seguidos (menos cambios)
function groupByGear(ids) {
  const key = id => gearOf(EXERCISE_BY_ID[id]).sort().join("+");
  const order = [...new Set(ids.map(key))];
  return [...ids].sort((a, b) => order.indexOf(key(a)) - order.indexOf(key(b)));
}

// Calentamiento y estiramiento: primero los de los músculos trabajados, luego los de la zona del cuerpo,
// luego los generales; si hacen falta más, se repiten antes de usar ejercicios de otra zona.
function pickAuxiliary(tipo, zona, n, ctx, rng, musculos) {
  const list = EXERCISES.filter(e => e.tipo === tipo && !ctx.settings.desactivados.includes(e.id));
  const shuffle = arr => arr.map(v => [rng(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const byMuscle = shuffle(list.filter(e => musculos.includes(e.musculo) && (e.zona === zona || e.zona === "completo" || zona === "completo")));
  const byZone = shuffle(list.filter(e => e.zona === zona && !musculos.includes(e.musculo)));
  const general = shuffle(list.filter(e => e.zona === "completo" && !musculos.includes(e.musculo)));
  const rest = zona === "completo" ? shuffle(list) : [];
  const ordered = [...new Set([...byMuscle, ...byZone, ...general, ...rest])];
  const out = [];
  for (let k = 0; out.length < n && ordered.length; k++) out.push(ordered[k % ordered.length].id);
  return out;
}
function bodyZone(units) {
  const upper = units.some(u => ["pecho", "espalda", "hombros", "brazos"].includes(u.zona));
  const lower = units.some(u => u.zona === "piernas");
  return upper && lower ? "completo" : lower ? "inferior" : upper ? "superior" : "completo";
}

// ───────── generador ─────────
/**
 * @param {object} req  { minutos, lugar: "casa"|"gym", equipo?: string[], zonas: {zona: [subs]}, prioridad?: ["zona.sub"],
 *                        enfasis: "fuerza"|"masa"|"condicion"|"auto", calentamiento?: boolean, estiramiento?: boolean, seed?: number }
 *                      (también acepta `enfoque` antiguo: push, pull, piernas…)
 */
export function generateRoutine(req, settings, history = []) {
  const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = rngFrom(seed);
  const p = settings.params;
  const totalSec = Math.round(req.minutos * 60);
  const expres = req.minutos <= p.exprésHasta;
  const enfasis = expres ? "expres" : (req.enfasis && req.enfasis !== "auto" ? req.enfasis : pickEmphasis(settings, history, rng));
  const includeWarm = req.calentamiento ?? !expres;
  const includeCool = req.estiramiento ?? !expres;

  const warm = reserve(totalSec, includeWarm, p.calentamientoPct, p.calentamientoMin, p.calentamientoMax, p.pasoCalentamiento, expres);
  const cool = reserve(totalSec, includeCool, p.estiramientoPct, p.estiramientoMin, p.estiramientoMax, p.pasoEstiramiento, expres);
  const workSec = Math.max(60, totalSec - PREP_SEC - warm.sec - cool.sec);

  const equip = new Set(req.equipo ?? equipmentFor(req.lugar, settings, req.preset));
  const pool = EXERCISES.filter(e => e.tipo === "principal" && e.sub && usable(e, equip, settings));

  let units = normalizeTargets(req).filter(u => pool.some(e => e.sub?.startsWith(u.zona + ".")));
  if (!units.length) units = [{ zona: "abdomen", subs: Object.keys(ZONES.abdomen.subs), prio: [] }];
  if (expres) {     // exprés: una sola zona (la que tenga prioridad, o una al azar)
    const withPrio = units.filter(u => u.prio.length);
    const pickFrom = withPrio.length ? withPrio : units;
    units = [pickFrom[Math.floor(rng() * pickFrom.length)]];
  }

  const ctx = { settings, pool, used: new Set(), recent: recentIds(history), enfasis, lugar: req.lugar, blockPatterns: new Set(),
    selected: new Set(units.flatMap(u => u.subs.map(s => `${u.zona}.${s}`))), gear: new Set(), maxGear: req.maxEquipos ?? p.maxEquipos ?? 3 };
  if (enfasis === "fuerza") return strengthPlan({ req, settings, history, rng, seed, units, equip, pool, ctx, warm, cool, workSec, totalSec, zona: bodyZone(units) });

  const fmt = p.formatos[enfasis];
  const zonePool = pool.filter(e => units.some(u => e.sub.startsWith(u.zona + "."))).length;
  const maxPerBlock = expres ? Math.min(fmt.porBloque[1], zonePool) : fmt.porBloque[1];
  const f = searchStructure(workSec, fmt, expres ? 1 : 10, maxPerBlock);

  const bloques = [];
  for (const b of allocateBlocks(units, f.bloques, history)) {
    const ejercicios = pickForBlock(b, f.porBloque, ctx, rng);
    if (ejercicios.length) bloques.push({ zona: b.zona, subs: b.subs, rondas: f.rondas, ejercicios,
      trabaja: [...new Set(ejercicios.map(id => EXERCISE_BY_ID[id].sub))] });
  }

  const musculos = [...new Set(bloques.flatMap(b => b.ejercicios.map(id => EXERCISE_BY_ID[id].musculo)))];
  const zona = bodyZone(units);
  const { sinEjercicios, sinTiempo } = expres ? { sinEjercicios: [], sinTiempo: [] } : missingZones(req, bloques, pool);   // exprés usa una sola zona a propósito
  const plan = {
    id: `r-${Date.now().toString(36)}-${seed.toString(36)}`,
    seed, creada: new Date().toISOString(),
    minutos: req.minutos, lugar: req.lugar, preset: req.lugar === "casa" ? (req.preset ?? settings.presetActivo) : null,
    equipo: [...equip], equipoElegido: req.maxEquipos === Infinity, enfasis, expres,
    zonas: Object.fromEntries(units.map(u => [u.zona, u.subs])),
    prioridad: units.flatMap(u => u.prio.map(s => `${u.zona}.${s}`)),
    formato: { trabajo: f.trabajo, descanso: f.descanso, descansoRonda: f.descansoRonda },
    calentamiento: pickAuxiliary("calentamiento", zona, warm.n, ctx, rng, musculos),
    estiramiento: pickAuxiliary("estiramiento", zona, cool.n, ctx, rng, musculos),
    bloques, sinEjercicios, sinTiempo,
  };

  // 7. Ajuste final al tiempo total, con transiciones y unilaterales (doble tiempo) ya incluidos.
  //    Búsqueda voraz: ajustar segundos de trabajo y, si no basta, rondas de algún bloque.
  const margin = totalSec * p.margenTiempo / 100;
  const lo = fmt.trabajo[0] - 10, hi = fmt.trabajo[1] + 10;
  const maxRounds = fmt.rondas[1] + 1;
  const measure = () => sumSteps(buildSteps(plan, settings));
  let dur = measure();
  for (let guard = 0; guard < 40 && Math.abs(dur - totalSec) > margin; guard++) {
    const moves = [];
    for (const d of [-5, 5]) {
      const t = plan.formato.trabajo + d;
      if (t >= lo && t <= hi) moves.push({ cost: 0, apply: () => { plan.formato.trabajo += d; }, undo: () => { plan.formato.trabajo -= d; } });
    }
    for (const b of plan.bloques) for (const d of [-1, 1]) {
      const r = b.rondas + d;
      if (r >= 1 && r <= maxRounds) moves.push({ cost: 20, apply: () => { b.rondas += d; }, undo: () => { b.rondas -= d; } });
    }
    // Si sobra tiempo por los unilaterales (doble duración), cambiar uno por un bilateral de la misma subzona
    if (dur > totalSec) for (const b of plan.bloques) b.ejercicios.forEach((id, j) => {
      const e = EXERCISE_BY_ID[id]; if (!e.unilateral) return;
      const inPlan = new Set(plan.bloques.flatMap(x => x.ejercicios));
      const gear = new Set(plan.bloques.flatMap(x => x.ejercicios).flatMap(i => gearOf(EXERCISE_BY_ID[i])));
      const alt = pool.find(x => x.sub === e.sub && !x.unilateral && !inPlan.has(x.id) && x.nivel <= settings.nivel + 1 && gearOf(x).every(q => gear.has(q)));
      if (alt) moves.push({ cost: 10, apply: () => { b.ejercicios[j] = alt.id; }, undo: () => { b.ejercicios[j] = id; } });
    });
    let best = null;
    for (const m of moves) {
      m.apply(); const err = Math.abs(measure() - totalSec) + m.cost; m.undo();
      if (!best || err < best.err) best = { m, err };
    }
    if (!best || best.err - best.m.cost >= Math.abs(dur - totalSec)) break;   // ningún movimiento mejora
    best.m.apply(); dur = measure();
  }
  plan.bloques.forEach(b => { b.trabaja = [...new Set(b.ejercicios.map(id => EXERCISE_BY_ID[id].sub))]; });
  const steps = buildSteps(plan, settings);
  plan.steps = steps;
  plan.totalSec = dur;
  return plan;
}


// Zonas escogidas que no quedaron en la rutina, separadas por motivo:
// sin ejercicios con el equipo disponible, o sin espacio en el tiempo escogido.
function missingZones(req, bloques, pool) {
  const targets = normalizeTargets(req);
  const asked = [...new Set(targets.map(u => u.zona))];
  const got = new Set(bloques.flatMap(b => b.ejercicios.map(id => EXERCISE_BY_ID[id].sub.split(".")[0])));
  const missing = asked.filter(z => !got.has(z));
  const subsOf = z => targets.filter(u => u.zona === z).flatMap(u => u.subs.map(s => `${z}.${s}`));
  const hasEx = z => pool.some(e => subsOf(z).includes(e.sub));
  return { sinEjercicios: missing.filter(z => !hasEx(z)), sinTiempo: missing.filter(hasEx) };
}

// ───────── Fuerza: series por repeticiones ─────────
// Cada bloque es un ejercicio con sus series. Los principales (compuestos) van primero, con descanso largo
// y series de aproximación si llevan carga; los accesorios, con descanso más corto.
function strengthPlan({ req, settings, history, rng, seed, units, equip, pool, ctx, warm, cool, workSec, totalSec, zona }) {
  const p = settings.params, F = p.fuerza;
  const tiempos = req.tiempoSerie ?? {};
  const serieSec = tiempos.global ?? F.serieEstimada;          // la duración real de tus series, si ya hay historial
  const aproxSec = Math.round(serieSec * 0.6);
  const estimate = (n, sets) => {
    let t = (n - 1) * F.cambioEjercicio;
    for (let k = 0; k < n; k++) {
      const main = k < F.principales;
      if (main && F.aproximacion) t += F.aproximaciones.length * (aproxSec + F.descansoAproximacion);
      t += sets * serieSec + (sets - 1) * (main ? F.descansoPrincipal : F.descansoAccesorio);
    }
    return t;
  };
  let best = null;
  for (let n = 1; n <= 8; n++) for (let sets = F.series[0]; sets <= F.series[1]; sets++) {
    const err = Math.abs(estimate(n, sets) - workSec) / workSec + Math.abs(sets - (F.series[0] + F.series[1]) / 2) * 0.02
      + Math.max(0, 3 - n) * 0.06;   // con tiempo suficiente: dos principales y al menos un accesorio
    if (!best || err < best.err) best = { n, sets, err };
  }

  const chosen = [];
  for (const b of allocateBlocks(units, best.n, history)) {
    const [id] = pickForBlock(b, 1, ctx, rng);
    if (id) chosen.push({ zona: b.zona, subs: b.subs, id });
  }
  const rank = id => { const e = EXERCISE_BY_ID[id]; return e.medida === "tiempo" ? 3 : !isIsolation(e) && e.carga ? 0 : !isIsolation(e) ? 1 : 2; };
  chosen.sort((a, b) => rank(a.id) - rank(b.id));
  let mains = 0;
  const bloques = chosen.map(c => {
    const e = EXERCISE_BY_ID[c.id];
    const main = mains < F.principales && rank(c.id) <= 1 && ++mains > 0;
    return { zona: c.zona, subs: c.subs, ejercicios: [c.id], trabaja: [e.sub], rondas: best.sets,
      principal: main, reps: main ? [...F.repsPrincipal] : [...F.repsAccesorio],
      descansoSerie: main ? F.descansoPrincipal : F.descansoAccesorio,
      aproximacion: main && F.aproximacion && e.carga };
  });

  const musculos = [...new Set(bloques.map(b => EXERCISE_BY_ID[b.ejercicios[0]].musculo))];
  const plan = {
    id: `r-${Date.now().toString(36)}-${seed.toString(36)}`, seed, creada: new Date().toISOString(),
    minutos: req.minutos, lugar: req.lugar, preset: req.lugar === "casa" ? (req.preset ?? settings.presetActivo) : null,
    equipo: [...equip], equipoElegido: req.maxEquipos === Infinity, enfasis: "fuerza", expres: false, modo: "series",
    zonas: Object.fromEntries(units.map(u => [u.zona, u.subs])),
    prioridad: units.flatMap(u => u.prio.map(s => `${u.zona}.${s}`)),
    formato: { serie: serieSec, descansoPrincipal: F.descansoPrincipal, descansoAccesorio: F.descansoAccesorio },
    tiempoSerie: tiempos,
    calentamiento: pickAuxiliary("calentamiento", zona, warm.n, ctx, rng, musculos),
    estiramiento: pickAuxiliary("estiramiento", zona, cool.n, ctx, rng, musculos),
    bloques, ...missingZones(req, bloques, pool),
  };

  // Ajuste al tiempo: series por ejercicio y segundos de descanso
  const margin = totalSec * p.margenTiempo / 100;
  const measure = () => sumSteps(buildSteps(plan, settings));
  let dur = measure();
  for (let guard = 0; guard < 40 && Math.abs(dur - totalSec) > margin; guard++) {
    const moves = [];
    for (const b of plan.bloques) {
      const [lo, hi] = b.principal ? [90, 240] : [45, 150];
      for (const d of [-15, 15]) if (b.descansoSerie + d >= lo && b.descansoSerie + d <= hi)
        moves.push({ cost: 5, apply: () => { b.descansoSerie += d; }, undo: () => { b.descansoSerie -= d; } });
      for (const d of [-1, 1]) if (b.rondas + d >= 2 && b.rondas + d <= F.series[1] + 1)
        moves.push({ cost: 15, apply: () => { b.rondas += d; }, undo: () => { b.rondas -= d; } });
    }
    // Sesiones muy cortas: la aproximación se reduce a una serie
    if (dur > totalSec) for (const b of plan.bloques) if (b.aproximacion && !b.aproxCorta)
      moves.push({ cost: 25, apply: () => { b.aproxCorta = true; }, undo: () => { delete b.aproxCorta; } });
    let bestMove = null;
    for (const m of moves) {
      m.apply(); const err = Math.abs(measure() - totalSec) + m.cost; m.undo();
      if (!bestMove || err < bestMove.err) bestMove = { m, err };
    }
    if (!bestMove || bestMove.err - bestMove.m.cost >= Math.abs(dur - totalSec)) break;
    bestMove.m.apply(); dur = measure();
  }
  plan.steps = buildSteps(plan, settings);
  plan.totalSec = dur;
  return plan;
}

function buildSeriesSteps(plan, settings, push) {
  const F = settings.params.fuerza;
  const t = plan.tiempoSerie ?? {};
  const serieOf = id => t[id] ?? t.global ?? F.serieEstimada;
  const aproxSec = Math.round((t.global ?? F.serieEstimada) * 0.6);
  plan.bloques.forEach((bl, b) => {
    const id = bl.ejercicios[0], e = EXERCISE_BY_ID[id];
    const fase = `Ejercicio ${b + 1} de ${plan.bloques.length}`;
    const aprox = bl.aproxCorta ? F.aproximaciones.slice(-1) : F.aproximaciones;
    if (bl.aproximacion) aprox.forEach(([pct, reps], k) => {
      push({ tipo: "aproximacion", ejercicio: id, abierto: true, duracion: aproxSec, pct, objetivo: [reps, reps],
        fase, paso: k + 1, pasos: aprox.length, bloque: b });
      push({ tipo: "descanso", duracion: F.descansoAproximacion, siguiente: id, bloque: b });
    });
    for (let r = 0; r < bl.rondas; r++) {
      const timed = e.medida === "tiempo";
      push({ tipo: "trabajo", ejercicio: id, abierto: !timed, objetivo: timed ? null : bl.reps,
        duracion: timed ? F.isometrico * (e.unilateral ? 2 : 1) : serieOf(id) * (e.unilateral && !t[id] ? 2 : 1),
        cambioLado: e.unilateral && timed, bloque: b, ronda: r, rondas: bl.rondas, slot: 0, fase, serie: true });
      const last = r === bl.rondas - 1, end = last && b === plan.bloques.length - 1;
      if (end) break;
      const next = last ? plan.bloques[b + 1].ejercicios[0] : id;
      push({ tipo: last ? "cambio-bloque" : "descanso", duracion: last ? F.cambioEjercicio : bl.descansoSerie, siguiente: next, bloque: b, ronda: r });
    }
  });
}

// ───────── línea de tiempo ─────────
export const sumSteps = steps => steps.reduce((t, s) => t + s.duracion, 0);
const sameEquipment = (a, b) => a.equipo.join() === b.equipo.join();

// Título del bloque según lo que realmente trabaja: "Pecho", "Hombros · Lateral", "Espalda + Brazos"
export function blockTitle(bl) {
  if (!ZONES[bl.zona]) return bl.grupo ?? "";
  const subs = bl.trabaja ?? (bl.subs ?? []).map(s => `${bl.zona}.${s}`);
  const zones = [...new Set(subs.map(k => k.split(".")[0]))];
  if (zones.length > 1) return zones.map(z => ZONES[z].nombre).join(" + ");
  const z = zones[0] ?? bl.zona, all = Object.keys(ZONES[z].subs);
  const own = subs.map(k => k.split(".")[1]);
  return own.length < all.length ? `${ZONES[z].nombre} · ${own.map(s => ZONES[z].subs[s]).join(", ")}` : ZONES[z].nombre;
}

export function buildSteps(plan, settings) {
  const p = settings.params;
  const { trabajo, descanso, descansoRonda } = plan.formato;
  const steps = [];
  const push = s => steps.push({ i: steps.length, ...s });

  push({ tipo: "preparacion", duracion: PREP_SEC, titulo: "Prepárate", siguiente: plan.calentamiento[0] ?? plan.bloques[0]?.ejercicios[0] });

  plan.calentamiento.forEach((id, k) => push({ tipo: "calentamiento", ejercicio: id, duracion: p.pasoCalentamiento,
    fase: "Calentamiento", paso: k + 1, pasos: plan.calentamiento.length, cambioLado: EXERCISE_BY_ID[id]?.unilateral }));

  if (plan.modo === "series") buildSeriesSteps(plan, settings, push);
  else plan.bloques.forEach((bl, b) => {
    for (let r = 0; r < bl.rondas; r++) {
      bl.ejercicios.forEach((id, j) => {
        const e = EXERCISE_BY_ID[id];
        push({ tipo: "trabajo", ejercicio: id, duracion: e.unilateral ? trabajo * 2 : trabajo, bloque: b, ronda: r, slot: j,
          fase: `Bloque ${b + 1} · ${blockTitle(bl)}`, rondas: bl.rondas, cambioLado: e.unilateral });
        const lastInRound = j === bl.ejercicios.length - 1;
        const nextId = !lastInRound ? bl.ejercicios[j + 1]
          : r < bl.rondas - 1 ? bl.ejercicios[0]
          : plan.bloques[b + 1]?.ejercicios[0] ?? plan.estiramiento[0] ?? null;
        const isEnd = lastInRound && r === bl.rondas - 1 && b === plan.bloques.length - 1;
        if (isEnd) return;
        const base = !lastInRound ? descanso : descansoRonda;
        const next = nextId ? EXERCISE_BY_ID[nextId] : null;
        const needsTransition = next && next.tipo === "principal" && !sameEquipment(e, next) ? next.transicion : 0;
        const dur = Math.max(base, needsTransition);
        if (dur <= 0) return;
        const tipo = !lastInRound ? (needsTransition > base ? "transicion" : "descanso")
          : r < bl.rondas - 1 ? "descanso-ronda" : "cambio-bloque";
        push({ tipo, duracion: dur, siguiente: nextId, bloque: b, ronda: r });
      });
    }
  });

  plan.estiramiento.forEach((id, k) => push({ tipo: "estiramiento", ejercicio: id, duracion: p.pasoEstiramiento,
    fase: "Estiramiento", paso: k + 1, pasos: plan.estiramiento.length, cambioLado: EXERCISE_BY_ID[id]?.unilateral }));

  for (let k = 0; k < steps.length; k++) {
    if (steps[k].siguiente === undefined) {
      const nxt = steps.slice(k + 1).find(s => s.ejercicio);
      steps[k].siguiente = nxt?.ejercicio ?? null;
    }
  }
  return steps;
}

// Cambiar un ejercicio por otro de la misma subzona (o zona): máquina ocupada, falta de equipo
export function swapExercise(plan, oldId, settings) {
  const block = plan.bloques.find(b => b.ejercicios.includes(oldId));
  if (!block) return null;
  const equip = new Set(plan.equipo ?? equipmentFor(plan.lugar, settings, plan.preset));
  const inPlan = new Set(plan.bloques.flatMap(b => b.ejercicios));
  const old = EXERCISE_BY_ID[oldId];
  const base = EXERCISES.filter(e => e.tipo === "principal" && !inPlan.has(e.id) && usable(e, equip, settings) && e.nivel <= settings.nivel + 1);
  const candidates = [base.filter(e => e.sub === old.sub), base.filter(e => e.sub?.startsWith(block.zona + "."))].find(t => t.length);
  if (!candidates) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  block.ejercicios = block.ejercicios.map(id => id === oldId ? pick.id : id);
  plan.steps.forEach(s => { if (s.ejercicio === oldId) s.ejercicio = pick.id; if (s.siguiente === oldId) s.siguiente = pick.id; });
  return pick.id;
}
