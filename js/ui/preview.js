// Vista previa de la rutina: revisar, cambiar ejercicios, regenerar, guardar o empezar.
import { html, mount, fmtMin, fmtClock, toast } from "./dom.js";
import { EMPHASES, ZONES, PRESETS } from "../data/catalog.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { generateRoutine, swapExercise, buildSteps, blockTitle, sumSteps } from "../engine/generator.js";
import { techCard } from "./technique.js";
import { lastLogFor, saveRoutine, setTimeStats } from "../store.js";
import { suggest } from "../engine/progression.js";

const open = new Set();

export function planLabel(plan) {
  const zonas = plan.zonas ?? {};
  const norm = s => JSON.stringify(Object.keys(s).filter(z => s[z]?.length).sort().map(z => [z, [...s[z]].sort()]));
  const preset = Object.values(PRESETS).find(p => norm(p.sel) === norm(zonas));
  return preset ? preset.nombre : Object.keys(zonas).map(z => ZONES[z]?.nombre).filter(Boolean).join(", ") || "Rutina";
}
export const emphasisLabel = plan => plan.expres ? "Exprés" : EMPHASES[plan.enfasis]?.nombre ?? plan.enfasis;
export const placeLabel = (plan, settings) => plan.lugar === "gym" ? "Gimnasio"
  : `Casa${plan.preset ? ` · ${settings.presetsEquipo.find(p => p.id === plan.preset)?.nombre ?? ""}` : ""}`;

