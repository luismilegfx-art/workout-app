// Registro al terminar: lo completado, peso y repeticiones, esfuerzo (RIR) y molestias.
import { html, mount, fmtMin, toast, confirmInPage } from "./dom.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { addSession, lastLogFor, saveRoutine, updateRoutine } from "../store.js";
import { planLabel, emphasisLabel, placeLabel } from "./preview.js";

const RIR_OPTIONS = ["0", "1", "2", "3", "4+"];

export function renderSummary(view, app) {
  const { plan, stats, finished } = app.result;
  const form = app.result.form ??= { rir: null, notas: "", ex: {}, estrellas: 0, guardar: !plan.saved && !plan.fromRoutine };
  const done = new Set(stats.completados);

  // Ejercicios principales en orden, con cuántos intervalos se hicieron
  const order = [];
  plan.steps.forEach((s, i) => {
    if (s.tipo !== "trabajo") return;
    let row = order.find(r => r.id === s.ejercicio);
    if (!row) { row = { id: s.ejercicio, intervalos: 0, completados: 0 }; order.push(row); }
    row.intervalos++; if (done.has(i)) row.completados++;
  });
  const totalDone = order.reduce((t, r) => t + r.completados, 0);
  const totalAll = order.reduce((t, r) => t + r.intervalos, 0);
  const durSec = Math.round((new Date(stats.fin) - new Date(stats.inicio)) / 1000);

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
        <div class="stat"><div class="v mono">${totalDone}/${totalAll}</div><div class="k">Intervalos de trabajo</div></div>
      </div>
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
    </section>

    <section class="card">
      <div class="stack" style="gap:2px">
        <h3>Registro por ejercicio</h3>
        <span class="muted">Opcional. Repeticiones promedio por intervalo y peso en ${app.settings.unidad}. Esto alimenta la progresión.</span>
      </div>
      <div>
        ${order.map(r => {
          const e = EXERCISE_BY_ID[r.id]; const f = form.ex[r.id] ?? {}; const last = lastLogFor(r.id);
          return html`<div class="log-row">
            <div class="stack" style="gap:0;min-width:0">
              <b>${e.nombre}</b>
              <span class="ex-meta">${r.completados}/${r.intervalos} intervalos${last ? ` · última vez ${last.peso ? `${last.peso} lb` : ""}${last.peso && last.reps ? " × " : ""}${last.reps ? `${last.reps}` : ""}` : ""}</span>
            </div>
            <input class="input" type="number" inputmode="numeric" min="0" placeholder="Reps" aria-label="Repeticiones de ${e.nombre}"
              id="reps-${r.id}" data-ex="${r.id}" data-field="reps" value="${f.reps ?? ""}">
            ${e.carga ? html`<input class="input" type="number" inputmode="decimal" min="0" step="2.5" placeholder="lb" aria-label="Peso de ${e.nombre}"
              id="peso-${r.id}" data-ex="${r.id}" data-field="peso" value="${f.peso ?? ""}">` : html`<span class="muted" style="font-size:.85rem">Corporal</span>`}
            <label class="check"><input type="checkbox" id="mol-${r.id}" data-ex="${r.id}" data-field="molestia" ${f.molestia ? "checked" : ""}> Molestia</label>
          </div>`;
        })}
      </div>
      <div class="field">
        <label class="label" for="notas">Notas</label>
        <input class="input" id="notas" data-field="notas" placeholder="Cómo te sentiste, qué cambiar…" value="${form.notas}">
      </div>
    </section>
  `);

  view.oninput = e => {
    const t = e.target; const field = t.dataset.field; if (!field) return;
    if (t.id === "save-routine") { form.guardar = t.checked; return; }
    if (field === "notas") { form.notas = t.value; return; }
    const ex = form.ex[t.dataset.ex] ??= {};
    ex[field] = t.type === "checkbox" ? t.checked : t.value === "" ? null : Number(t.value);
  };
  view.onchange = view.oninput;

  view.onclick = async e => {
    const t = e.target.closest("[data-action]"); if (!t) return;
    if (t.dataset.action === "rir") { form.rir = t.dataset.value; renderSummary(view, app); return; }
    if (t.dataset.action === "star") { const n = Number(t.dataset.value); form.estrellas = form.estrellas === n ? 0 : n; renderSummary(view, app); return; }
    if (t.dataset.action === "discard") {
      const ok = await confirmInPage({ title: "¿Descartar la sesión?", body: "No se guardará en el historial.", ok: "Descartar", danger: true });
      if (ok) { app.result = null; app.go("entrenar"); }
      return;
    }
    if (t.dataset.action === "save") {
      const molestias = order.filter(r => form.ex[r.id]?.molestia).map(r => r.id);
      addSession({
        id: `s-${Date.now().toString(36)}`,
        fecha: new Date(stats.inicio).toISOString(),
        zonas: plan.zonas, prioridad: plan.prioridad, lugar: plan.lugar, preset: plan.preset, enfasis: plan.enfasis, expres: plan.expres,
        nombre: plan.nombre ?? planLabel(plan), rutinaId: plan.routineId ?? null, minutosPlan: plan.minutos, duracionSeg: durSec, completa: finished,
        formato: plan.formato, rir: form.rir, notas: form.notas || null,
        ejercicios: order.map(r => ({ id: r.id, intervalos: r.intervalos, completados: r.completados,
          reps: form.ex[r.id]?.reps ?? null, peso: form.ex[r.id]?.peso ?? null, molestia: !!form.ex[r.id]?.molestia })),
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
