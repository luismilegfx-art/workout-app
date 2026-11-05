// Voz (síntesis en español) y pitidos (Web Audio). Ambos se activan tras el primer toque del usuario.

import { sayRecorded, unlockVoicePack, loadVoicePack } from "./voicepack.js";
loadVoicePack();

let audioCtx = null, master = null;
let spanishVoice = null;
let enabled = { voz: true, pitidos: true, volumen: 1.6 };
// Estado de la voz del navegador: "desconocido" · "ok" · "no-responde" (algunos navegadores la dejan colgada)
let voiceState = "desconocido";
export const voiceStatus = () => voiceState;

function loadVoice() {
  if (!("speechSynthesis" in window)) return;
  const voices = speechSynthesis.getVoices();
  spanishVoice = voices.find(v => /^es(-|_)(US|MX|419|PR)/i.test(v.lang))
    ?? voices.find(v => /^es/i.test(v.lang)) ?? null;
}
if ("speechSynthesis" in window) {
  loadVoice();
  speechSynthesis.addEventListener?.("voiceschanged", loadVoice);
}

export function configureAudio(opts) {
  enabled = { ...enabled, ...opts };
  if (master) master.gain.value = enabled.volumen ?? 1.6;
}

// Llamar desde un toque del usuario (los navegadores bloquean el audio hasta entonces)
export function unlockAudio() {
  unlockVoicePack();          // dentro del mismo toque: habilita el audio grabado en iPhone
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Volumen general con compresor: se puede subir sin que el sonido se rompa
      const comp = audioCtx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 6;
      master = audioCtx.createGain(); master.gain.value = enabled.volumen ?? 1.6;
      master.connect(comp).connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { audioCtx = null; }
  if ("speechSynthesis" in window) {           // iOS necesita una primera frase dentro del gesto
    const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u);
  }
}

export function say(text, { interrupt = true, force = false } = {}) {
  if ((!enabled.voz && !force) || !text) return;
  // Primero la voz grabada de la app (suena igual en todos los dispositivos, sin retraso y en silencio del iPhone)
  if (sayRecorded(text, { interrupt })) { setVoiceState("ok"); return; }
  if (!("speechSynthesis" in window)) return;
  // Cancelar solo si está hablando: en Chrome, cancelar justo antes de hablar a veces pierde la frase
  if (interrupt && speechSynthesis.speaking) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = spanishVoice?.lang ?? "es-US";
  if (spanishVoice) u.voice = spanishVoice;
  u.rate = 1.05;
  // Vigilancia: si la frase no empieza en 2 s, la voz del navegador no responde
  let started = false;
  u.onstart = () => { started = true; setVoiceState("ok"); };
  u.onerror = e => { if (e.error !== "interrupted" && e.error !== "canceled") setVoiceState("no-responde"); };
  setTimeout(() => { if (!started && voiceState !== "ok") setVoiceState("no-responde"); }, 2000);
  speechSynthesis.speak(u);
}
function setVoiceState(st) {
  if (st === voiceState) return;
  voiceState = st;
  window.dispatchEvent(new CustomEvent("voz-estado", { detail: st }));
}

export function stopSpeech() { if ("speechSynthesis" in window) speechSynthesis.cancel(); }

// Sonidos de la sesión, distintos para reconocerlos sin mirar la pantalla:
// tick: cuenta 3-2-1 · go: empieza un ejercicio · stop: termina un ejercicio · side: cambia de lado · end: fin de la sesión
const SOUNDS = {
  tick: [[740, 0, 0.12, 0.30]],
  go:   [[880, 0, 0.10, 0.35], [1320, 0.10, 0.40, 0.40]],
  stop: [[880, 0, 0.16, 0.35], [587, 0.16, 0.30, 0.35]],
  side: [[660, 0, 0.10, 0.25], [660, 0.16, 0.10, 0.25]],
  end:  [[523, 0, 0.18, 0.35], [659, 0.18, 0.18, 0.35], [784, 0.36, 0.45, 0.40]],
};

export function beep(kind = "tick") {
  if (!enabled.pitidos || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  for (const [freq, at, len, vol] of SOUNDS[kind] ?? SOUNDS.tick) {
    const t = t0 + at;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.frequency.value = freq; osc.type = "triangle";      // más presencia que una onda pura, sin sonar áspero
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(master ?? audioCtx.destination);
    osc.start(t); osc.stop(t + len + 0.02);
  }
}
