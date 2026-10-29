// Pantalla Entrenar: enfoque, lugar, tiempo y énfasis → genera la rutina.
import { html, mount } from "./dom.js";
import { FOCUSES, EMPHASES } from "../data/catalog.js";
import { generateRoutine, pickEmphasis, rngFrom } from "../engine/generator.js";

const MAIN_FOCUSES = ["push", "pull", "piernas", "core", "completo", "superior"];
const SPECIFIC_FOCUSES = ["pecho", "espalda", "hombros", "brazos"];
const PRESETS = [6, 10, 15, 20, 30, 45, 60];
const KEY = "wa.lastRequest.v1";

function loadRequest() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? null; } catch { return null; }
}
function saveRequest(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch {} }

export function renderSetup(view, app) {
  const req = app.request ??= loadRequest() ?? { minutos: 30, enfoque: "push", lugar: "casa", enfasis: "auto", calentamiento: null, estiramiento: null };
  const expres = req.minutos <= app.settings.params.exprésHasta;
  const warmOn = req.calentamiento ?? !expres;
  const coolOn = req.estiramiento ?? !expres;
  const autoNext = EMPHASES[pickEmphasis(app.settings, app.history, rngFrom(1))]?.nombre;

  const chip = (key, label, on, action) => html`<button class="chip" aria-pressed="${on}" data-action="${action}" data-value="${key}">${label}</button>`;

  mount(view, html`
    <div class="spread">
      <h1>Entrenar</h1>
      <span class="muted">${app.history.length ? `${app.history.length} sesiones registradas` : "Primera sesión"}</span>
    </div>

    <section class="card">
      <span class="label">Qué vas a trabajar</span>
      <div class="chips">${MAIN_FOCUSES.map(k => chip(k, FOCUSES[k].nombre, req.enfoque === k, "focus"))}</div>
      <div class="chips">${SPECIFIC_FOCUSES.map(k => chip(k, FOCUSES[k].nombre, req.enfoque === k, "focus"))}</div>
    </section>

    <div class="grid-2">
      <section class="card">
        <span class="label">Tiempo disponible</span>
        <div class="time-pick">
          <button class="stepper" data-action="minus" aria-label="Menos tiempo">−</button>
          <div class="time-big" aria-live="polite">${req.minutos}<small>MIN</small></div>
          <button class="stepper" data-action="plus" aria-label="Más tiempo">+</button>
        </div>
        <div class="chips">${PRESETS.map(m => chip(m, `${m}`, req.minutos === m, "preset"))}</div>
        <p class="muted" style="margin:0">${expres
          ? "Sesión exprés: un solo grupo muscular, ejercicios encadenados sin descanso."
          : "Incluye calentamiento al inicio y estiramiento al final dentro de este tiempo."}</p>
      </section>

      <section class="card">
        <span class="label">Lugar</span>
        <div class="seg" role="group" aria-label="Lugar">
          <button aria-pressed="${req.lugar === "casa"}" data-action="place" data-value="casa">Casa</button>
          <button aria-pressed="${req.lugar === "gym"}" data-action="place" data-value="gym">Gimnasio</button>
        </div>
        <span class="label">Énfasis de la sesión</span>
        <div class="seg" role="group" aria-label="Énfasis" ${expres ? "hidden" : ""}>
          <button aria-pressed="${req.enfasis === "auto"}" data-action="emph" data-value="auto">Auto</button>
          ${Object.entries(EMPHASES).map(([k, v]) => html`<button aria-pressed="${req.enfasis === k}" data-action="emph" data-value="${k}">${v.nombre}</button>`)}
        </div>
        <p class="muted" style="margin:0">${expres ? "Exprés usa su propio formato continuo."
          : req.enfasis === "auto" ? `Auto alterna tus objetivos. Hoy toca: ${autoNext}.` : "Énfasis fijado para esta sesión."}</p>
        <div class="stack">
          <label class="check"><input type="checkbox" id="opt-warm" data-action="warm" ${warmOn ? "checked" : ""}> Calentamiento ${expres ? "(activación breve)" : ""}</label>
          <label class="check"><input type="checkbox" id="opt-cool" data-action="cool" ${coolOn ? "checked" : ""}> Estiramiento final</label>
        </div>
      </section>
    </div>

    <div class="row" style="justify-content:flex-end">
      <button class="btn primary" data-action="generate">Generar rutina</button>
    </div>
  `);

  view.onclick = e => {
    const t = e.target.closest("[data-action]"); if (!t || t.type === "checkbox") return;
    const v = t.dataset.value;
    switch (t.dataset.action) {
      case "focus": req.enfoque = v; break;
      case "preset": req.minutos = Number(v); req.calentamiento = req.estiramiento = null; break;
      case "minus": req.minutos = Math.max(4, req.minutos - (req.minutos > 20 ? 5 : 1)); req.calentamiento = req.estiramiento = null; break;
      case "plus": req.minutos = Math.min(120, req.minutos + (req.minutos >= 20 ? 5 : 1)); req.calentamiento = req.estiramiento = null; break;
      case "place": req.lugar = v; break;
      case "emph": req.enfasis = v; break;
      case "generate": {
        saveRequest(req);
        const isExpres = req.minutos <= app.settings.params.exprésHasta;
        app.plan = generateRoutine({ ...req, calentamiento: req.calentamiento ?? !isExpres, estiramiento: req.estiramiento ?? !isExpres },
          app.settings, app.history);
        app.go("rutina");
        return;
      }
      default: return;
    }
    saveRequest(req); renderSetup(view, app);
  };
  view.onchange = e => {
    if (e.target.id === "opt-warm") req.calentamiento = e.target.checked;
    if (e.target.id === "opt-cool") req.estiramiento = e.target.checked;
    saveRequest(req);
  };
}
