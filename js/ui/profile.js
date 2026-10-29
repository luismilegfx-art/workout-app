// Perfil: datos de entrenamiento, presets de equipo, audio, ejercicios evitados, parámetros del generador y copia de seguridad.
import { html, mount, toast, confirmInPage } from "./dom.js";
import { EQUIPMENT, EMPHASES, LEVELS } from "../data/catalog.js";
import { EXERCISE_BY_ID } from "../data/exercises.js";
import { exportData, importData, resetParams, getSettings } from "../store.js";

const THEME_KEY = "wa.theme";
export function applyTheme() {
  let t = "sistema"; try { t = localStorage.getItem(THEME_KEY) ?? "sistema"; } catch {}
  if (t === "sistema") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  return t;
}
applyTheme();

const FORMAT_LABELS = { fuerza: "Fuerza", masa: "Masa", condicion: "Condición", expres: "Exprés" };

export function renderProfile(view, app) {
  const s = app.settings, p = s.params;
  const theme = applyTheme();
  const num = (id, label, value, suffix, attrs = "") => html`<div class="field">
    <label class="label" for="${id}">${label}</label>
    <div class="row" style="flex-wrap:nowrap"><input class="input" type="number" id="${id}" data-param="${id}" value="${value}" ${attrs}><span class="muted">${suffix}</span></div></div>`;

  mount(view, html`
    <div class="spread"><h1>Perfil</h1></div>

    <div class="grid-2">
      <section class="card">
        <h3>Perfil</h3>
        <span class="label">Nivel</span>
        <div class="seg" role="group" aria-label="Nivel">${Object.entries(LEVELS).map(([k, v]) =>
          html`<button data-action="level" data-value="${k}" aria-pressed="${s.nivel === Number(k)}">${v}</button>`)}</div>
        <span class="label">Prioridades de entrenamiento</span>
        <div class="chips">${Object.entries(EMPHASES).map(([k, v]) =>
          html`<button class="chip" data-action="goal" data-value="${k}" aria-pressed="${s.objetivos.includes(k)}">${v.nombre}</button>`)}</div>
        <div class="field" style="max-width:220px">
          <label class="label" for="metaSemanal">Meta semanal</label>
          <div class="row" style="flex-wrap:nowrap"><input class="input" type="number" id="metaSemanal" min="1" max="14" value="${s.metaSemanal ?? 4}"><span class="muted">sesiones</span></div>
        </div>
        <span class="label">Unidad de peso</span>
        <span>Libras (lb)</span>
      </section>

      <section class="card">
        <h3>Pantalla y audio</h3>
        <span class="label">Tema</span>
        <div class="seg" role="group" aria-label="Tema">${[["sistema", "Sistema"], ["dark", "Oscuro"], ["light", "Claro"]].map(([k, v]) =>
          html`<button data-action="theme" data-value="${k}" aria-pressed="${theme === k}">${v}</button>`)}</div>
        <label class="check"><input type="checkbox" id="opt-voz" ${s.voz ? "checked" : ""}> Voz guía</label>
        <label class="check"><input type="checkbox" id="opt-pitidos" ${s.pitidos ? "checked" : ""}> Pitidos de cuenta regresiva</label>
      </section>
    </div>

    <section class="card">
      <div class="spread"><h3>Equipo para entrenar en casa</h3><span class="muted" style="font-size:.85rem">Crear presets nuevos: próximamente</span></div>
      ${s.presetsEquipo.map(p => html`<div class="stack" style="gap:6px">
        <b>${p.nombre}${p.id === s.presetActivo ? html` <span class="tag accent">En uso</span>` : ""}</b>
        <div class="chips">${Object.entries(EQUIPMENT).filter(([k]) => !["maquina", "polea"].includes(k)).map(([k, v]) =>
          html`<button class="chip" data-action="equip" data-preset="${p.id}" data-value="${k}" aria-pressed="${p.equipo.includes(k)}" ${k === "corporal" ? "disabled" : ""}>${v}</button>`)}</div>
      </div>`)}
    </section>

    <section class="card">
      <h3>Ejercicios evitados por molestias</h3>
      ${s.evitar.length ? html`<ul class="ex-list">${s.evitar.map(id => html`<li class="ex-item">
        <span>${EXERCISE_BY_ID[id]?.nombre ?? id}</span>
        <button class="btn small" data-action="unavoid" data-value="${id}">Volver a incluir</button></li>`)}</ul>`
      : html`<span class="muted">Ninguno. Al registrar una sesión puedes marcar un ejercicio con molestia y la app dejará de proponerlo.</span>`}
    </section>

    <section class="card">
      <div class="spread"><h3>Parámetros del generador</h3><button class="btn small" data-action="reset">Restablecer valores iniciales</button></div>
      <div class="params">
        ${num("calentamientoPct", "Calentamiento", p.calentamientoPct, "%", 'min="0" max="30"')}
        ${num("estiramientoPct", "Estiramiento", p.estiramientoPct, "%", 'min="0" max="30"')}
        ${num("pasoCalentamiento", "Por ejercicio de calentamiento", p.pasoCalentamiento, "s", 'min="15" max="90" step="5"')}
        ${num("pasoEstiramiento", "Por estiramiento", p.pasoEstiramiento, "s", 'min="15" max="90" step="5"')}
        ${num("exprésHasta", "Exprés hasta", p.exprésHasta, "min", 'min="4" max="15"')}
        ${num("margenTiempo", "Margen sobre el tiempo", p.margenTiempo, "%", 'min="1" max="15"')}
      </div>
      <div class="table-wrap">
        <table class="fmt">
          <thead><tr><th>Formato</th><th>Trabajo (s)</th><th>Descanso (s)</th><th>Entre rondas (s)</th><th>Rondas</th><th>Ejercicios por bloque</th></tr></thead>
          <tbody>${Object.entries(p.formatos).map(([k, f]) => html`<tr>
            <th>${FORMAT_LABELS[k]}</th>
            <td><input class="input" type="number" step="5" data-fmt="${k}.trabajo.0" value="${f.trabajo[0]}" aria-label="${FORMAT_LABELS[k]} trabajo mínimo"> – <input class="input" type="number" step="5" data-fmt="${k}.trabajo.1" value="${f.trabajo[1]}" aria-label="${FORMAT_LABELS[k]} trabajo máximo"></td>
            <td><input class="input" type="number" step="5" data-fmt="${k}.descanso.0" value="${f.descanso[0]}" aria-label="${FORMAT_LABELS[k]} descanso mínimo"> – <input class="input" type="number" step="5" data-fmt="${k}.descanso.1" value="${f.descanso[1]}" aria-label="${FORMAT_LABELS[k]} descanso máximo"></td>
            <td><input class="input" type="number" step="5" data-fmt="${k}.descansoRonda" value="${f.descansoRonda}" aria-label="${FORMAT_LABELS[k]} descanso entre rondas"></td>
            <td><input class="input" type="number" data-fmt="${k}.rondas.0" value="${f.rondas[0]}" aria-label="${FORMAT_LABELS[k]} rondas mínimas"> – <input class="input" type="number" data-fmt="${k}.rondas.1" value="${f.rondas[1]}" aria-label="${FORMAT_LABELS[k]} rondas máximas"></td>
            <td><input class="input" type="number" data-fmt="${k}.porBloque.0" value="${f.porBloque[0]}" aria-label="${FORMAT_LABELS[k]} ejercicios mínimos"> – <input class="input" type="number" data-fmt="${k}.porBloque.1" value="${f.porBloque[1]}" aria-label="${FORMAT_LABELS[k]} ejercicios máximos"></td>
          </tr>`)}</tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>Copia de seguridad</h3>
      <span class="muted">Tus datos se guardan en este dispositivo y navegador. Exporta una copia para pasarlos a otro dispositivo.</span>
      <div class="row">
        <button class="btn" data-action="export">Exportar datos</button>
        <label class="btn" for="import-file">Importar datos</label>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
    </section>
  `);

  view.onclick = async e => {
    const t = e.target.closest("[data-action]"); if (!t) return;
    const v = t.dataset.value;
    switch (t.dataset.action) {
      case "level": app.updateSettings({ nivel: Number(v) }); break;
      case "goal": {
        const set = new Set(s.objetivos); set.has(v) ? set.delete(v) : set.add(v);
        if (!set.size) { toast("Deja al menos un objetivo activo"); return; }
        app.updateSettings({ objetivos: [...set] }); break;
      }
      case "equip": {
        const presetsEquipo = s.presetsEquipo.map(p => {
          if (p.id !== t.dataset.preset) return p;
          const set = new Set(p.equipo); set.has(v) ? set.delete(v) : set.add(v); set.add("corporal");
          return { ...p, equipo: [...set] };
        });
        app.updateSettings({ presetsEquipo }); break;
      }
      case "theme": try { localStorage.setItem(THEME_KEY, v); } catch {} break;
      case "unavoid": app.updateSettings({ evitar: s.evitar.filter(id => id !== v) }); break;
      case "reset": {
        const ok = await confirmInPage({ title: "¿Restablecer parámetros?", body: "Vuelven los valores iniciales del generador. Tu historial no cambia.", ok: "Restablecer" });
        if (!ok) return;
        resetParams(); app.settings = getSettings(); toast("Parámetros restablecidos"); break;
      }
      case "export": {
        const blob = new Blob([exportData()], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = `workout-app-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return;
      }
      default: return;
    }
    renderProfile(view, app);
  };

  view.onchange = async e => {
    const t = e.target;
    if (t.id === "opt-voz") return app.updateSettings({ voz: t.checked });
    if (t.id === "opt-pitidos") return app.updateSettings({ pitidos: t.checked });
    if (t.id === "metaSemanal") { const n = Number(t.value); if (n >= 1 && n <= 14) { app.updateSettings({ metaSemanal: n }); toast("Guardado"); } return; }
    if (t.id === "import-file" && t.files[0]) {
      try {
        importData(await t.files[0].text());
        app.settings = getSettings(); app.reloadHistory(); toast("Datos importados"); renderProfile(view, app);
      } catch (err) { toast(err.message || "No se pudo leer el archivo"); }
      return;
    }
    if (t.dataset.param) {
      const value = Number(t.value); if (!Number.isFinite(value)) return;
      app.updateSettings({ params: { ...p, [t.dataset.param]: value } });
      toast("Guardado");
    }
    if (t.dataset.fmt) {
      const [k, field, idx] = t.dataset.fmt.split(".");
      const value = Number(t.value); if (!Number.isFinite(value) || value < 0) return;
      const formatos = structuredClone(p.formatos);
      if (idx === undefined) formatos[k][field] = value; else formatos[k][field][Number(idx)] = value;
      const [lo, hi] = Array.isArray(formatos[k][field]) ? formatos[k][field] : [0, 1];
      if (lo > hi) { toast("El mínimo no puede ser mayor que el máximo"); renderProfile(view, app); return; }
      app.updateSettings({ params: { ...p, formatos } });
      toast("Guardado");
    }
  };
}
