// Reproductor: pantalla de entrenamiento guiado por tiempo, legible a distancia.
import { html, fmtClock, confirmInPage, toast } from "./dom.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { EQUIPMENT } from "../data/catalog.js";
import { SessionRunner } from "../engine/runner.js";
import { say, beep, unlockAudio, stopSpeech } from "../engine/voice.js";
import { swapExercise } from "../engine/generator.js";
import { techCard } from "./technique.js";
import { lastLogFor } from "../store.js";

const STATE = { preparacion: "prep", calentamiento: "aux", estiramiento: "aux", trabajo: "work" };
const WORKISH = ["trabajo", "calentamiento", "estiramiento"];
let wakeLock = null;

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
}
function onVisibility() { if (document.visibilityState === "visible" && wakeLock === null) keepAwake(); }

function nameOf(id) { return EXERCISE_BY_ID[id]?.nombre ?? ""; }

function announce(step, prev) {
  const e = EXERCISE_BY_ID[step.ejercicio];
  switch (step.tipo) {
    case "preparacion": return `Prepárate. Primero: ${nameOf(step.siguiente)}`;
    case "calentamiento": return step.paso === 1 ? `Calentamiento. ${e.nombre}` : e.nombre;
    case "estiramiento": return step.paso === 1 ? `Estiramiento. ${e.nombre}` : e.nombre;
    case "trabajo": {
      const newRound = step.slot === 0 && step.ronda > 0 && prev?.tipo === "descanso-ronda";
      return newRound ? `Ronda ${step.ronda + 1}. ${e.nombre}` : e.nombre;
    }
    case "transicion": {
      const next = EXERCISE_BY_ID[step.siguiente];
      return `Cambia el equipo. Próximo: ${next?.nombre ?? ""}`;
    }
    case "descanso-ronda": return `Descanso. Luego ronda ${step.ronda + 2}`;
    case "cambio-bloque": return `Cambio de bloque. Próximo: ${nameOf(step.siguiente)}`;
    default: return step.siguiente ? `Descanso. Próximo: ${nameOf(step.siguiente)}` : "Descanso";
  }
}

