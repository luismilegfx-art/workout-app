// Reproductor: pantalla de entrenamiento guiado por tiempo, legible a distancia.
// En los descansos se anota lo que se hizo en el intervalo anterior (precargado; se guarda solo).
import { html, fmtClock, confirmInPage, toast } from "./dom.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { EQUIPMENT } from "../data/catalog.js";
import { SessionRunner } from "../engine/runner.js";
import { say, beep, unlockAudio, stopSpeech } from "../engine/voice.js";
import { swapExercise, buildSteps, sumSteps } from "../engine/generator.js";
import { createLog, markDone, canLogIn, settle, update, PAUSE_OPTIONS, DEFAULT_REPS } from "../engine/session-log.js";
import { techCard } from "./technique.js";
import { lastLogFor } from "../store.js";
import { keepAwake, releaseAwake } from "../engine/keep-awake.js";

const STATE = { preparacion: "prep", calentamiento: "aux", estiramiento: "aux", trabajo: "work" };
const WORKISH = ["trabajo", "calentamiento", "estiramiento", "aproximacion"];
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const nameOf = id => EXERCISE_BY_ID[id]?.nombre ?? "";
const round5 = v => Math.max(5, Math.round(v / 5) * 5);
const repsText = o => o[0] === o[1] ? `${o[0]}` : `${o[0]}–${o[1]}`;

function announce(step, prev) {
  const e = EXERCISE_BY_ID[step.ejercicio];
  switch (step.tipo) {
    case "preparacion": return `Prepárate. Primero: ${nameOf(step.siguiente)}`;
    case "calentamiento": return step.paso === 1 ? `Calentamiento. ${e.nombre}` : e.nombre;
    case "estiramiento": return step.paso === 1 ? `Estiramiento. ${e.nombre}` : e.nombre;
    case "aproximacion": return `Aproximación ${step.paso} de ${step.pasos}. ${e.nombre}. ${step.objetivo[0]} repeticiones ligeras`;
    case "trabajo": {
      if (step.serie && step.objetivo) return `Serie ${step.ronda + 1} de ${step.rondas}. ${e.nombre}. ${step.objetivo[0]} a ${step.objetivo[1]} repeticiones`;
      if (step.serie) return `Serie ${step.ronda + 1} de ${step.rondas}. ${e.nombre}`;
      const newRound = step.slot === 0 && step.ronda > 0 && prev?.tipo === "descanso-ronda";
      return newRound ? `Ronda ${step.ronda + 1}. ${e.nombre}` : e.nombre;
    }
    case "transicion": return `Cambia el equipo. Próximo: ${nameOf(step.siguiente)}`;
    case "descanso-ronda": return `Descanso. Luego ronda ${step.ronda + 2}`;
    case "cambio-bloque": return `Cambio de bloque. Próximo: ${nameOf(step.siguiente)}`;
    default: return step.siguiente ? `Descanso. Próximo: ${nameOf(step.siguiente)}` : "Descanso";
  }
}

