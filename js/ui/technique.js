// Tarjeta de técnica reutilizada en la vista previa, el reproductor y la biblioteca.
import { html } from "./dom.js";
import { MUSCLES, EQUIPMENT } from "../data/catalog.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";

export function techCard(e, { compact = false, last = null } = {}) {
  if (!e) return "";
  const variants = [e.facil && `Más fácil: ${EXERCISE_BY_ID[e.facil]?.nombre}`, e.dificil && `Más difícil: ${EXERCISE_BY_ID[e.dificil]?.nombre}`].filter(Boolean);
  return html`
    <div class="${compact ? "detail" : "tech"}">
      ${compact ? "" : html`<span class="label">Técnica</span>`}
      <ul>${e.tecnica.map(t => html`<li>${t}</li>`)}</ul>
      <div class="resp"><b>Respiración:</b> ${e.respiracion}</div>
      <div class="err"><b>Error común:</b> ${e.error}</div>
      ${e.unilateral ? html`<div class="muted">Unilateral: cambia de lado a la mitad del tiempo.</div>` : ""}
      ${last ? html`<div class="muted">Última vez: ${last.peso ? `${last.peso} lb` : ""}${last.peso && last.reps ? " · " : ""}${last.reps ? `${last.reps} reps` : ""}</div>` : ""}
      ${compact ? html`<div class="muted" style="font-size:.85rem">${[MUSCLES[e.musculo], ...e.secundarios.map(m => MUSCLES[m])].filter(Boolean).join(", ")} · ${e.equipo.map(q => EQUIPMENT[q]).join(", ")}${variants.length ? ` · ${variants.join(" · ")}` : ""}</div>`
        : html`<div class="pain">Si sientes dolor (no cansancio), detente y cambia el ejercicio.</div>`}
    </div>`;
}
