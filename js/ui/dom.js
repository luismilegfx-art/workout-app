// Utilidades de interfaz: plantillas con escape automático y formato.

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(s);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ESC[c]);

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  if (v === false || v === null || v === undefined) return "";
  return esc(v);
}

// html`<p>${texto}</p>` escapa los valores; anida otros html`` sin escaparlos
export function html(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => { out += s + (i < vals.length ? render(vals[i]) : ""); });
  return raw(out);
}

export function mount(el, content) { el.innerHTML = String(content); }

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : String(s);
}
export function fmtMin(sec) {
  const m = Math.round(sec / 60);
  return `${m} min`;
}
export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("es-PR", { weekday: "short", day: "numeric", month: "short" });
}

export function toast(text) {
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// Confirmación dentro de la página (los diálogos del navegador no siempre están disponibles)
export function confirmInPage({ title, body, ok = "Confirmar", cancel = "Cancelar", danger = false }) {
  return new Promise(resolve => {
    const layer = document.getElementById("layer");
    const wrap = document.createElement("div");
    wrap.className = "overlay-confirm";
    wrap.innerHTML = String(html`<div class="card" role="dialog" aria-modal="true" aria-labelledby="cf-t">
      <h3 id="cf-t">${title}</h3>${body ? html`<p class="muted" style="margin:0">${body}</p>` : ""}
      <div class="row" style="justify-content:flex-end">
        <button class="btn" data-r="0">${cancel}</button>
        <button class="btn ${danger ? "danger" : "primary"}" data-r="1">${ok}</button>
      </div></div>`);
    layer.appendChild(wrap);
    wrap.querySelector('[data-r="1"]').focus();
    wrap.addEventListener("click", e => {
      const r = e.target.closest("[data-r]")?.dataset.r ?? (e.target === wrap ? "0" : null);
      if (r === null) return;
      wrap.remove(); resolve(r === "1");
    });
  });
}