export function openPlayer(app) {
  const plan = app.plan;
  const minLog = app.settings.params.registroMinDescanso ?? 15;
  const layer = document.getElementById("layer");
  const root = document.createElement("div");
  root.className = "player"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Sesión en curso");
  layer.appendChild(root);
  document.body.style.overflow = "hidden";

  const log = createLog();
  let shown = [];          // intervalos que se están anotando en este descanso
  let started = false, lastIndex = 0;

  const markWork = i => {
    const s = plan.steps[i];
    if (s?.tipo === "trabajo") markDone(log, s, lastLogFor(s.ejercicio));
  };

  const runner = new SessionRunner(plan.steps, {
    step: (s, i) => {
      const forward = i > lastIndex, prev = plan.steps[lastIndex];
      if (started && forward) {
        settle(log, shown);
        if (prev && prev !== s) markWork(lastIndex);
      }
      shown = started && canLogIn(s, minLog) ? [...log.pending] : [];
      lastIndex = i;
      draw();
      if (!started) return;
      if (forward && prev && WORKISH.includes(prev.tipo) && !prev.abierto && !WORKISH.includes(s.tipo)) beep("stop");
      if (WORKISH.includes(s.tipo)) beep("go");
      say(announce(s, plan.steps[i - 1]));
    },
    tick: () => drawClock(),
    cue: (name, s) => {
      if (name.startsWith("cuenta-") && !WORKISH.includes(s.tipo)) beep("tick");
      if (name === "cambio-lado") { beep("side"); say("Cambia de lado"); }
      if (name === "diez") say("Diez segundos", { interrupt: false });
    },
    finish: stats => { markWork(runner.index); close(stats, true); },
  });

  const totalLeft = () => Math.max(0, runner.totalSec - runner.elapsedTotalSec);

  function drawClock() {
    const s = runner.step; if (!s) return;
    const clock = root.querySelector(".p-clock");
    if (clock) clock.textContent = fmtClock(runner.remainingMs / 1000);
    const bar = root.querySelector(".p-progress > i");
    if (bar) bar.style.width = `${Math.min(100, runner.elapsedTotalSec / runner.totalSec * 100)}%`;
    const left = root.querySelector("[data-left]");
    if (left) left.textContent = `${fmtClock(totalLeft())} restantes`;
    const el = root.querySelector("[data-elapsed]");
    if (el) el.textContent = fmtClock(runner.openElapsedMs / 1000);
    const side = root.querySelector("[data-side]");
    if (side) side.textContent = runner.remainingMs / 1000 > s.duracion / 2 ? "Primer lado" : "Segundo lado";
    root.dataset.paused = String(runner.paused);
  }

  // ───── Panel de registro ─────
  function stepperHTML(i, field, value, unit, label) {
    return html`<div class="stp" data-i="${i}" data-field="${field}">
      <button class="stp-b" data-log="dec" aria-label="Menos ${label}">−</button>
      <input class="stp-v" type="number" inputmode="decimal" id="log-${field}-${i}" value="${value ?? ""}" placeholder="—" aria-label="${label}">
      <button class="stp-b" data-log="inc" aria-label="Más ${label}">+</button>
      <span class="stp-u">${unit}</span>
    </div>`;
  }
  function logPanel() {
    if (!shown.length) return "";
    return html`<div class="logp">
      <div class="logp-head"><span class="label">Anota lo que hiciste</span><span class="muted">Se guarda solo</span></div>
      ${shown.map(i => {
        const x = log.entries[i], e = EXERCISE_BY_ID[x.id], st = plan.steps[i];
        return html`<div class="logp-row">
          <div class="logp-name"><b>${e.nombre}</b><span class="muted">${st.rondas > 1 ? `${st.serie ? "Serie" : "Ronda"} ${st.ronda + 1}` : ""}</span></div>
          ${x.medida === "tiempo"
            ? html`<div class="pauses" role="group" aria-label="Pausas en ${e.nombre}">${PAUSE_OPTIONS.map(o =>
                html`<button class="chip" data-log="pausas" data-i="${i}" data-v="${o.v}" aria-pressed="${x.pausas === o.v}">${o.label}</button>`)}</div>`
            : stepperHTML(i, "reps", x.reps, "reps", `repeticiones de ${e.nombre}`)}
          ${e.carga ? stepperHTML(i, "peso", x.peso, "lb", `peso de ${e.nombre}`) : ""}
        </div>`;
      })}
    </div>`;
  }
  function setValue(i, field, v) {
    update(log, i, { [field]: v });
    const input = root.querySelector(`#log-${field}-${i}`);
    if (input && document.activeElement !== input) input.value = v ?? "";
  }

  // En Fuerza, lo siguiente suele ser otra serie del mismo ejercicio: se dice así en vez de repetir el nombre
  function seriesNext(s) {
    const rest = plan.steps[runner.index + 1];
    const after = plan.steps.slice(runner.index + 1).find(x => WORKISH.includes(x.tipo));
    if (!after) return "fin de la sesión";
    const restTxt = rest && !WORKISH.includes(rest.tipo) ? `descanso ${fmtClock(rest.duracion)} · ` : "";
    if (after.ejercicio !== s.ejercicio) return `${restTxt}${nameOf(after.ejercicio)}`;
    if (after.tipo === "aproximacion") return `${restTxt}aproximación ${after.paso} de ${after.pasos}`;
    return `${restTxt}serie ${after.ronda + 1} de ${after.rondas}`;
  }

  function draw() {
    const s = runner.step ?? plan.steps[0];
    const isWork = WORKISH.includes(s.tipo);
    const shownId = isWork ? s.ejercicio : s.siguiente;
    const ex = EXERCISE_BY_ID[shownId];
    root.dataset.state = STATE[s.tipo] ?? "rest";
    const open = !!s.abierto;
    const nextWork = plan.steps.slice(runner.index + 1).find(x => WORKISH.includes(x.tipo));
    const last = ex?.carga ? lastLogFor(ex.id) : null;
    const weightNote = !ex?.carga || !isWork ? ""
      : s.tipo === "aproximacion" ? (last?.peso ? `≈ ${round5(last.peso * s.pct / 100)} lb · ${s.pct}% del peso de trabajo` : `Ligero: ${s.pct}% de tu peso de trabajo`)
      : s.serie && last?.peso ? `Peso de referencia: ${last.peso} lb` : "";
    const phase = s.tipo === "aproximacion" ? `${s.fase} · Aproximación ${s.paso}/${s.pasos}`
      : s.serie ? `${s.fase} · Serie ${s.ronda + 1}/${s.rondas}`
      : s.tipo === "trabajo" ? `${s.fase} · Ronda ${s.ronda + 1}/${s.rondas}`
      : isWork ? `${s.fase} · ${s.paso}/${s.pasos}`
      : s.tipo === "preparacion" ? "Prepárate"
      : s.tipo === "transicion" ? "Cambio de equipo"
      : s.tipo === "cambio-bloque" ? "Cambio de bloque" : "Descanso";
    const nextAfter = isWork ? s.siguiente : plan.steps.slice(runner.index + 1).find(x => x.ejercicio && x.ejercicio !== s.siguiente)?.ejercicio;
    const canSwap = ex && ex.tipo === "principal";
    const equipNote = s.tipo === "transicion" && ex ? `Prepara: ${ex.equipo.filter(q => q !== "corporal").map(q => EQUIPMENT[q]).join(", ")}` : "";
    const workLabel = s.tipo === "aproximacion" ? "Aproximación" : s.serie ? `Serie ${s.ronda + 1} de ${s.rondas}`
      : s.tipo === "trabajo" ? (ex?.medida === "tiempo" ? "Sostén" : "Trabajo") : s.fase;

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
          <span class="p-phase">${isWork ? workLabel : (s.tipo === "preparacion" ? "Empieza en" : "Descanso")}</span>
          ${open ? html`<div class="p-target"><span class="p-target-v">${repsText(s.objetivo)}</span><span class="p-target-u">${s.tipo === "aproximacion" ? "reps ligeras" : "reps"}</span></div>
              <div class="p-next">Tiempo en la serie: <b class="mono" data-elapsed>0</b></div>`
            : html`<div class="p-clock" aria-live="off">${fmtClock(runner.remainingMs / 1000 || s.duracion)}</div>`}
          <div class="p-name">${isWork ? ex?.nombre : html`<span class="muted">Próximo:</span> ${ex?.nombre ?? "Fin"}`}</div>
          ${isWork && s.cambioLado ? html`<div class="p-next"><b data-side></b> · cambia a la mitad</div>` : ""}
          ${!isWork && nextWork && (nextWork.serie || nextWork.tipo === "aproximacion") ? html`<div class="p-next"><b>${nextWork.tipo === "aproximacion"
              ? `Aproximación ${nextWork.paso} de ${nextWork.pasos}` : `Serie ${nextWork.ronda + 1} de ${nextWork.rondas}`}</b>${nextWork.objetivo ? ` · ${repsText(nextWork.objetivo)} reps` : ""}</div>` : ""}
          ${weightNote ? html`<div class="p-next p-weight">${weightNote}</div>` : ""}
          ${equipNote ? html`<div class="p-next">${equipNote}</div>` : ""}
          ${isWork && (s.serie || s.tipo === "aproximacion") ? html`<div class="p-next">Después: <b>${seriesNext(s)}</b></div>`
            : isWork && nextAfter ? html`<div class="p-next">Después: <b>${nameOf(nextAfter)}</b></div>` : ""}
        </div>
        <div class="p-side">
          ${logPanel()}
          ${ex ? techCard(ex, { last: open ? null : last }) : ""}
          ${canSwap ? html`<div class="row"><button class="btn small" data-action="swap" data-id="${ex.id}">Cambiar este ejercicio</button>
            ${!isWork ? html`<button class="btn small" data-action="more">+15 s de descanso</button>` : ""}</div>` : ""}
        </div>
      </div>
      <div class="p-controls">
        ${started && open ? html`
          <button class="btn" data-action="prev" aria-label="Anterior">Anterior</button>
          <button class="btn primary p-play p-done" data-action="next">${s.tipo === "aproximacion" ? "Hecho" : "Serie completada"}</button>`
        : started ? html`
          <button class="btn" data-action="prev" aria-label="Anterior">Anterior</button>
          <button class="btn primary p-play" data-action="toggle">${runner.paused ? "Seguir" : "Pausa"}</button>
          <button class="btn" data-action="next" aria-label="Siguiente">Siguiente</button>`
        : html`<div class="stack" style="align-items:center;gap:6px">
            <button class="btn primary p-play" data-action="begin">Comenzar</button>
            ${isIOS ? html`<span class="muted" style="font-size:.8rem">Si no escuchas los sonidos, revisa que el iPhone no esté en silencio.</span>` : ""}
          </div>`}
      </div>`);
    drawClock();
  }

  async function close(stats, finished) {
    runner.stop(); stopSpeech();
    if (finished) { beep("end"); say("Sesión completada. Buen trabajo."); }
    releaseAwake();
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = "";
    root.remove();
    if (!stats) return;
    app.result = { plan, stats, finished, log };
    app.plan = null;
    app.go("resumen");
  }

  function onKey(e) {
    if (!started || e.target.closest("input, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); if (runner.isOpen) runner.next(); else { runner.toggle(); draw(); } }
    if (e.code === "ArrowRight") runner.next();
    if (e.code === "ArrowLeft") runner.prev();
  }

  root.addEventListener("change", e => {
    const input = e.target.closest(".stp-v"); if (!input) return;
    const box = input.closest(".stp");
    setValue(Number(box.dataset.i), box.dataset.field, input.value === "" ? null : Math.max(0, Number(input.value)));
  });

  root.addEventListener("click", async e => {
    const lg = e.target.closest("[data-log]");
    if (lg) {
      if (lg.dataset.log === "pausas") {
        const i = Number(lg.dataset.i);
        update(log, i, { pausas: Number(lg.dataset.v) });
        lg.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === lg)));
        return;
      }
      const box = lg.closest(".stp"), i = Number(box.dataset.i), field = box.dataset.field;
      const cur = log.entries[i][field];
      const step = field === "peso" ? 5 : 1, dir = lg.dataset.log === "inc" ? 1 : -1;
      const next = cur == null ? (field === "reps" ? DEFAULT_REPS : 0) : Math.max(0, cur + dir * step);
      setValue(i, field, next);
      return;
    }
    const t = e.target.closest("[data-action]"); if (!t) return;
    switch (t.dataset.action) {
      case "begin":
        unlockAudio(); keepAwake(); started = true;
        runner.start(0);
        break;
      case "toggle": runner.toggle(); stopSpeech(); draw(); break;
      case "next": runner.next(); break;
      case "prev": runner.prev(); break;
      case "more": runner.addTime(15); toast("+15 s"); break;
      case "swap": {
        const newId = swapExercise(plan, t.dataset.id, app.settings);
        if (!newId) { toast("No hay otro ejercicio disponible para esa zona"); return; }
        // Un unilateral nuevo cambia la duración: se reconstruye la línea de tiempo manteniendo la posición
        const fresh = buildSteps(plan, app.settings);
        if (fresh.length === plan.steps.length) fresh.forEach((st, k) => Object.assign(plan.steps[k], st));
        plan.totalSec = sumSteps(plan.steps);
        say(`Cambio: ${nameOf(newId)}`); draw(); break;
      }
      case "end": {
        if (!started) { close(null, false); app.go("rutina"); return; }
        const wasPaused = runner.paused; runner.pause(); draw();
        const ok = await confirmInPage({ title: "¿Terminar la sesión?", body: "Podrás revisar y completar lo anotado.", ok: "Terminar", cancel: "Seguir entrenando" });
        if (ok) { markWork(runner.index); close({ inicio: runner.startedAt, fin: new Date(), completados: [...runner.completed], hastaPaso: runner.index }, false); }
        else { if (!wasPaused) runner.resume(); draw(); }
        break;
      }
    }
  });
  document.addEventListener("keydown", onKey);
  draw();
}
