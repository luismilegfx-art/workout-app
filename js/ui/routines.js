// Rutinas guardadas: calificación, carpeta, comentario; usar o borrar.
import { html, mount, fmtMin, fmtDate, confirmInPage, toast } from "./dom.js";
import { getRoutines, updateRoutine, deleteRoutine } from "../store.js";
import { buildSteps, sumSteps } from "../engine/generator.js";
import { planLabel, emphasisLabel, placeLabel } from "./preview.js";

const ui = { folder: "todas", sort: "recientes" };

export function renderRoutines(view, app) {
  const all = getRoutines();
  const folders = [...new Set(all.map(r => r.carpeta).filter(Boolean))].sort();
  let list = ui.folder === "todas" ? all : all.filter(r => (r.carpeta || "") === (ui.folder === "sin" ? "" : ui.folder));
  if (ui.sort === "estrellas") list = [...list].sort((a, b) => (b.estrellas ?? 0) - (a.estrellas ?? 0));

  mount(view, html`
    <div class="spread"><h1>Rutinas</h1><span class="muted">${all.length} guardadas</span></div>

    ${all.length ? html`<section class="card">
      <div class="spread">
        <div class="chips">
          <button class="chip" data-act="folder" data-v="todas" aria-pressed="${ui.folder === "todas"}">Todas</button>
          ${folders.map(f => html`<button class="chip" data-act="folder" data-v="${f}" aria-pressed="${ui.folder === f}">${f}</button>`)}
          ${all.some(r => !r.carpeta) && folders.length ? html`<button class="chip" data-act="folder" data-v="sin" aria-pressed="${ui.folder === "sin"}">Sin carpeta</button>` : ""}
        </div>
        <div class="seg" role="group" aria-label="Orden">
          <button data-act="sort" data-v="recientes" aria-pressed="${ui.sort === "recientes"}">Recientes</button>
          <button data-act="sort" data-v="estrellas" aria-pressed="${ui.sort === "estrellas"}">Mejor calificadas</button>
        </div>
      </div>
    </section>` : ""}

    <section class="card">
      ${list.length ? list.map(r => html`
        <div class="routine">
          <div class="spread">
            <input class="routine-name" id="name-${r.id}" data-id="${r.id}" data-field="nombre" value="${r.nombre || planLabel(r.plan)}" aria-label="Nombre de la rutina">
            <div class="stars" role="group" aria-label="Calificación">${[1, 2, 3, 4, 5].map(n =>
              html`<button data-act="star" data-id="${r.id}" data-v="${n}" class="${n <= (r.estrellas ?? 0) ? "on" : ""}" aria-label="${n} estrellas">★</button>`)}</div>
          </div>
          <span class="ex-meta">${planLabel(r.plan)} · ${placeLabel(r.plan, app.settings)} · ${emphasisLabel(r.plan)} · ${fmtMin(r.duracionSeg ?? r.plan.minutos * 60)}${r.ultimaVez ? ` · última vez ${fmtDate(r.ultimaVez)}` : ""}</span>
          <div class="row" style="flex-wrap:wrap">
            <input class="input" style="max-width:180px" id="folder-${r.id}" data-id="${r.id}" data-field="carpeta" value="${r.carpeta}" placeholder="Carpeta" list="folders-list" aria-label="Carpeta">
            <input class="input" style="flex:1;min-width:200px" id="comment-${r.id}" data-id="${r.id}" data-field="comentario" value="${r.comentario}" placeholder="Comentario: para un día tranquilo, para el gym…" aria-label="Comentario">
          </div>
          <div class="row">
            <button class="btn primary small" data-act="use" data-id="${r.id}">Usar</button>
            <button class="btn small danger" data-act="delete" data-id="${r.id}">Borrar</button>
          </div>
        </div>`)
      : html`<div class="empty">${all.length ? "No hay rutinas en esta carpeta." : "Todavía no hay rutinas guardadas. Guárdalas desde la vista previa o al terminar una sesión."}</div>`}
    </section>
    <datalist id="folders-list">${folders.map(f => html`<option value="${f}"></option>`)}</datalist>
  `);

  view.onchange = e => {
    const t = e.target; if (!t.dataset.field) return;
    updateRoutine(t.dataset.id, { [t.dataset.field]: t.value.trim() });
    if (t.dataset.field === "carpeta") renderRoutines(view, app); else toast("Guardado");
  };
  view.onclick = async e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const r = all.find(x => x.id === t.dataset.id);
    switch (t.dataset.act) {
      case "folder": ui.folder = t.dataset.v; break;
      case "sort": ui.sort = t.dataset.v; break;
      case "star": { const n = Number(t.dataset.v); updateRoutine(r.id, { estrellas: r.estrellas === n ? 0 : n }); break; }
      case "use": {
        const plan = structuredClone(r.plan);
        plan.steps = buildSteps(plan, app.settings); plan.totalSec = sumSteps(plan.steps);
        Object.assign(plan, { fromRoutine: true, saved: true, routineId: r.id, nombre: r.nombre || planLabel(r.plan) });
        app.plan = plan; app.go("rutina"); return;
      }
      case "delete": {
        const ok = await confirmInPage({ title: "¿Borrar esta rutina?", body: "Tu historial de sesiones no cambia.", ok: "Borrar", danger: true });
        if (!ok) return; deleteRoutine(r.id); break;
      }
      default: return;
    }
    renderRoutines(view, app);
  };
}