export function openPlayer(app) {
  const plan = app.plan;
  const layer = document.getElementById("layer");
  const root = document.createElement("div");
  root.className = "player"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Sesión en curso");
  layer.appendChild(root);
  document.body.style.overflow = "hidden";

  let started = false;
  const runner = new SessionRunner(plan.steps, {
    step: (s, i) => {
      draw();
      if (!started) return;
      say(announce(s, plan.steps[i - 1]));
      if (s.tipo === "trabajo" && i > 0 && !WORKISH.includes(plan.steps[i - 1].tipo)) beep("go");
    },
    tick: () => drawClock(),
    cue: (name, s, data) => {
      if (name.startsWith("cuenta-")) beep("tick");
      if (name === "cambio-lado") say("Cambia de lado");
      if (name === "diez") say("Diez segundos", { interrupt: false });
    },
    finish: stats => close(stats, true),
  });

  function totalLeft() { return Math.max(0, runner.totalSec - runner.elapsedTotalSec); }

  function drawClock() {
    const s = runner.step; if (!s) return;
    const clock = root.querySelector(".p-clock");
    if (clock) clock.textContent = fmtClock(runner.remainingMs / 1000);
    const bar = root.querySelector(".p-progress > i");
    if (bar) bar.style.width = `${Math.min(100, runner.elapsedTotalSec / runner.totalSec * 100)}%`;
    const left = root.querySelector("[data-left]");
    if (left) left.textContent = `${fmtClock(totalLeft())} restantes`;
    root.dataset.paused = String(runner.paused);
  }

  function draw() {
    const s = runner.step ?? plan.steps[0];
    const isWork = WORKISH.includes(s.tipo);
    const shownId = isWork ? s.ejercicio : s.siguiente;
    const shown = EXERCISE_BY_ID[shownId];
    const state = STATE[s.tipo] ?? "rest";
    root.dataset.state = state;
    const phase = s.tipo === "trabajo" ? `${s.fase} · Ronda ${s.ronda + 1}/${s.rondas}`
      : isWork ? `${s.fase} · ${s.paso}/${s.pasos}`
      : s.tipo === "preparacion" ? "Prepárate"
      : s.tipo === "transicion" ? "Cambio de equipo"
      : s.tipo === "cambio-bloque" ? "Cambio de bloque" : "Descanso";
    const nextAfter = isWork ? s.siguiente : plan.steps.slice(runner.index + 1).find(x => x.ejercicio && x.ejercicio !== s.siguiente)?.ejercicio;
    const canSwap = shown && shown.tipo === "principal";
    const equipNote = s.tipo === "transicion" && shown ? `Prepara: ${shown.equipo.filter(q => q !== "corporal").map(q => EQUIPMENT[q]).join(", ")}` : "";

    root.innerHTML = String(html`
      <div>
        <div class="p-top">
          <span class="label">${phase}</span>
          <div class="row">
            <span class="muted mono" data-left></span>
            <button class="btn small" data-action="end">Terminar</button>
          </div>
        </div>
        <div class="p-progress"><i></i></div>
      </div>
      <div class="p-body">
        <div class="p-main">
          <span class="p-phase">${isWork ? (s.tipo === "trabajo" ? "Trabajo" : s.fase) : (s.tipo === "preparacion" ? "Empieza en" : "Descanso")}</span>
          <div class="p-clock" aria-live="off">${fmtClock(runner.remainingMs / 1000 || s.duracion)}</div>
          <div class="p-name">${isWork ? shown?.nombre : html`<span class="muted">Próximo:</span> ${shown?.nombre ?? "Fin"}`}</div>
          ${equipNote ? html`<div class="p-next">${equipNote}</div>` : ""}
          ${isWork && nextAfter ? html`<div class="p-next">Después: <b>${nameOf(nextAfter)}</b></div>` : ""}
        </div>
        <div class="p-side">
          ${shown ? techCard(shown, { last: shown.carga ? lastLogFor(shown.id) : null }) : ""}
          ${canSwap ? html`<div class="row"><button class="btn small" data-action="swap" data-id="${shown.id}">Cambiar este ejercicio</button>
            ${!isWork ? html`<button class="btn small" data-action="more">+15 s de descanso</button>` : ""}</div>` : ""}
        </div>
      </div>
      <div class="p-controls">
        ${started ? html`
          <button class="btn" data-action="prev" aria-label="Anterior">Anterior</button>
          <button class="btn primary p-play" data-action="toggle">${runner.paused ? "Seguir" : "Pausa"}</button>
          <button class="btn" data-action="next" aria-label="Siguiente">Siguiente</button>`
        : html`<button class="btn primary p-play" data-action="begin">Comenzar</button>`}
      </div>`);
    drawClock();
  }

  async function close(stats, finished) {
    runner.stop(); stopSpeech();
    if (finished) { say("Sesión completada. Buen trabajo."); beep("end"); }
    try { await wakeLock?.release(); } catch {}
    wakeLock = null;
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = "";
    root.remove();
    if (!stats) return;
    app.result = { plan, stats, finished };
    app.plan = null;
    app.go("resumen");
  }

  function onKey(e) {
    if (!started || e.target.closest("input, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); runner.toggle(); draw(); }
    if (e.code === "ArrowRight") runner.next();
    if (e.code === "ArrowLeft") runner.prev();
  }

  root.addEventListener("click", async e => {
    const t = e.target.closest("[data-action]"); if (!t) return;
    switch (t.dataset.action) {
      case "begin":
        unlockAudio(); keepAwake(); started = true;
        document.addEventListener("visibilitychange", onVisibility);
        runner.start(0);
        break;
      case "toggle": runner.toggle(); stopSpeech(); draw(); break;
      case "next": runner.next(); break;
      case "prev": runner.prev(); break;
      case "more": runner.addTime(15); toast("+15 s"); break;
      case "swap": {
        const newId = swapExercise(plan, t.dataset.id, app.settings);
        if (!newId) { toast("No hay otro ejercicio disponible para ese grupo"); return; }
        say(`Cambio: ${nameOf(newId)}`); draw(); break;
      }
      case "end": {
        if (!started) { close(null, false); app.go("rutina"); return; }
        const wasPaused = runner.paused; runner.pause(); draw();
        const ok = await confirmInPage({ title: "¿Terminar la sesión?", body: "Podrás registrar lo que completaste.", ok: "Terminar", cancel: "Seguir entrenando" });
        if (ok) close({ inicio: runner.startedAt, fin: new Date(), completados: [...runner.completed], hastaPaso: runner.index }, false);
        else { if (!wasPaused) runner.resume(); draw(); }
        break;
      }
    }
  });
  document.addEventListener("keydown", onKey);
  draw();
}
