// Entrenar: flujo paso a paso lugar → zona → tiempo → énfasis → rutina.
import { html, mount, raw } from "./dom.js";
import { ZONES, EMPHASES, EQUIPMENT, PRESETS } from "../data/catalog.js";
import { generateRoutine } from "../engine/generator.js";
import { mountBodyMap } from "./body-map.js";

const STEPS = [
  { id: "lugar", nombre: "Lugar" }, { id: "zona", nombre: "Zona" },
  { id: "tiempo", nombre: "Tiempo" }, { id: "enfasis", nombre: "Énfasis" },
];
const TIME_PRESETS = [6, 10, 15, 20, 30, 45, 60];
const KEY = "wa.lastRequest.v2";
let bodyMap = null;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) ?? null; } catch { return null; } }
function save(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch {} }

export function newRequest(app) {
  const last = load();
  return { step: "lugar", lugar: last?.lugar ?? "casa", preset: last?.preset ?? app.settings.presetActivo,
    zonas: {}, prioridad: [], minutos: last?.minutos ?? 30, enfasis: null, calentamiento: null, estiramiento: null };
}

function zonesLabel(req) {
  const zs = Object.keys(req.zonas).filter(z => req.zonas[z]?.length);
  if (!zs.length) return null;
  const norm = s => JSON.stringify(Object.keys(s).filter(z => s[z]?.length).sort().map(z => [z, [...s[z]].sort()]));
  const preset = Object.values(PRESETS).find(p => norm(p.sel) === norm(req.zonas));
  return preset ? preset.nombre : zs.map(z => ZONES[z].nombre).join(", ");
}

