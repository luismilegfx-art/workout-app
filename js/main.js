// Punto de entrada: estado de la app y navegación entre secciones.
import { getSettings, saveSettings, getHistory } from "./store.js";
import { configureAudio } from "./engine/voice.js";
import { renderProgress } from "./ui/progress.js";
import { renderRoutines } from "./ui/routines.js";
import { renderTrain, leaveTrain, newRequest } from "./ui/train.js";
import { renderPreview } from "./ui/preview.js";
import { openPlayer } from "./ui/player.js";
import { renderSummary } from "./ui/summary.js";
import { renderLibrary } from "./ui/library.js";
import { renderProfile } from "./ui/profile.js";

const view = document.getElementById("view");

export const app = {
  settings: getSettings(),
  history: getHistory(),
  request: null,       // flujo de Entrenar en curso
  plan: null,          // rutina generada o cargada, pendiente de empezar
  result: null,        // sesión terminada pendiente de registrar

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    configureAudio({ voz: this.settings.voz, pitidos: this.settings.pitidos });
  },
  reloadHistory() { this.history = getHistory(); },
  go(route) { if (location.hash === `#${route}`) render(); else location.hash = route; },
  newTraining() { this.request = newRequest(this); this.plan = null; this.go("entrenar"); },
  startSession() { openPlayer(this); },
};

// Sección de la barra a la que pertenece cada pantalla
const ROUTES = {
  progreso:   { tab: "progreso",   render: () => renderProgress(view, app) },
  rutinas:    { tab: "rutinas",    render: () => renderRoutines(view, app) },
  entrenar:   { tab: "entrenar",   render: () => renderTrain(view, app) },
  rutina:     { tab: "entrenar",   render: () => app.plan ? renderPreview(view, app) : renderTrain(view, app) },
  resumen:    { tab: "entrenar",   render: () => app.result ? renderSummary(view, app) : renderProgress(view, app) },
  biblioteca: { tab: "biblioteca", render: () => renderLibrary(view, app) },
  perfil:     { tab: "perfil",     render: () => renderProfile(view, app) },
};

function render() {
  const name = location.hash.replace("#", "") || "progreso";
  const route = ROUTES[name] ?? ROUTES.progreso;
  if (name !== "entrenar") leaveTrain();
  document.querySelectorAll(".tabs a").forEach(a => {
    if (a.dataset.route === route.tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  view.onclick = view.onchange = view.oninput = null;
  route.render();
  window.scrollTo(0, 0);
}

configureAudio({ voz: app.settings.voz, pitidos: app.settings.pitidos });
window.addEventListener("hashchange", render);
render();
