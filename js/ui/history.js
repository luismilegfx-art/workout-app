// Historial de sesiones.
import { html, mount, fmtMin, fmtDate, confirmInPage } from "./dom.js";
import { FOCUSES, EMPHASES } from "../data/catalog.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { deleteSession } from "../store.js";

const open = new Set();

export function renderHistory(view, app) {
  const h = app.history;
  const week = h.filter(s => Date.now() - new Date(s.fecha) < 7 * 864e5);
  const weekMin = Math.round(week.reduce((t, s) => t + (s.duracionSeg ?? 0), 0) / 60);

  mount(view, html`
    <div class="spread"><h1>Historial</h1></div>
    <section class="card">
      <div class="summary-strip">
        <div class="stat"><div class="v">${week.length}</div><div class="k">Sesiones esta semana</div></div>
        <div class="stat"><div class="v">${weekMin} min</div><div class="k">Tiempo esta semana</div></div>
        <div class="stat"><div class="v">${h.length}</div><div class="k">Sesiones en total</div></div>
      </div>
    </section>
    <section class="card">
      ${h.length ? h.map(s => html`
        <div class="hist-item">
          <div class="stack" style="gap:2px;min-width:0">
            <b>${FOCUSES[s.enfoque]?.nombre ?? s.enfoque} · ${s.expres ? "Exprés" : EMPHASES[s.enfasis]?.nombre ?? ""}</b>
            <span class="ex-meta">${fmtDate(s.fecha)} · ${fmtMin(s.duracionSeg)} · ${s.lugar === "gym" ? "Gimnasio" : "Casa"}${s.rir ? ` · RIR ${s.rir}` : ""}${s.completa ? "" : " · incompleta"}</span>
            ${open.has(s.id) ? html`<div class="detail" style="margin-top:8px">
              <ul>${s.ejercicios.map(e => html`<li>${EXERCISE_BY_ID[e.id]?.nombre ?? e.id} — ${e.completados}/${e.intervalos}${e.reps ? ` · ${e.reps} reps` : ""}${e.peso ? ` · ${e.peso} lb` : ""}${e.molestia ? " · molestia" : ""}</li>`)}</ul>
              ${s.notas ? html`<div class="muted">${s.notas}</div>` : ""}
              <div><button class="btn small danger" data-action="delete" data-id="${s.id}">Borrar sesión</button></div>
            </div>` : ""}
          </div>
          <button class="btn small ghost" data-action="toggle" data-id="${s.id}" aria-expanded="${open.has(s.id)}">${open.has(s.id) ? "Ocultar" : "Ver"}</button>
        </div>`)
      : html`<div class="empty">Todavía no hay sesiones. Cuando termines una, aparecerá aquí.</div>`}
    </section>
  `);

  view.onclick = async e => {
    const t = e.target.closest("[data-action]"); if (!t) return;
    const id = t.dataset.id;
    if (t.dataset.action === "toggle") { open.has(id) ? open.delete(id) : open.add(id); }
    if (t.dataset.action === "delete") {
      const ok = await confirmInPage({ title: "¿Borrar esta sesión?", body: "Se elimina del historial de este dispositivo.", ok: "Borrar", danger: true });
      if (!ok) return;
      deleteSession(id); app.reloadHistory();
    }
    renderHistory(view, app);
  };
}