export function renderTrain(view, app) {
  bodyMap?.destroy(); bodyMap = null;
  const req = app.request ??= newRequest(app);
  const idx = STEPS.findIndex(s => s.id === req.step);
  const preset = app.settings.presetsEquipo.find(p => p.id === req.preset) ?? app.settings.presetsEquipo[0];
  const expres = req.minutos <= app.settings.params.exprésHasta;
  const zonesDone = Object.values(req.zonas).some(v => v?.length);

  // Resumen de lo escogido: cada parte lleva a su paso
  const crumbs = [
    { step: "lugar", text: req.lugar === "gym" ? "Gimnasio" : `Casa · ${preset?.nombre ?? ""}` },
    { step: "zona", text: zonesLabel(req) },
    { step: "tiempo", text: idx >= 2 ? `${req.minutos} min` : null },
    { step: "enfasis", text: req.enfasis ? EMPHASES[req.enfasis].nombre : null },
  ].filter(c => c.text);

  const header = html`
    <div class="flow-head">
      <div class="stack" style="gap:4px">
        <span class="label">Paso ${idx + 1} de ${STEPS.length} · ${STEPS[idx].nombre}</span>
        <h1>${{ lugar: "¿Dónde entrenas?", zona: "¿Qué vas a trabajar?", tiempo: "¿Cuánto tiempo tienes?", enfasis: "¿Qué énfasis?" }[req.step]}</h1>
      </div>
      <ol class="steps" aria-label="Pasos">${STEPS.map((s, i) => html`<li class="${i < idx ? "done" : i === idx ? "now" : ""}"><button data-goto="${s.id}" ${i > idx ? "disabled" : ""}>${s.nombre}</button></li>`)}</ol>
    </div>
    ${crumbs.length ? html`<div class="crumbs">${crumbs.map(c => html`<button class="crumb" data-goto="${c.step}">${c.text}</button>`)}</div>` : ""}`;

  let body = "";
  if (req.step === "lugar") {
    body = html`
      <div class="choice-grid">
        <button class="choice ${req.lugar === "casa" ? "on" : ""}" data-act="lugar" data-v="casa"><b>Casa</b><span>Con tu propio equipo</span></button>
        <button class="choice ${req.lugar === "gym" ? "on" : ""}" data-act="lugar" data-v="gym"><b>Gimnasio</b><span>Máquinas, poleas y pesas</span></button>
      </div>
      ${req.lugar === "casa" ? html`<section class="card">
        <span class="label">Equipo disponible</span>
        <div class="stack">${app.settings.presetsEquipo.map(p => html`
          <button class="preset-row ${p.id === req.preset ? "on" : ""}" data-act="preset" data-v="${p.id}">
            <b>${p.nombre}</b><span>${p.equipo.filter(q => q !== "corporal").map(q => EQUIPMENT[q]).join(" · ") || "Solo peso corporal"}</span>
          </button>`)}</div>
        <span class="muted" style="font-size:.85rem">Puedes editar tus presets en Perfil.</span>
      </section>` : ""}`;
  } else if (req.step === "zona") {
    body = html`<div id="bodymap"></div>`;
  } else if (req.step === "tiempo") {
    body = html`<section class="card">
      <div class="time-pick">
        <button class="stepper" data-act="minus" aria-label="Menos tiempo">−</button>
        <div class="time-big" aria-live="polite">${req.minutos}<small>MIN</small></div>
        <button class="stepper" data-act="plus" aria-label="Más tiempo">+</button>
      </div>
      <div class="chips">${TIME_PRESETS.map(m => html`<button class="chip" aria-pressed="${req.minutos === m}" data-act="minutes" data-v="${m}">${m}</button>`)}</div>
      <p class="muted" style="margin:0">${expres
        ? "Sesión exprés: una sola zona, ejercicios encadenados sin descanso."
        : "El calentamiento y el estiramiento van incluidos dentro de este tiempo."}</p>
    </section>`;
  } else {
    const warmOn = req.calentamiento ?? !expres, coolOn = req.estiramiento ?? !expres;
    body = html`
      ${expres ? html`<section class="card"><b>Exprés</b><span class="muted">Con ${req.minutos} minutos la sesión usa un formato continuo propio, sin descanso.</span></section>`
      : html`<div class="choice-grid three">${Object.entries(EMPHASES).map(([k, v]) => html`
          <button class="choice ${req.enfasis === k ? "on" : ""}" data-act="enfasis" data-v="${k}"><b>${v.nombre}</b><span>${v.desc}</span></button>`)}</div>`}
      <section class="card">
        <label class="check"><input type="checkbox" id="opt-warm" ${warmOn ? "checked" : ""}> Calentamiento ${expres ? "(activación breve)" : "dinámico al inicio"}</label>
        <label class="check"><input type="checkbox" id="opt-cool" ${coolOn ? "checked" : ""}> Estiramiento al final</label>
      </section>`;
  }

  const canNext = req.step === "zona" ? zonesDone : req.step === "enfasis" ? (expres || !!req.enfasis) : true;
  const footer = html`<div class="flow-foot">
    ${idx > 0 ? html`<button class="btn" data-act="back">Atrás</button>` : html`<span></span>`}
    <button class="btn primary" data-act="${req.step === "enfasis" ? "generate" : "next"}" ${canNext ? "" : "disabled"}>${req.step === "enfasis" ? "Generar rutina" : "Continuar"}</button>
  </div>`;

  mount(view, html`${header}${body}${footer}`);

  if (req.step === "zona") {
    bodyMap = mountBodyMap(view.querySelector("#bodymap"), req, () => {
      const btn = view.querySelector('.flow-foot [data-act="next"]');
      btn.disabled = !Object.values(req.zonas).some(v => v?.length);
      const crumb = view.querySelector('.crumb[data-goto="zona"]');
      if (crumb) crumb.textContent = zonesLabel(req) ?? "";
    });
  }

  const go = step => { req.step = step; save(req); renderTrain(view, app); };
  view.onclick = e => {
    const g = e.target.closest("[data-goto]"); if (g && !g.disabled) return go(g.dataset.goto);
    const t = e.target.closest("[data-act]"); if (!t) return;
    const v = t.dataset.v;
    switch (t.dataset.act) {
      case "lugar": req.lugar = v; break;
      case "preset": req.preset = v; app.updateSettings({ presetActivo: v }); break;
      case "minus": req.minutos = Math.max(4, req.minutos - (req.minutos > 20 ? 5 : 1)); req.calentamiento = req.estiramiento = null; break;
      case "plus": req.minutos = Math.min(120, req.minutos + (req.minutos >= 20 ? 5 : 1)); req.calentamiento = req.estiramiento = null; break;
      case "minutes": req.minutos = Number(v); req.calentamiento = req.estiramiento = null; break;
      case "enfasis": req.enfasis = v; break;
      case "back": return go(STEPS[idx - 1].id);
      case "next": return go(STEPS[idx + 1].id);
      case "generate": {
        const ex = req.minutos <= app.settings.params.exprésHasta;
        app.plan = generateRoutine({ minutos: req.minutos, lugar: req.lugar, preset: req.preset, zonas: req.zonas, prioridad: req.prioridad,
          enfasis: req.enfasis ?? "masa", calentamiento: req.calentamiento ?? !ex, estiramiento: req.estiramiento ?? !ex }, app.settings, app.history);
        save(req); app.go("rutina"); return;
      }
      default: return;
    }
    save(req); renderTrain(view, app);
  };
  view.onchange = e => {
    if (e.target.id === "opt-warm") req.calentamiento = e.target.checked;
    if (e.target.id === "opt-cool") req.estiramiento = e.target.checked;
    save(req);
  };
}

export function leaveTrain() { bodyMap?.destroy(); bodyMap = null; }
