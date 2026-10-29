// Biblioteca de ejercicios: consultar técnica y activar o desactivar ejercicios.
import { html, mount } from "./dom.js";
import { EXERCISES } from "../data/exercises.js";
import { MUSCLES, LEVELS } from "../data/catalog.js";
import { techCard } from "./technique.js";

const ui = { grupo: "todos", q: "", open: new Set() };
const TYPES = { principal: "Principal", calentamiento: "Calentamiento", estiramiento: "Estiramiento" };

export function renderLibrary(view, app) {
  const off = new Set(app.settings.desactivados);
  const avoid = new Set(app.settings.evitar);
  const groups = ["todos", ...new Set(EXERCISES.filter(e => e.tipo === "principal").map(e => e.musculo)), "calentamiento", "estiramiento"];
  const q = ui.q.trim().toLowerCase();
  const list = EXERCISES.filter(e =>
    (ui.grupo === "todos" || (ui.grupo === e.tipo) || (e.tipo === "principal" && e.musculo === ui.grupo))
    && (!q || e.nombre.toLowerCase().includes(q)));

  mount(view, html`
    <div class="spread"><h1>Biblioteca</h1><span class="muted">${EXERCISES.length} ejercicios · ${off.size} desactivados</span></div>
    <section class="card">
      <input class="input" id="lib-q" type="search" placeholder="Buscar ejercicio" value="${ui.q}" aria-label="Buscar ejercicio">
      <div class="chips">${groups.map(g => html`<button class="chip" data-action="group" data-value="${g}" aria-pressed="${ui.grupo === g}">${
        g === "todos" ? "Todos" : TYPES[g] ?? MUSCLES[g] ?? g}</button>`)}</div>
    </section>
    <section class="card">
      <ul class="ex-list">${list.map(e => html`<li>
        <div class="ex-item">
          <div class="stack" style="gap:2px;min-width:0">
            <button class="ex-name" data-action="toggle" data-id="${e.id}" aria-expanded="${ui.open.has(e.id)}" style="${off.has(e.id) ? "opacity:.5" : ""}">${e.nombre}</button>
            <span class="ex-meta">${TYPES[e.tipo]} · ${MUSCLES[e.musculo]} · ${LEVELS[e.nivel]} · ${e.lugar === "gym" ? "Solo gimnasio" : "Casa y gimnasio"}${avoid.has(e.id) ? " · evitado por molestia" : ""}${e.camara ? " · cámara disponible" : ""}</span>
          </div>
          <label class="check"><input type="checkbox" id="on-${e.id}" data-id="${e.id}" ${off.has(e.id) ? "" : "checked"}> Activo</label>
        </div>
        ${ui.open.has(e.id) ? techCard(e, { compact: true }) : ""}
      </li>`)}</ul>
      ${list.length ? "" : html`<div class="empty">Ningún ejercicio coincide con la búsqueda.</div>`}
    </section>
  `);

  view.onclick = e => {
    const t = e.target.closest("[data-action]"); if (!t) return;
    if (t.dataset.action === "group") ui.grupo = t.dataset.value;
    if (t.dataset.action === "toggle") { const id = t.dataset.id; ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id); }
    renderLibrary(view, app);
  };
  view.onchange = e => {
    const id = e.target.dataset.id; if (!id || e.target.type !== "checkbox") return;
    const set = new Set(app.settings.desactivados);
    e.target.checked ? set.delete(id) : set.add(id);
    app.updateSettings({ desactivados: [...set] });
    renderLibrary(view, app);
  };
  view.oninput = e => {
    if (e.target.id !== "lib-q") return;
    ui.q = e.target.value;
    const pos = e.target.selectionStart;
    renderLibrary(view, app);
    const input = view.querySelector("#lib-q"); input.focus(); input.setSelectionRange(pos, pos);
  };
}
