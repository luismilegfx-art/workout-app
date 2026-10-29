// Ejecución de una rutina: avanza por los pasos usando marcas de tiempo reales,
// así el reloj no se desfasa aunque el navegador frene los temporizadores.

export class SessionRunner {
  /**
   * @param {Array} steps  pasos de la rutina (buildSteps)
   * @param {object} on    { step(step, i), tick(secLeft, step, i), cue(name, step, data), finish(stats) }
   */
  constructor(steps, on = {}) {
    this.steps = steps;
    this.on = on;
    this.index = -1;
    this.paused = false;
    this.endsAt = 0;          // ms (performance.now) en que termina el paso actual
    this.pausedLeft = 0;      // ms restantes guardados al pausar
    this.lastSec = null;
    this.fired = new Set();
    this.startedAt = null;
    this.completed = new Set();   // índices de pasos de trabajo terminados sin saltar
    this.timer = null;
  }

  get step() { return this.steps[this.index]; }
  get remainingMs() { return this.paused ? this.pausedLeft : Math.max(0, this.endsAt - performance.now()); }
  get elapsedTotalSec() {
    const done = this.steps.slice(0, Math.max(0, this.index)).reduce((t, s) => t + s.duracion, 0);
    return done + (this.step ? this.step.duracion - this.remainingMs / 1000 : 0);
  }
  get totalSec() { return this.steps.reduce((t, s) => t + s.duracion, 0); }

  start(at = 0) {
    this.startedAt = this.startedAt ?? new Date();
    this.goTo(at);
    this.timer = setInterval(() => this.tick(), 100);
  }

  goTo(i) {
    if (i >= this.steps.length) return this.finish();
    this.index = Math.max(0, i);
    this.fired = new Set(); this.lastSec = null;
    const ms = this.step.duracion * 1000;
    if (this.paused) this.pausedLeft = ms; else this.endsAt = performance.now() + ms;
    this.on.step?.(this.step, this.index);
    this.tick();
  }

  tick() {
    if (!this.step) return;
    const left = this.remainingMs;
    const sec = Math.ceil(left / 1000);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.on.tick?.(sec, this.step, this.index);
      const s = this.step;
      const isWork = s.ejercicio && ["trabajo", "calentamiento", "estiramiento"].includes(s.tipo);
      if (!this.paused) {
        if (sec <= 3 && sec >= 1 && s.duracion > 4) this.cue(`cuenta-${sec}`, { n: sec, trabajo: isWork });
        if (isWork && s.cambioLado && sec === Math.ceil(s.duracion / 2)) this.cue("cambio-lado");
        if (s.tipo === "trabajo" && s.duracion >= 30 && sec === 10) this.cue("diez");
      }
    }
    if (!this.paused && left <= 0) {
      if (this.step.tipo === "trabajo") this.completed.add(this.index);
      this.goTo(this.index + 1);
    }
  }

  cue(name, data) {
    if (this.fired.has(name)) return;
    this.fired.add(name);
    this.on.cue?.(name, this.step, data);
  }

  pause() { if (this.paused) return; this.pausedLeft = this.remainingMs; this.paused = true; this.on.tick?.(Math.ceil(this.pausedLeft / 1000), this.step, this.index); }
  resume() { if (!this.paused) return; this.endsAt = performance.now() + this.pausedLeft; this.paused = false; }
  toggle() { this.paused ? this.resume() : this.pause(); return this.paused; }
  next() { this.goTo(this.index + 1); }
  prev() {
    // Si el paso lleva más de 3 s, reinicia el paso; si no, vuelve al anterior
    const elapsed = this.step.duracion - this.remainingMs / 1000;
    this.goTo(elapsed > 3 ? this.index : this.index - 1);
  }
  addTime(sec) {
    if (this.paused) this.pausedLeft += sec * 1000; else this.endsAt += sec * 1000;
    this.step.duracion += sec; this.lastSec = null; this.tick();
  }

  stop() { clearInterval(this.timer); this.timer = null; }
  finish() {
    this.stop();
    this.on.finish?.({ inicio: this.startedAt, fin: new Date(), completados: [...this.completed], hastaPaso: this.index });
  }
}