export function renderPreview(view, app) {
  const plan = app.plan;
  const f = plan.formato;
  const workSteps = plan.steps.filter(s => s.tipo === "trabajo").length;
  const series = plan.modo === "series";
  const repsText = r => r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
  const seriesMeta = (b, id) => {
    const e = EXERCISE_BY_ID[id];
    const what = e.medida === "tiempo" ? `${app.settings.params.fuerza.isometrico} s${e.unilateral ? " por lado" : ""}` : `${repsText(b.reps)} reps${e.unilateral ? " por lado" : ""}`;
    return `${b.rondas} series × ${what} · descanso ${fmtClock(b.descansoSerie)}${b.aproximacion ? ` · ${b.aproxCorta ? "1 serie" : "2 series"} de aproximación` : ""}`;
  };

  // Lo que toca según el historial: peso sugerido, subida, retomar o cambio de variante
  const SUG_LABEL = { subir: "Sube a", bajar: "Baja a", retomar: "Retoma con", mantener: "", nuevo: "" };
  const sugTag = id => {
    const sg = suggest(id, app.history, app.settings.params);
    if (sg.estado === "variante") return html`<span class="sug">${sg.motivo}</span>`;
    if (sg.peso == null) return sg.estado === "nuevo" && EXERCISE_BY_ID[id].carga ? html`<span class="ex-meta">Primera vez: se calibra el peso serie a serie</span>` : "";
    return html`<span class="${sg.estado === "mantener" ? "ex-meta" : "sug"}">${SUG_LABEL[sg.estado] ? `${SUG_LABEL[sg.estado]} ${sg.peso} lb` : `${sg.peso} lb`}</span>`;
  };
  const item = (id, meta, swappable) => {
    const e = EXERCISE_BY_ID[id];
    const isOpen = open.has(id);
    return html`<li>
      <div class="ex-item">
        <div class="stack" style="gap:2px;min-width:0">
          <button class="ex-name" data-action="toggle" data-id="${id}" aria-expanded="${isOpen}">${e.nombre}</button>
          <span class="ex-meta">${meta}</span>
          ${swappable ? sugTag(id) : ""}
        </div>
        ${swappable ? html`<button class="btn small ghost" data-action="swap" data-id="${id}" aria-label="Cambiar ${e.nombre}">Cambiar</button>` : ""}
      </div>
      ${isOpen ? techCard(e, { compact: true, last: lastLogFor(id) }) : ""}
    </li>`;
  };

  mount(view, html`
    <div class="spread">
      <div class="stack" style="gap:4px">
        <span class="label">${placeLabel(plan, app.settings)} · ${emphasisLabel(plan)}</span>
        <h1>${plan.nombre ?? planLabel(plan)}</h1>
      </div>
      <div class="row">
        ${plan.fromRoutine ? "" : html`<button class="btn" data-action="back">Ajustar</button>
        <button class="btn" data-action="regen">Otra rutina</button>`}
        <button class="btn" data-action="save" ${plan.saved ? "disabled" : ""}>${plan.saved ? "Guardada" : "Guardar"}</button>
        <button class="btn primary" data-action="start">Empezar</button>
      </div>
    </div>

    <section class="card">
      ${series ? html`<div class="summary-strip">
        <div class="stat"><div class="v">≈ ${fmtMin(plan.totalSec)}</div><div class="k">Duración estimada</div></div>
        <div class="stat"><div class="v">${plan.bloques.length}</div><div class="k">Ejercicios</div></div>
        <div class="stat"><div class="v">${workSteps}</div><div class="k">Series de trabajo</div></div>
      </div>
      <span class="muted">Cada serie termina cuando tocas <b>Serie completada</b>; el descanso arranca solo.</span>`
      : html`<div class="summary-strip">
        <div class="stat"><div class="v">${fmtMin(plan.totalSec)}</div><div class="k">Duración real</div></div>
        <div class="stat"><div class="v mono">${f.trabajo}/${f.descanso}</div><div class="k">Segundos trabajo / descanso</div></div>
        <div class="stat"><div class="v">${workSteps}</div><div class="k">Intervalos de trabajo</div></div>
        <div class="stat"><div class="v">${plan.bloques.length}</div><div class="k">${plan.bloques.length === 1 ? "Bloque" : "Bloques"}</div></div>
      </div>`}
      ${plan.sinEjercicios?.length ? html`<span class="warn-note">Con el equipo escogido no hay ejercicios para ${plan.sinEjercicios.map(z => ZONES[z].nombre).join(", ")}. Agrega equipo en el paso Lugar o quita esa zona.</span>` : ""}
      ${plan.sinTiempo?.length ? html`<span class="warn-note">En ${plan.minutos} min no cabe ${plan.sinTiempo.map(z => ZONES[z].nombre).join(", ")}${plan.modo === "series" ? " con descansos de Fuerza" : ""}. Sube el tiempo${plan.modo === "series" ? " o usa el énfasis Músculo" : ""} si quieres incluirlo.</span>` : ""}
      ${plan.prioridad?.length ? html`<span class="muted">Prioridad: ${plan.prioridad.map(k => { const [z, s] = k.split("."); return `${ZONES[z].nombre} ${ZONES[z].subs[s].toLowerCase()}`; }).join(", ")}</span>` : ""}
    </section>

    ${plan.calentamiento.length ? html`<section class="card">
      <div class="section-title"><h3>Calentamiento</h3><span class="muted mono">${plan.calentamiento.length} × ${app.settings.params.pasoCalentamiento} s</span></div>
      <ul class="ex-list">${plan.calentamiento.map(id => item(id, "Dinámico, sin descanso", false))}</ul>
    </section>` : ""}

    ${series ? html`<section class="card">
      <div class="section-title"><h3>Ejercicios</h3><span class="muted">Principales primero</span></div>
      <ul class="ex-list">${plan.bloques.map(b => item(b.ejercicios[0], `${b.principal ? "Principal · " : ""}${seriesMeta(b, b.ejercicios[0])}`, true))}</ul>
    </section>`
    : plan.bloques.map((b, i) => html`<section class="card">
      <div class="section-title"><h3>Bloque ${i + 1} · ${blockTitle(b)}</h3><span class="muted mono">${b.rondas} ${b.rondas === 1 ? "ronda" : "rondas"}</span></div>
      <ul class="ex-list">${b.ejercicios.map(id => item(id, `${EXERCISE_BY_ID[id].unilateral ? `${f.trabajo} s por lado` : `${f.trabajo} s`}`, true))}</ul>
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
        if (!newId) { toast("No hay otro ejercicio disponible para esa zona"); return; }
        plan.steps = buildSteps(plan, app.settings); plan.totalSec = sumSteps(plan.steps); plan.saved = false;
        plan.bloques.forEach(b => { b.trabaja = [...new Set(b.ejercicios.map(x => EXERCISE_BY_ID[x].sub))]; });
        toast(`Cambiado por ${EXERCISE_BY_ID[newId].nombre}`);
        break;
      }
      case "regen": {
        const r = app.request;
        app.plan = generateRoutine({ minutos: plan.minutos, lugar: plan.lugar, preset: plan.preset, zonas: plan.zonas, prioridad: plan.prioridad,
          equipo: plan.equipoElegido ? plan.equipo : undefined, maxEquipos: plan.equipoElegido ? Infinity : undefined, tiempoSerie: setTimeStats(),
          enfasis: plan.expres ? "masa" : plan.enfasis, calentamiento: plan.calentamiento.length > 0, estiramiento: plan.estiramiento.length > 0 },
          app.settings, app.history);
        if (r) r.step = "enfasis";
        open.clear(); break;
      }
      case "save": {
        saveRoutine(plan, { nombre: `${planLabel(plan)} · ${placeLabel(plan, app.settings)} · ${plan.minutos} min` });
        plan.saved = true; toast("Guardada en Rutinas"); break;
      }
      case "back": open.clear(); if (app.request) app.request.step = "enfasis"; app.plan = null; app.go("entrenar"); return;
      case "start": app.startSession(); return;
      default: return;
    }
    renderPreview(view, app);
  };
}
