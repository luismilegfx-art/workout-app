// Voz grabada: frases generadas una vez como audio (herramientas/voz) y reproducidas por su clave.
// Se usan en lugar de la voz del navegador cuando existen todas las partes de una frase; si falta alguna, se usa la del navegador.
// En iPhone se reproducen con un elemento de audio, que suena aunque el teléfono esté en modo silencio.
const BASE = new URL("../../assets/voz/", import.meta.url);

let manifest = null, el = null, queue = [], playing = false, loading = null;

/** Clave de una frase: minúsculas, sin signos sueltos ni espacios de más. */
export function keyOf(s) {
  return String(s).toLowerCase().replace(/[¡!¿?"“”]/g, "").replace(/[.,:;]+$/g, "").replace(/\s+/g, " ").trim();
}

/** Para pruebas: usar un manifiesto ya leído. */
export function setManifest(m) { manifest = m; }

export function loadVoicePack() {
  if (manifest || loading) return loading;
  loading = fetch(new URL("manifest.json", BASE)).then(r => r.ok ? r.json() : null).then(m => { manifest = m; }).catch(() => {});
  return loading;
}

/** Desbloquea el audio dentro de un toque (requisito de iPhone): un clip de silencio en el mismo elemento que se reutiliza. */
export function unlockVoicePack() {
  try {
    el ??= new Audio();
    el.src = new URL("silencio.mp3", BASE).href;
    el.play().catch(() => {});
  } catch {}
  loadVoicePack();
}

/** Archivos para decir un texto completo, o null si falta alguna parte. Las partes se separan por punto o dos puntos. */
export function clipsFor(text) {
  if (!manifest) return null;
  const whole = manifest[keyOf(text)];
  if (whole) return [whole];
  // Por oraciones; una oración que no exista entera se intenta por partes separadas con dos puntos
  const files = [];
  for (const sentence of String(text).split(/\.\s+|\.$/).map(t => t.trim()).filter(Boolean)) {
    const f = manifest[keyOf(sentence)];
    if (f) { files.push(f); continue; }
    for (const part of sentence.split(/:\s*/).map(keyOf).filter(Boolean)) {
      if (!manifest[part]) return null;
      files.push(manifest[part]);
    }
  }
  return files.length ? files : null;
}

/** Reproduce los clips en orden. interrupt corta lo que esté sonando. Devuelve false si no hay voz grabada para el texto. */
export function sayRecorded(text, { interrupt = true } = {}) {
  const files = clipsFor(text);
  if (!files) return false;
  el ??= new Audio();
  if (interrupt) { queue = []; if (playing) { el.pause(); playing = false; } }
  queue.push(...files);
  if (!playing) next();
  return true;
}
function next() {
  const f = queue.shift();
  if (!f) { playing = false; return; }
  playing = true;
  el.onended = () => setTimeout(next, 40);
  el.onerror = () => next();
  el.src = new URL(f, BASE).href;
  el.play().catch(() => { playing = false; queue = []; });
}

/** Precarga los nombres que sonarán en la sesión para que no haya espera. */
export function preload(texts) {
  if (!manifest) return;
  for (const t of texts) for (const f of clipsFor(t) ?? []) { const a = new Audio(); a.preload = "auto"; a.src = new URL(f, BASE).href; }
}
