// Qué toca hoy: zona y énfasis recomendados a partir del historial.
// Reglas (especificación técnica, Recuperación): cada subzona guarda cuándo se trabajó por última vez y no se vuelve
// a cargar antes de params.recuperacionHoras; entre las opciones descansadas gana la que lleva más tiempo sin trabajarse.
// El énfasis rota entre los objetivos del perfil, empezando por el usado hace más tiempo. Función pura: tests/recommend.test.js.
import { PRESETS, ZONES } from "../data/catalog.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";

const HOUR = 3_600_000;
const NEVER = 24 * 7;    // una subzona nunca trabajada cuenta como una semana de descanso

// Subzonas que trabajó una sesión: las escogidas, o las de sus ejercicios en registros antiguos
function sessionSubs(s) {
  if (s.zonas) return Object.entries(s.zonas).flatMap(([z, subs]) => (subs ?? []).map(sub => `${z}.${sub}`));
  return (s.ejercicios ?? []).map(e => EXERCISE_BY_ID[e.id]?.sub).filter(Boolean);
}

/** Horas desde la última vez que se trabajó cada subzona ("zona.sub"); null si nunca. */
export function subzoneRecovery(history, now = Date.now()) {
  const out = {};
  for (const [z, def] of Object.entries(ZONES)) for (const sub of Object.keys(def.subs)) out[`${z}.${sub}`] = null;
  for (const s of history) {
    const t = Date.parse(s.fecha); if (!Number.isFinite(t)) continue;
    for (const k of sessionSubs(s)) {
      const h = (now - t) / HOUR;
      if (k in out && (out[k] == null || h < out[k])) out[k] = h;
    }
  }
  return out;
}

const subsOf = sel => Object.entries(sel).flatMap(([z, subs]) => subs.map(s => `${z}.${s}`));
const fmtAgo = h => h == null ? "sin trabajar todavía" : h < 36 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} días`;

function emphasisFor(settings, history) {
  const options = settings.objetivos?.length ? settings.objetivos : ["masa"];
  const last = Object.fromEntries(options.map(o => [o, Infinity]));
  history.forEach((s, i) => { if (s.enfasis in last && last[s.enfasis] === Infinity) last[s.enfasis] = i; });
  return [...options].sort((a, b) => last[b] - last[a])[0];
}

/**
 * @returns {{ estado: "entrenar"|"descanso", preset, nombre, zonas, enfasis, motivo, alternativa, recuperacion }}
 */
export function recommendToday(history, settings, now = Date.now()) {
  const minH = settings.params.recuperacionHoras ?? 48;
  const rec = subzoneRecovery(history, now);
  const enfasis = emphasisFor(settings, history);
  const ready = k => rec[k] == null || rec[k] >= minH;

  if (!history.length) {
    return { estado: "entrenar", preset: "completo", nombre: PRESETS.completo.nombre, zonas: structuredClone(PRESETS.completo.sel), enfasis,
      motivo: "Para empezar: cuerpo completo, así la app conoce tu nivel en todas las zonas.", alternativa: null, recuperacion: rec };
  }

  const scored = Object.entries(PRESETS).map(([k, p]) => {
    const subs = subsOf(p.sel);
    const listos = subs.filter(ready);
    const frac = listos.length / subs.length;
    const rest = subs.reduce((t, s) => t + Math.min(rec[s] ?? NEVER, NEVER), 0) / subs.length / 24;   // días medios de descanso
    return { k, p, subs, listos, frac, rest, score: frac * 10 + rest };
  }).sort((a, b) => b.score - a.score);

  // Prioridad: Push, Pull o Piernas; cuerpo completo si llevas varios días sin entrenar nada; core solo si lo demás está cansado
  const lastAny = Math.min(...history.map(s => (now - Date.parse(s.fecha)) / HOUR).filter(Number.isFinite));
  const ok = scored.filter(x => x.frac >= 0.99);
  const splits = ok.filter(x => ["push", "pull", "piernas"].includes(x.k));
  const completo = ok.find(x => x.k === "completo" && lastAny >= 72);
  const viable = completo ? [completo, ...splits] : splits.length ? [...splits, ...ok.filter(x => x.k === "core")] : ok.filter(x => x.k === "core");
  if (!viable.length) {
    const tired = Object.entries(rec).filter(([, h]) => h != null && h < minH).sort((a, b) => a[1] - b[1]);
    const z = [...new Set(tired.map(([k]) => ZONES[k.split(".")[0]].nombre.toLowerCase()))].slice(0, 3);
    return { estado: "descanso", preset: null, nombre: "Descanso", zonas: null, enfasis,
      motivo: `Todo se trabajó en las últimas ${minH} horas (${z.join(", ")}). Hoy toca recuperar: camina, estira o haz movilidad.`,
      alternativa: scored[0] ? { preset: scored[0].k, nombre: scored[0].p.nombre } : null, recuperacion: rec };
  }

  const best = viable[0], alt = viable[1] ?? null;
  // Motivo: cuánto descansó lo recomendado (solo lo ya trabajado alguna vez) y qué está aún en recuperación
  const trained = best.subs.map(k => rec[k]).filter(h => h != null);
  const restTxt = trained.length ? `descansado (lo último, ${fmtAgo(Math.min(...trained))})` : "sin trabajar todavía";
  const tiredZones = new Map();
  for (const [k, h] of Object.entries(rec)) if (h != null && h < minH && !best.subs.includes(k)) {
    const z = k.split(".")[0]; tiredZones.set(z, Math.min(h, tiredZones.get(z) ?? Infinity));
  }
  const tz = [...tiredZones.entries()].sort((a, b) => a[1] - b[1]);
  const names = tz.map(([z]) => ZONES[z].nombre.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : names[0];
  const tiredTxt = tz.length ? ` ${list[0].toUpperCase()}${list.slice(1)} ${tz.length > 1 ? "trabajados" : "trabajado"} ${fmtAgo(tz[0][1])}.` : "";
  const motivo = `${best.p.nombre}: ${restTxt}.${tiredTxt}`;
  return { estado: "entrenar", preset: best.k, nombre: best.p.nombre, zonas: structuredClone(best.p.sel), enfasis, motivo,
    alternativa: alt ? { preset: alt.k, nombre: alt.p.nombre } : null, recuperacion: rec };
}
