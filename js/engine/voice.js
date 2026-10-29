// Voz (síntesis en español) y pitidos (Web Audio). Ambos se activan tras el primer toque del usuario.

let audioCtx = null;
let spanishVoice = null;
let enabled = { voz: true, pitidos: true };

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

export function configureAudio(opts) { enabled = { ...enabled, ...opts }; }

// Llamar desde un toque del usuario (los navegadores bloquean el audio hasta entonces)
export function unlockAudio() {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { audioCtx = null; }
  if ("speechSynthesis" in window) {           // iOS necesita una primera frase dentro del gesto
    const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u);
  }
}

export function say(text, { interrupt = true } = {}) {
  if (!enabled.voz || !("speechSynthesis" in window) || !text) return;
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = spanishVoice?.lang ?? "es-US";
  if (spanishVoice) u.voice = spanishVoice;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

export function stopSpeech() { if ("speechSynthesis" in window) speechSynthesis.cancel(); }

export function beep(kind = "tick") {
  if (!enabled.pitidos || !audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  const freq = { tick: 660, go: 990, end: 520 }[kind] ?? 660;
  const len = kind === "tick" ? 0.12 : 0.35;
  osc.frequency.value = freq; osc.type = "sine";
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + len + 0.02);
}
