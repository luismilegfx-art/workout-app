// Punto de entrada: estado de la app y navegación entre pantallas.
import { getSettings, saveSettings, getHistory } from "./store.js";
import { configureAudio } from "./engine/voice.js";
import { renderSetup } from "./ui/setup.js";
import { renderPreview } from "./ui/preview.js";
import { openPlayer } from "./ui/player.js";
import { renderSummary } from "./ui/summary.js";
import { renderHistory } from "./ui/history.js";
import { renderLibrary } from "./ui/library.js";
import { renderSettings } from "./ui/settings.js";

const view = document.getElementById("view");

export const app = {
  settings: getSettings(),
  history: getHistory(),
  request: null,       // última configuración usada en "Entrenar"
  plan: null,          // rutina generada pendiente de empezar
  result: null,        // sesión terminada pendiente de registrar

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    configureAudio({ voz: this.settings.voz, pitidos: this.settings.pitidos });
  },
  reloadHistory() { this.history = getHistory(); },
  go(route) { if (location.hash === `#${route}`) render(); else location.hash = route; },
  render() { render(); },
  startSession() { openPlayer(this); },
};

const ROUTES = {
  entrenar: () => app.plan ? renderPreview(view, app) : renderSetup(view, app),
  rutina: () => app.plan ? renderPreview(view, app) : renderSetup(view, app),
  resumen: () => app.result ? renderSummary(view, app) : renderSetup(view, app),
  historial: () => renderHistory(view, app),
  biblioteca: () => renderLibrary(view, app),
  ajustes: () => renderSettings(view, app),
};

function render() {
  const route = location.hash.replace("#", "") || "entrenar";
  const fn = ROUTES[route] ?? ROUTES.entrenar;
  const navRoute = ["rutina", "resumen"].includes(route) ? "entrenar" : route;
  document.querySelectorAll(".nav a").forEach(a => a.toggleAttribute("aria-current", a.dataset.route === navRoute));
  document.querySelectorAll(".nav a[aria-current]").forEach(a => a.setAttribute("aria-current", "page"));
  fn();
  window.scrollTo(0, 0);
}

configureAudio({ voz: app.settings.voz, pitidos: app.settings.pitidos });
window.addEventListener("hashchange", render);
render();
