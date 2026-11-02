// Mantener la pantalla encendida durante la sesión.
// Usa la API Wake Lock; en iPhone además reproduce un video negro, mudo y en bucle (respaldo para versiones
// de iOS y apps en la pantalla de inicio donde la API no funciona). Debe llamarse desde un toque del usuario.
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let lock = null, video = null, active = false;

async function requestLock() {
  try {
    if (!("wakeLock" in navigator)) return false;
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener?.("release", () => { lock = null; });
    return true;
  } catch { lock = null; return false; }
}

function startVideo() {
  if (!video) {
    video = document.createElement("video");
    video.src = "assets/keep-awake.mp4";
    video.muted = true; video.loop = true; video.playsInline = true;
    video.setAttribute("muted", ""); video.setAttribute("playsinline", ""); video.setAttribute("aria-hidden", "true");
    Object.assign(video.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px", opacity: "0.01", pointerEvents: "none" });
    document.body.appendChild(video);
  }
  video.play().catch(() => {});
}

function onVisible() {
  if (!active || document.visibilityState !== "visible") return;
  if (!lock) requestLock();
  if (video) video.play().catch(() => {});
}

export async function keepAwake() {
  active = true;
  const ok = await requestLock();
  if (isIOS || !ok) startVideo();
  document.addEventListener("visibilitychange", onVisible);
}

export async function releaseAwake() {
  active = false;
  document.removeEventListener("visibilitychange", onVisible);
  try { await lock?.release(); } catch {}
  lock = null;
  if (video) { video.pause(); video.remove(); video = null; }
}
