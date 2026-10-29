// Vista previa de la rutina generada: revisar, cambiar ejercicios, regenerar o empezar.
import { html, mount, fmtMin, toast } from "./dom.js";
import { FOCUSES, EMPHASES, MUSCLES } from "../data/catalog.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { generateRoutine, swapExercise, buildSteps } from "../engine/generator.js";
import { techCard } from "./technique.js";
import { lastLogFor } from "../store.js";

const open = new Set();

function emphasisLabel(plan) { return plan.expres ? "Exprés" : EMPHASES[plan.enfasis]?.nombre ?? plan.enfasis; }

export function renderPreview(view, app) {
  const plan = app.plan;
  const f = plan.formato;
  const workSteps = plan.steps.filter(s => s.tipo === "trabajo").length;

  const item = (id, meta, swappable) => {
    const e = EXERCISE_BY_ID[id];
    const isOpen = open.has(id);
    return html`<li>
      <div class="ex-item">
        <div class="stack" style="gap:2px;min-width:0">
          <button class="ex-name" data-action="toggle" data-id="${id}" aria-expanded="${isOpen}">${e.nombre}</button>
          <span class="ex-meta">${meta}</span>
        </div>
        ${swappable ? html`<button class="btn small ghost" data-action="swap" data-id="${id}" aria-label="Cambiar ${e.nombre}">Cambiar</button>` : ""}
      </div>
      ${isOpen ? techCard(e, { compact: true, last: lastLogFor(id) }) : ""}
    </li>`;
  };

  mount(view, html`
    <div class="spread">
      <div class="stack" style="gap:4px">
        <span class="label">${FOCUSES[plan.enfoque]?.nombre} · ${plan.lugar === "gym" ? "Gimnasio" : "Casa"}</span>
        <h1>Tu rutina</h1>
      </div>
      <div class="row">
        <button class="btn" data-action="back">Ajustar</button>
        <button class="btn" data-action="regen">Otra rutina</button>
        <button class="btn primary" data-action="start">Empezar</button>
      </div>
    </div>

    <section class="card">
      <div class="summary-strip">
        <div class="stat"><div class="v">${fmtMin(plan.totalSec)}</div><div class="k">Duración real</div></div>
        <div class="stat"><div class="v">${emphasisLabel(plan)}</div><div class="k">Énfasis</div></div>
        <div class="stat"><div class="v mono">${f.trabajo}/${f.descanso}</div><div class="k">Segundos trabajo / descanso</div></div>
        <div class="stat"><div class="v">${workSteps}</div><div class="k">Intervalos de trabajo</div></div>
      </div>
    </section>

    ${plan.calentamiento.length ? html`<section class="card">
      <div class="section-title"><h3>Calentamiento</h3><span class="muted mono">${plan.calentamiento.length} × ${app.settings.params.pasoCalentamiento} s</span></div>
      <ul class="ex-list">${plan.calentamiento.map(id => item(id, "Dinámico, sin descanso", false))}</ul>
    </section>` : ""}

    ${plan.bloques.map((b, i) => html`<section class="card">
      <div class="section-title"><h3>Bloque ${i + 1} · ${MUSCLES[b.grupo] ?? b.grupo}</h3><span class="muted mono">${b.rondas} ${b.rondas === 1 ? "ronda" : "rondas"}</span></div>
      <ul class="ex-list">${b.ejercicios.map(id => item(id, `${f.trabajo} s${EXERCISE_BY_ID[id].unilateral ? " · cambia de lado a la mitad" : ""}`, true))}</ul>
    </section>`)}

    ${plan.estiramiento.length ? html`<section class="card">
      <div class="section-title"><h3>Estiramiento</h3><span class="muted mono">${plan.estiramiento.length} × ${app.settings.params.pasoEstiramiento} s</span></div>
      <ul class="ex-list">${plan.estiramiento.map(id => item(id, "Sostenido, respiración lenta", false))}</ul>
    </section>` : ""}
  `);

  view.onclick = e => {
    const t = e.target.closest("[data-action]"); if (!t) return;
    const id = t.dataset.id;
    switch (t.dataset.action) {
      case "toggle": open.has(id) ? open.delete(id) : open.add(id); break;
      case "swap": {
        const newId = swapExercise(plan, id, app.settings);
        if (!newId) { toast("No hay otro ejercicio disponible para ese grupo"); return; }
        plan.steps = buildSteps(plan, app.settings);
        plan.totalSec = plan.steps.reduce((t, s) => t + s.duracion, 0);
        toast(`Cambiado por ${EXERCISE_BY_ID[newId].nombre}`);
        break;
      }
      case "regen": {
        const req = { minutos: plan.minutos, enfoque: plan.enfoque, lugar: plan.lugar,
          enfasis: app.request?.enfasis ?? "auto", calentamiento: plan.calentamiento.length > 0, estiramiento: plan.estiramiento.length > 0 };
        app.plan = generateRoutine(req, app.settings, app.history); open.clear(); break;
      }
      case "back": app.plan = null; open.clear(); app.go("entrenar"); return;
      case "start": app.startSession(); return;
      default: return;
    }
    renderPreview(view, app);
  };
}
