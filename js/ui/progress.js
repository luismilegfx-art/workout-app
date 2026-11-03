// Progreso (inicio): resumen de la semana, constancia, última sesión, calendario y sesiones recientes.
// Diseño provisional: se definirá en la pasada de diseño.
import { html, mount, fmtMin, fmtDate, confirmInPage } from "./dom.js";
import { ZONES, EMPHASES, FOCUSES } from "../data/catalog.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { deleteSession } from "../store.js";
import { recommendToday } from "../engine/recommend.js";
import { newRequest } from "./train.js";
import { PRESETS } from "../data/catalog.js";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

// Qué toca hoy: recomendación con su motivo y un toque para empezar
function todayCard(rec, app) {
  const minH = app.settings.params.recuperacionHoras ?? 48;
  const zonasRec = Object.entries(ZONES).map(([z, def]) => {
    const hs = Object.keys(def.subs).map(s => rec.recuperacion[`${z}.${s}`]);
    const ready = hs.filter(v => v == null || v >= minH).length;
    const worked = hs.filter(v => v != null);
    const h = worked.length ? Math.min(...worked) : null;
    return { nombre: def.nombre, h, listo: ready === hs.length, parcial: ready > 0 && ready < hs.length };
  });
  const enf = rec.enfasis && EMPHASES[rec.enfasis] ? EMPHASES[rec.enfasis].nombre : "";
  return html`<section class="card today">
    <span class="label">Qué toca hoy</span>
    <div class="spread" style="align-items:flex-end">
      <h2 class="today-title">${rec.estado === "descanso" ? "Descanso" : rec.nombre}${rec.estado === "entrenar" && enf ? html` <span class="today-enf">· ${enf}</span>` : ""}</h2>
    </div>
    <span class="muted">${rec.motivo}</span>
    <div class="recov" aria-label="Recuperación por zona">${zonasRec.map(z => html`<span class="recov-z ${z.listo ? "on" : z.parcial ? "half" : ""}" title="${z.h == null ? "Sin trabajar todavía" : `Última vez hace ${Math.round(z.h)} h`}">${z.nombre}<small>${z.listo ? "lista" : z.parcial ? "en parte" : `lista en ${Math.max(1, Math.round(minH - z.h))} h`}</small></span>`)}</div>
    <div class="row">
      ${rec.estado === "entrenar"
        ? html`<button class="btn primary" data-act="rec" data-preset="${rec.preset}" data-enfasis="${rec.enfasis}">Empezar ${rec.nombre}</button>`
        : html`<button class="btn" data-act="train">Entrenar de todas formas</button>`}
      ${rec.alternativa ? html`<button class="btn ghost" data-act="rec" data-preset="${rec.alternativa.preset}" data-enfasis="${rec.enfasis}">Otra opción: ${rec.alternativa.nombre}</button>` : ""}
    </div>
  </section>`;
}
const ui = { month: null, day: null, open: new Set() };

const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function startOfWeek(d) { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - wd); return x; }
function sessionZones(s) { return Object.keys(s.zonas ?? FOCUSES[s.enfoque]?.zonas ?? {}); }
function sessionTitle(s) { return s.nombre ?? FOCUSES[s.enfoque]?.nombre ?? sessionZones(s).map(z => ZONES[z].nombre).join(", "); }

// Semanas seguidas (incluida la actual si ya cumple) alcanzando la meta semanal
function weekStreak(history, goal) {
  const byWeek = new Map();
  history.forEach(s => { const k = startOfWeek(new Date(s.fecha)).getTime(); byWeek.set(k, (byWeek.get(k) ?? 0) + 1); });
  let w = startOfWeek(new Date()), streak = 0;
  if ((byWeek.get(w.getTime()) ?? 0) < goal) w.setDate(w.getDate() - 7);    // la semana en curso aún puede completarse
  while ((byWeek.get(w.getTime()) ?? 0) >= goal) { streak++; w.setDate(w.getDate() - 7); }
  return streak;
}

