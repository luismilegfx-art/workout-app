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
  if (ctx.enfasis === "fuerza") w *= (e.carga && compuesto) ? 1.8 : compuesto ? 1.2 : 0.6;
  if (ctx.enfasis === "condicion" || ctx.enfasis === "expres") w *= (e.patron === "potencia" || !e.carga) ? 1.5 : 0.8;
  if (ctx.lugar === "gym" && e.equipo.some(q => q === "maquina" || q === "polea")) w *= 1.2;
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
    const candidates = tiers.find(t => t.length);
    if (!candidates) break;
    const pick = weightedPick(candidates, e => exerciseWeight(e, ctx), rng) ?? candidates[0];
    chosen.push(pick.id); ctx.used.add(pick.id); ctx.blockPatterns.add(pick.patron);
  }
  return chosen;
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

  const fmt = p.formatos[enfasis];
  const zonePool = pool.filter(e => units.some(u => e.sub.startsWith(u.zona + "."))).length;
  const maxPerBlock = expres ? Math.min(fmt.porBloque[1], zonePool) : fmt.porBloque[1];
  const f = searchStructure(workSec, fmt, expres ? 1 : 10, maxPerBlock);

  const ctx = { settings, pool, used: new Set(), recent: recentIds(history), enfasis, lugar: req.lugar, blockPatterns: new Set(),
    selected: new Set(units.flatMap(u => u.subs.map(s => `${u.zona}.${s}`))) };
  const bloques = [];
  for (const b of allocateBlocks(units, f.bloques, history)) {
    const ejercicios = pickForBlock(b, f.porBloque, ctx, rng);
    if (ejercicios.length) bloques.push({ zona: b.zona, subs: b.subs, rondas: f.rondas, ejercicios,
      trabaja: [...new Set(ejercicios.map(id => EXERCISE_BY_ID[id].sub))] });
  }

  const musculos = [...new Set(bloques.flatMap(b => b.ejercicios.map(id => EXERCISE_BY_ID[id].musculo)))];
  const zona = bodyZone(units);
  const plan = {
    id: `r-${Date.now().toString(36)}-${seed.toString(36)}`,
    seed, creada: new Date().toISOString(),
    minutos: req.minutos, lugar: req.lugar, preset: req.lugar === "casa" ? (req.preset ?? settings.presetActivo) : null,
    equipo: [...equip], enfasis, expres,
    zonas: Object.fromEntries(units.map(u => [u.zona, u.subs])),
    prioridad: units.flatMap(u => u.prio.map(s => `${u.zona}.${s}`)),
    formato: { trabajo: f.trabajo, descanso: f.descanso, descansoRonda: f.descansoRonda },
    calentamiento: pickAuxiliary("calentamiento", zona, warm.n, ctx, rng, musculos),
    estiramiento: pickAuxiliary("estiramiento", zona, cool.n, ctx, rng, musculos),
    bloques,
  };

  // 7. Ajuste final al tiempo total, con las transiciones reales incluidas
  const margin = totalSec * p.margenTiempo / 100;
  let steps = buildSteps(plan, settings), dur = sumSteps(steps);
  const lo = fmt.trabajo[0] - 10, hi = fmt.trabajo[1] + 10;
  for (let guard = 0; guard < 20 && Math.abs(dur - totalSec) > margin; guard++) {
    const next = plan.formato.trabajo + (dur > totalSec ? -5 : 5);
    if (next < lo || next > hi) break;
    plan.formato.trabajo = next; steps = buildSteps(plan, settings); dur = sumSteps(steps);
  }
  plan.steps = steps;
  plan.totalSec = dur;
  return plan;
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

  plan.bloques.forEach((bl, b) => {
    for (let r = 0; r < bl.rondas; r++) {
      bl.ejercicios.forEach((id, j) => {
        const e = EXERCISE_BY_ID[id];
        push({ tipo: "trabajo", ejercicio: id, duracion: trabajo, bloque: b, ronda: r, slot: j,
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
