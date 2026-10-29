// Generador de rutinas y distribución del tiempo.
// Implementa el algoritmo de la especificación técnica. Es una función pura: misma entrada + misma semilla = misma rutina.
import { EXERCISES, EXERCISE_BY_ID } from "../data/exercises.js";
import { FOCUSES, GYM_EQUIPMENT, MUSCLES } from "../data/catalog.js";

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
const roundTo = (v, step) => Math.round(v / step) * step;

function weightedPick(items, weightOf, rng) {
  const ws = items.map(weightOf); const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function availableEquipment(lugar, settings) {
  return new Set(lugar === "gym" ? GYM_EQUIPMENT : settings.equipoCasa);
}
function usable(e, equip, settings) {
  return e.equipo.every(q => equip.has(q)) && !settings.desactivados.includes(e.id) && !settings.evitar.includes(e.id);
}
function recentIds(history) {
  const ids = new Set();
  history.slice(0, RECENT_SESSIONS).forEach(s => (s.ejercicios ?? []).forEach(e => ids.add(e.id)));
  return ids;
}

// Énfasis automático: el objetivo usado hace más tiempo
export function pickEmphasis(settings, history, rng) {
  const options = settings.objetivos.length ? settings.objetivos : ["masa"];
  const lastUse = Object.fromEntries(options.map(o => [o, Infinity]));
  history.forEach((s, i) => { if (s.enfasis in lastUse && lastUse[s.enfasis] === Infinity) lastUse[s.enfasis] = i; });
  // Mayor índice = usado hace más tiempo; Infinity = nunca usado
  const best = Math.max(...Object.values(lastUse));
  const tied = options.filter(o => lastUse[o] === best);
  return tied[Math.floor(rng() * tied.length)];
}

// ───────── 1–2. reservar calentamiento y estiramiento ─────────
function reserve(totalSec, include, pct, min, max, paso, expres) {
  if (!include) return { sec: 0, n: 0 };
  if (expres) return { sec: paso * 1, n: 1 };            // activación breve
  const target = clamp(totalSec * pct / 100, min, Math.min(max, totalSec * 0.25));
  const n = Math.max(1, Math.round(target / paso));
  return { sec: n * paso, n };
}

// ───────── 3–4. escoger formato y estructura que mejor llenan el tiempo ─────────
function blockDuration(f) {
  return f.rondas * f.porBloque * f.trabajo + f.rondas * (f.porBloque - 1) * f.descanso + (f.rondas - 1) * f.descansoRonda;
}
export function planDuration(f) {
  return f.bloques * blockDuration(f) + (f.bloques - 1) * f.descansoRonda;
}
function searchStructure(workSec, fmt, maxBlocks, maxPerBlock) {
  const mid = ([a, b]) => (a + b) / 2;
  let best = null;
  const trabajos = range(fmt.trabajo[0], fmt.trabajo[1], 5);
  const descansos = range(fmt.descanso[0], fmt.descanso[1], 5);
  for (let bloques = 1; bloques <= maxBlocks; bloques++)
  for (const porBloque of range(fmt.porBloque[0], Math.min(fmt.porBloque[1], maxPerBlock), 1))
  for (const rondas of range(fmt.rondas[0], fmt.rondas[1], 1))
  for (const trabajo of trabajos)
  for (const descanso of descansos) {
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

// ───────── 5. selección de ejercicios ─────────
function exerciseWeight(e, ctx) {
  let w = 1;
  const lvl = ctx.settings.nivel;
  if (e.nivel > lvl + 1) return 0;
  if (e.nivel === lvl + 1) w *= 0.25; else if (e.nivel < lvl) w *= 0.7;
  if (ctx.recent.has(e.id)) w *= 0.25;
  if (ctx.blockPatterns.has(e.patron)) w *= 0.4;
  const compuesto = e.patron !== "aislamiento";
  if (ctx.enfasis === "fuerza") w *= (e.carga && compuesto) ? 1.8 : compuesto ? 1.2 : 0.6;
  if (ctx.enfasis === "condicion" || ctx.enfasis === "expres") w *= (e.patron === "potencia" || !e.carga) ? 1.5 : 0.8;
  if (ctx.lugar === "gym" && e.equipo.some(q => q === "maquina" || q === "polea")) w *= 1.2;
  return w;
}

function poolFor(group, ctx) {
  const base = ctx.pool.filter(e => !ctx.used.has(e.id));
  const primary = base.filter(e => e.musculo === group);
  const secondary = base.filter(e => e.musculo !== group && e.secundarios.includes(group));
  return { primary, secondary };
}

function pickForBlock(group, count, ctx, rng) {
  const chosen = []; ctx.blockPatterns = new Set();
  for (let i = 0; i < count; i++) {
    const { primary, secondary } = poolFor(group, ctx);
    let candidates = primary.length ? primary : secondary;
    if (!candidates.length) {
      // Sin ejercicios nuevos del grupo: se repiten los ya usados (como volver a una ronda anterior)
      candidates = ctx.pool.filter(e => !chosen.includes(e.id) && (e.musculo === group || e.secundarios.includes(group)));
    }
    if (!candidates.length) {
      candidates = ctx.pool.filter(e => !chosen.includes(e.id) && ctx.focusGroups.includes(e.musculo));
    }
    if (!candidates.length) break;
    const pick = weightedPick(candidates, e => exerciseWeight(e, ctx), rng) ?? candidates[0];
    chosen.push(pick.id); ctx.used.add(pick.id); ctx.blockPatterns.add(pick.patron);
  }
  return chosen;
}

// Calentamiento y estiramiento: primero los de la zona trabajada, luego los generales;
// si hacen falta más, se repiten los de la zona antes de usar ejercicios de otra zona.
function pickAuxiliary(tipo, zona, n, ctx, rng, grupos = []) {
  const list = EXERCISES.filter(e => e.tipo === tipo && !ctx.settings.desactivados.includes(e.id));
  const shuffle = arr => arr.map(v => [rng(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const byGroup = shuffle(list.filter(e => grupos.includes(e.musculo)));
  const byZone = shuffle(list.filter(e => e.zona === zona && !grupos.includes(e.musculo)));
  const general = shuffle(list.filter(e => e.zona === "completo" && e.zona !== zona && !grupos.includes(e.musculo)));
  const ordered = [...new Set([...byGroup, ...byZone, ...general])];
  const out = [];
  for (let k = 0; out.length < n && ordered.length; k++) out.push(ordered[k % ordered.length].id);
  return out;
}

// Si hay menos bloques que grupos, entran primero los grupos trabajados hace más tiempo
function chooseGroups(groups, count, history) {
  if (count >= groups.length) return groups;
  const last = g => { const i = history.findIndex(s => (s.grupos ?? []).includes(g)); return i === -1 ? Infinity : i; };
  const chosen = [...groups].sort((a, b) => last(b) - last(a)).slice(0, count);
  return groups.filter(g => chosen.includes(g));       // conserva el orden natural del enfoque
}

// ───────── generador ─────────
/**
 * @param {object} req  { minutos, enfoque, lugar: "casa"|"gym", enfasis: "auto"|"fuerza"|"masa"|"condicion",
 *                        calentamiento?: boolean, estiramiento?: boolean, seed?: number }
 */
export function generateRoutine(req, settings, history = []) {
  const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = rngFrom(seed);
  const p = settings.params;
  const totalSec = Math.round(req.minutos * 60);
  const expres = req.minutos <= p.exprésHasta;
  const focus = FOCUSES[req.enfoque] ?? FOCUSES.completo;
  const enfasis = expres ? "expres" : (req.enfasis && req.enfasis !== "auto" ? req.enfasis : pickEmphasis(settings, history, rng));
  const includeWarm = req.calentamiento ?? !expres;
  const includeCool = req.estiramiento ?? !expres;

  const warm = reserve(totalSec, includeWarm, p.calentamientoPct, p.calentamientoMin, p.calentamientoMax, p.pasoCalentamiento, expres);
  const cool = reserve(totalSec, includeCool, p.estiramientoPct, p.estiramientoMin, p.estiramientoMax, p.pasoEstiramiento, expres);
  const workSec = Math.max(60, totalSec - PREP_SEC - warm.sec - cool.sec);

  const equip = availableEquipment(req.lugar, settings);
  const pool = EXERCISES.filter(e => e.tipo === "principal" && usable(e, equip, settings));

  // Grupos de los bloques. Exprés: un solo grupo (el del enfoque, o uno de ellos)
  let groups = focus.grupos.filter(g => pool.some(e => e.musculo === g || e.secundarios.includes(g)));
  if (!groups.length) groups = ["core"];
  if (expres) groups = [groups[Math.floor(rng() * groups.length)]];

  const fmt = p.formatos[enfasis];
  const poolInFocus = pool.filter(e => groups.includes(e.musculo)).length || pool.length;
  const maxPerBlock = expres ? Math.min(fmt.porBloque[1], poolInFocus) : fmt.porBloque[1];
  const maxBlocks = expres ? 1 : 10;
  let f = searchStructure(workSec, fmt, maxBlocks, Math.max(fmt.porBloque[0], maxPerBlock));

  const ctx = { settings, pool, used: new Set(), recent: recentIds(history), enfasis, lugar: req.lugar,
    focusGroups: focus.grupos, blockPatterns: new Set() };

  const blockGroups = chooseGroups(groups, f.bloques, history);
  const bloques = [];
  for (let b = 0; b < f.bloques; b++) {
    const grupo = blockGroups[b % blockGroups.length];
    const ejercicios = pickForBlock(grupo, f.porBloque, ctx, rng);
    if (ejercicios.length) bloques.push({ grupo, rondas: f.rondas, ejercicios });
  }

  const plan = {
    id: `r-${Date.now().toString(36)}-${seed.toString(36)}`,
    seed, creada: new Date().toISOString(),
    minutos: req.minutos, enfoque: req.enfoque, lugar: req.lugar, enfasis, expres,
    formato: { trabajo: f.trabajo, descanso: f.descanso, descansoRonda: f.descansoRonda },
    calentamiento: pickAuxiliary("calentamiento", focus.zona, warm.n, ctx, rng, blockGroups),
    estiramiento: pickAuxiliary("estiramiento", focus.zona, cool.n, ctx, rng, blockGroups),
    bloques,
    grupos: [...new Set(bloques.map(b => b.grupo))],
  };

  // 6–7. Ajuste final al tiempo total, con las transiciones reales incluidas
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
const sumSteps = steps => steps.reduce((t, s) => t + s.duracion, 0);
const sameEquipment = (a, b) => a.equipo.join() === b.equipo.join();

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
          fase: `Bloque ${b + 1} · ${MUSCLES[bl.grupo] ?? bl.grupo}`, rondas: bl.rondas, cambioLado: e.unilateral });
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

  // Siguiente ejercicio para cada paso (lo que la voz anuncia y la pantalla muestra)
  for (let k = 0; k < steps.length; k++) {
    if (steps[k].siguiente === undefined) {
      const nxt = steps.slice(k + 1).find(s => s.ejercicio);
      steps[k].siguiente = nxt?.ejercicio ?? null;
    }
  }
  return steps;
}

// Cambiar un ejercicio por otro del mismo grupo (máquina ocupada, falta de equipo)
export function swapExercise(plan, oldId, settings) {
  const block = plan.bloques.find(b => b.ejercicios.includes(oldId));
  if (!block) return null;
  const equip = availableEquipment(plan.lugar, settings);
  const inPlan = new Set(plan.bloques.flatMap(b => b.ejercicios));
  const old = EXERCISE_BY_ID[oldId];
  const candidates = EXERCISES.filter(e => e.tipo === "principal" && !inPlan.has(e.id) && usable(e, equip, settings)
    && (e.musculo === block.grupo || e.musculo === old.musculo) && e.nivel <= settings.nivel + 1);
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  block.ejercicios = block.ejercicios.map(id => id === oldId ? pick.id : id);
  plan.steps.forEach(s => { if (s.ejercicio === oldId) s.ejercicio = pick.id; if (s.siguiente === oldId) s.siguiente = pick.id; });
  return pick.id;
}
