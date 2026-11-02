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
    osc.frequency.value = freq; osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + len + 0.02);
  }
}