export function renderProgress(view, app) {
  const h = app.history;
  const goal = app.settings.metaSemanal ?? 4;
  const now = new Date();
  const week0 = startOfWeek(now);
  const thisWeek = h.filter(s => new Date(s.fecha) >= week0);
  const minutesBy = new Map();
  thisWeek.forEach(s => { const k = dayKey(new Date(s.fecha)); minutesBy.set(k, (minutesBy.get(k) ?? 0) + (s.duracionSeg ?? 0) / 60); });
  const maxMin = Math.max(30, ...minutesBy.values());
  const weekMin = Math.round(thisWeek.reduce((t, s) => t + (s.duracionSeg ?? 0), 0) / 60);
  const hour = now.getHours();
  const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const last = h[0];

  // Calendario del mes
  ui.month ??= new Date(now.getFullYear(), now.getMonth(), 1);
  const m = ui.month, first = new Date(m.getFullYear(), m.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7, daysIn = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const trainedDays = new Map();
  h.forEach(s => { const k = dayKey(new Date(s.fecha)); trainedDays.set(k, [...(trainedDays.get(k) ?? []), s]); });
  const daySessions = ui.day ? trainedDays.get(ui.day) ?? [] : [];
  const monthName = m.toLocaleDateString("es-PR", { month: "long", year: "numeric" });

  const sessionItem = s => html`
    <div class="hist-item">
      <div class="stack" style="gap:2px;min-width:0">
        <b>${sessionTitle(s)} · ${s.expres ? "Exprés" : EMPHASES[s.enfasis]?.nombre ?? ""}</b>
        <span class="ex-meta">${fmtDate(s.fecha)} · ${fmtMin(s.duracionSeg)} · ${s.lugar === "gym" ? "Gimnasio" : "Casa"}${s.rir ? ` · RIR ${s.rir}` : ""}${s.completa ? "" : " · incompleta"}</span>
        ${ui.open.has(s.id) ? html`<div class="detail" style="margin-top:8px">
          <ul>${s.ejercicios.map(e => html`<li>${EXERCISE_BY_ID[e.id]?.nombre ?? e.id} — ${e.completados}/${e.intervalos}${e.reps ? ` · ${e.reps} reps` : ""}${e.peso ? ` · ${e.peso} lb` : ""}${e.molestia ? " · molestia" : ""}</li>`)}</ul>
          ${s.notas ? html`<div class="muted">${s.notas}</div>` : ""}
          <div><button class="btn small danger" data-act="delete" data-id="${s.id}">Borrar sesión</button></div>
        </div>` : ""}
      </div>
      <button class="btn small ghost" data-act="toggle" data-id="${s.id}" aria-expanded="${ui.open.has(s.id)}">${ui.open.has(s.id) ? "Ocultar" : "Ver"}</button>
    </div>`;

  const rec = recommendToday(h, app.settings);
  mount(view, html`
    <div class="hello">
      <div class="stack" style="gap:4px">
        <span class="label">${now.toLocaleDateString("es-PR", { weekday: "long", day: "numeric", month: "long" })}</span>
        <h1>${hello}</h1>
      </div>
    </div>

    ${todayCard(rec, app)}

    <section class="card">
      <div class="spread"><h3>Esta semana</h3><span class="muted">Meta: ${goal} sesiones</span></div>
      <div class="week">
        <div class="week-days">${DAYS.map((d, i) => {
          const day = new Date(week0); day.setDate(week0.getDate() + i);
          const min = minutesBy.get(dayKey(day)) ?? 0;
          return html`<div class="wd ${min ? "on" : ""} ${dayKey(day) === dayKey(now) ? "today" : ""}">
            <div class="bar" style="height:${min ? Math.max(18, min / maxMin * 100) : 8}%" title="${Math.round(min)} min"></div><span class="lbl">${d}</span></div>`;
        })}</div>
        <div class="week-goal"><div class="v">${thisWeek.length}<small>/${goal}</small></div><span class="muted">${weekMin} min entrenados</span></div>
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="summary-strip">
          <div class="stat"><div class="v">${weekStreak(h, goal)}</div><div class="k">Semanas seguidas cumpliendo la meta</div></div>
          <div class="stat"><div class="v">${h.length}</div><div class="k">Sesiones en total</div></div>
        </div>
      </section>
      <section class="card">
        ${last ? html`<span class="label">Última sesión</span>
          <b>${sessionTitle(last)}</b>
          <span class="muted">${fmtDate(last.fecha)} · ${fmtMin(last.duracionSeg)} · ${last.expres ? "Exprés" : EMPHASES[last.enfasis]?.nombre ?? ""}</span>`
        : html`<span class="label">Última sesión</span><span class="muted">Todavía no hay sesiones.</span>`}
      </section>
    </div>

    <section class="card">
      <div class="spread">
        <h3>${monthName}</h3>
        <div class="row"><button class="btn small" data-act="prev-month" aria-label="Mes anterior">‹</button><button class="btn small" data-act="next-month" aria-label="Mes siguiente">›</button></div>
      </div>
      <div class="cal">
        ${DAYS.map(d => html`<span class="h">${d}</span>`)}
        ${Array.from({ length: lead }, () => html`<span></span>`)}
        ${Array.from({ length: daysIn }, (_, i) => {
          const d = new Date(m.getFullYear(), m.getMonth(), i + 1), k = dayKey(d), trained = trainedDays.has(k);
          return html`<button class="in ${trained ? "trained" : ""} ${k === dayKey(now) ? "today" : ""} ${ui.day === k ? "sel" : ""}" data-act="day" data-k="${k}" ${trained ? "" : "disabled"}
            aria-label="${d.toLocaleDateString("es-PR", { day: "numeric", month: "long" })}${trained ? ", entrenado" : ""}">${i + 1}</button>`;
        })}
      </div>
      ${daySessions.length ? html`<div>${daySessions.map(sessionItem)}</div>` : ""}
    </section>

    ${h.length ? html`<section class="card"><h3>Sesiones recientes</h3><div>${h.slice(0, 8).map(sessionItem)}</div></section>` : ""}
  `);

  view.onclick = async e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const id = t.dataset.id;
    switch (t.dataset.act) {
      case "train": return app.newTraining();
      case "rec": {
        // Abre Entrenar con la zona y el énfasis recomendados ya escogidos; lugar y tiempo los decides tú
        const preset = t.dataset.preset, r = newRequest(app);
        Object.assign(r, { zonas: structuredClone(PRESETS[preset].sel), enfasis: t.dataset.enfasis || null, step: "lugar" });
        app.request = r; app.plan = null; return app.go("entrenar");
      }
      case "toggle": ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id); break;
      case "day": ui.day = ui.day === t.dataset.k ? null : t.dataset.k; break;
      case "prev-month": ui.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); ui.day = null; break;
      case "next-month": ui.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); ui.day = null; break;
      case "delete": {
        const ok = await confirmInPage({ title: "¿Borrar esta sesión?", body: "Se elimina del historial de este dispositivo.", ok: "Borrar", danger: true });
        if (!ok) return;
        deleteSession(id); app.reloadHistory(); break;
      }
      default: return;
    }
    renderProgress(view, app);
  };
}
