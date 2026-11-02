// Resumen al terminar: lo anotado durante la sesión (editable), esfuerzo, molestias, calificación y guardado.
import { html, mount, fmtMin, toast, confirmInPage } from "./dom.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { addSession, lastLogFor, saveRoutine, updateRoutine } from "../store.js";
import { markDone, summarize, PAUSE_OPTIONS } from "../engine/session-log.js";
import { planLabel, emphasisLabel, placeLabel } from "./preview.js";

const RIR_OPTIONS = ["0", "1", "2", "3", "4+"];
const pauseLabel = v => PAUSE_OPTIONS.find(o => o.v === v)?.label ?? "—";

export function renderSummary(view, app) {
  const { plan, stats, finished } = app.result;
  const log = app.result.log ??= { entries: {}, pending: [] };
  const form = app.result.form ??= { rir: null, notas: "", molestia: {}, estrellas: 0, guardar: !plan.saved && !plan.fromRoutine, open: new Set() };
  const done = new Set(stats.completados);

  // Intervalos que se hicieron pero no llegaron a anotarse (sesión terminada antes, sin descansos largos)
  plan.steps.forEach((s, i) => { if (s.tipo === "trabajo" && i <= stats.hastaPaso) markDone(log, s, lastLogFor(s.ejercicio)); });

  // Ejercicios principales en orden, con cuántos intervalos se planificaron y completaron
  const order = [];
  plan.steps.forEach((s, i) => {
    if (s.tipo !== "trabajo") return;
    let row = order.find(r => r.id === s.ejercicio);
    if (!row) { row = { id: s.ejercicio, intervalos: 0, completados: 0 }; order.push(row); }
    row.intervalos++; if (done.has(i)) row.completados++;
  });
  const logged = Object.fromEntries(summarize(log).map(x => [x.id, x]));
  const totalDone = order.reduce((t, r) => t + r.completados, 0);
  const totalAll = order.reduce((t, r) => t + r.intervalos, 0);
  const durSec = Math.round((new Date(stats.fin) - new Date(stats.inicio)) / 1000);

  const seriesText = (e, x) => {
    if (!x || (e.medida === "reps" && x.series.every(s => s.reps == null) && x.peso == null)) return "Sin anotar · toca Editar para completarlo";
    const parts = e.medida === "tiempo"
      ? x.series.map(s => s.pausas === 0 ? "completo" : pauseLabel(s.pausas).toLowerCase())
      : x.series.map(s => s.reps ?? "—");
    const unit = e.medida === "tiempo" ? "" : " reps";
    return `${parts.join(" · ")}${unit}${x.peso ? ` · ${x.peso} lb` : ""}`;
  };

  mount(view, html`
    <div class="spread">
      <div class="stack" style="gap:4px">
        <span class="label">${planLabel(plan)} · ${placeLabel(plan, app.settings)} · ${emphasisLabel(plan)}</span>
        <h1>${finished ? "Sesión completada" : "Sesión terminada"}</h1>
      </div>
      <div class="row">
        <button class="btn danger" data-action="discard">Descartar</button>
        <button class="btn primary" data-action="save">Guardar</button>
      </div>
    </div>

    <section class="card">
      <div class="summary-strip">
        <div class="stat"><div class="v">${fmtMin(durSec)}</div><div class="k">Duración</div></div>
        <div class="stat"><div class="v mono">${totalDone}/${totalAll}</div><div class="k">Intervalos completados</div></div>
      </div>
    </section>

    <section class="card">
      <div class="stack" style="gap:2px">
        <h3>Lo que anotaste</h3>
        <span class="muted">Revisa o corrige antes de guardar. Esto alimenta tu progresión.</span>
      </div>
      <div>${order.map(r => {
        const e = EXERCISE_BY_ID[r.id], x = logged[r.id], isOpen = form.open.has(r.id);
        return html`<div class="sum-ex">
          <div class="sum-row">
            <div class="stack" style="gap:0;min-width:0">
              <b>${e.nombre}</b>
              <span class="ex-meta">${seriesText(e, x)}</span>
            </div>
            <div class="row" style="flex-wrap:nowrap">
              <label class="check" style="font-size:.88rem"><input type="checkbox" id="mol-${r.id}" data-mol="${r.id}" ${form.molestia[r.id] ? "checked" : ""}> Molestia</label>
              <button class="btn small ghost" data-action="edit" data-id="${r.id}" aria-expanded="${isOpen}">${isOpen ? "Listo" : "Editar"}</button>
            </div>
          </div>
          ${isOpen && x ? html`<div class="sum-series">${x.series.map(s => html`<div class="sum-serie">
            <span class="muted">Ronda ${s.ronda + 1}</span>
            ${e.medida === "tiempo"
              ? html`<select class="input" id="pa-${s.i}" data-i="${s.i}" data-field="pausas" aria-label="Pausas ronda ${s.ronda + 1}">${PAUSE_OPTIONS.map(o =>
                  html`<option value="${o.v}" ${o.v === s.pausas ? "selected" : ""}>${o.label}</option>`)}</select>`
              : html`<input class="input" type="number" inputmode="numeric" min="0" id="re-${s.i}" data-i="${s.i}" data-field="reps" value="${s.reps ?? ""}" placeholder="reps" aria-label="Repeticiones ronda ${s.ronda + 1}">`}
            ${e.carga ? html`<input class="input" type="number" inputmode="decimal" min="0" step="2.5" id="pe-${s.i}" data-i="${s.i}" data-field="peso" value="${s.peso ?? ""}" placeholder="lb" aria-label="Peso ronda ${s.ronda + 1}">` : ""}
          </div>`)}</div>` : ""}
        </div>`;
      })}</div>
    </section>

    <section class="card">
      <div class="stack" style="gap:2px">
        <h3>Esfuerzo</h3>
        <span class="muted">¿Cuántas repeticiones más podías hacer, en general, al terminar cada intervalo?</span>
      </div>
      <div class="rir" role="group" aria-label="Repeticiones en reserva">
        ${RIR_OPTIONS.map(v => html`<button data-action="rir" data-value="${v}" aria-pressed="${form.rir === v}">${v}</button>`)}
      </div>
    </section>

    <section class="card">
      <div class="stack" style="gap:2px">
        <h3>¿Qué te pareció la rutina?</h3>
        <span class="muted">La calificación y el comentario se guardan con la rutina.</span>
      </div>
      <div class="stars" role="group" aria-label="Calificación">${[1, 2, 3, 4, 5].map(n => html`<button data-action="star" data-value="${n}" class="${n <= form.estrellas ? "on" : ""}" aria-label="${n} estrellas">★</button>`)}</div>
      ${plan.fromRoutine || plan.saved ? html`<span class="muted">Esta rutina ya está en Rutinas; se actualizará su calificación.</span>`
        : html`<label class="check"><input type="checkbox" id="save-routine" ${form.guardar ? "checked" : ""}> Guardar esta rutina en Rutinas</label>`}
      <div class="field">
        <label class="label" for="notas">Comentario</label>
        <input class="input" id="notas" placeholder="Cómo te sentiste, para qué día es buena…" value="${form.notas}">
      </div>
    </section>
  `);

  view.onchange = e => {
    const t = e.target;
    if (t.id === "save-routine") { form.guardar = t.checked; return; }
    if (t.id === "notas") { form.notas = t.value; return; }
    if (t.dataset.mol) { form.molestia[t.dataset.mol] = t.checked; return; }
    if (t.dataset.i) {
      const entry = log.entries[t.dataset.i]; if (!entry) return;
      entry[t.dataset.field] = t.value === "" ? null : Number(t.value);
      renderSummary(view, app);
    }
  };
  view.oninput = e => { if (e.target.id === "notas") form.notas = e.target.value; };

  view.onclick = async e => {
    const t = e.target.closest("[data-action]"); if (!t) return;
    if (t.dataset.action === "edit") { const id = t.dataset.id; form.open.has(id) ? form.open.delete(id) : form.open.add(id); renderSummary(view, app); return; }
    if (t.dataset.action === "rir") { form.rir = t.dataset.value; renderSummary(view, app); return; }
    if (t.dataset.action === "star") { const n = Number(t.dataset.value); form.estrellas = form.estrellas === n ? 0 : n; renderSummary(view, app); return; }
    if (t.dataset.action === "discard") {
      const ok = await confirmInPage({ title: "¿Descartar la sesión?", body: "No se guardará en el historial.", ok: "Descartar", danger: true });
      if (ok) { app.result = null; app.go("entrenar"); }
      return;
    }
    if (t.dataset.action === "save") {
      const molestias = order.filter(r => form.molestia[r.id]).map(r => r.id);
      addSession({
        id: `s-${Date.now().toString(36)}`,
        fecha: new Date(stats.inicio).toISOString(),
        zonas: plan.zonas, prioridad: plan.prioridad, lugar: plan.lugar, preset: plan.preset, enfasis: plan.enfasis, expres: plan.expres,
        nombre: plan.nombre ?? planLabel(plan), rutinaId: plan.routineId ?? null, minutosPlan: plan.minutos, duracionSeg: durSec, completa: finished,
        formato: plan.formato, rir: form.rir, notas: form.notas || null,
        ejercicios: order.map(r => {
          const x = logged[r.id];
          return { id: r.id, intervalos: r.intervalos, completados: r.completados, medida: EXERCISE_BY_ID[r.id].medida,
            series: x?.series.map(({ ronda, reps, peso, pausas }) => ({ ronda, reps, peso, pausas })) ?? [],
            reps: x?.reps ?? null, peso: x?.peso ?? null, pausas: x?.pausas ?? null, molestia: !!form.molestia[r.id] };
        }),
      });
      if (plan.routineId) updateRoutine(plan.routineId, { ultimaVez: new Date().toISOString(), ...(form.estrellas ? { estrellas: form.estrellas } : {}), ...(form.notas ? { comentario: form.notas } : {}) });
      else if (form.guardar) saveRoutine(plan, { nombre: `${planLabel(plan)} · ${placeLabel(plan, app.settings)} · ${plan.minutos} min`, estrellas: form.estrellas, comentario: form.notas, ultimaVez: new Date().toISOString() });
      if (molestias.length) app.updateSettings({ evitar: [...new Set([...app.settings.evitar, ...molestias])] });
      app.reloadHistory();
      app.result = null;
      toast(molestias.length ? "Guardada. Los ejercicios con molestia se evitarán." : "Sesión guardada");
      app.go("progreso");
    }
  };
}
