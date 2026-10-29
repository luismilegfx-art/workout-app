// Selector de zonas sobre la figura anatómica (frente y espalda) con tarjeta de subzonas junto al puntero.
import { BODY_FRONT, BODY_BACK } from "../data/body-paths.js";
import { ZONES, ALL_SUBS, PRESETS } from "../data/catalog.js";

// Trazo anatómico → zona.subzona. "split" divide un músculo en dos subzonas.
const MAP = {
  front: {
    chest: { z: "pecho", split: { axis: "y", at: 0.45, a: "superior", b: "medio" } },
    deltoids: { z: "hombros", split: { axis: "x-out", at: 0.5, a: "lateral", b: "anterior" } },
    biceps: { z: "brazos", s: "biceps" }, triceps: { z: "brazos", s: "triceps" }, forearm: { z: "brazos", s: "antebrazo" },
    abs: { z: "abdomen", s: "recto" }, obliques: { z: "abdomen", s: "oblicuos" },
    quadriceps: { z: "piernas", s: "cuadriceps" }, adductors: { z: "piernas", s: "aductores" },
    tibialis: { z: "piernas", s: "pantorrillas" }, calves: { z: "piernas", s: "pantorrillas" },
    trapezius: { z: "espalda", s: "alta" },
  },
  back: {
    trapezius: { z: "espalda", s: "alta" }, "upper-back": { z: "espalda", s: "dorsales" }, "lower-back": { z: "espalda", s: "lumbar" },
    deltoids: { z: "hombros", s: "posterior" }, triceps: { z: "brazos", s: "triceps" }, forearm: { z: "brazos", s: "antebrazo" },
    gluteal: { z: "piernas", s: "gluteos" }, hamstring: { z: "piernas", s: "isquios" },
    adductors: { z: "piernas", s: "aductores" }, calves: { z: "piernas", s: "pantorrillas" },
  },
};
const CENTER_X = { front: 362, back: 1086 };
const NS = "http://www.w3.org/2000/svg";
const K = (z, s) => `${z}.${s}`;

function buildFigure(svg, parts, view) {
  const defs = document.createElementNS(NS, "defs"); svg.appendChild(defs);
  let n = 0;
  for (const part of parts) {
    const map = MAP[view][part.slug];
    for (const d of [...part.left, ...part.right, ...part.common]) {
      const el = document.createElementNS(NS, "path"); el.setAttribute("d", d);
      if (!map) { el.setAttribute("class", "bm-part"); svg.appendChild(el); continue; }
      if (!map.split) { tag(el, map.z, map.s); svg.appendChild(el); continue; }
      svg.appendChild(el); const bb = el.getBBox(); el.remove();
      [map.split.a, map.split.b].forEach((s, i) => {
        const id = `bm-clip-${view}-${n++}`;
        const cp = document.createElementNS(NS, "clipPath"); cp.id = id;
        const r = document.createElementNS(NS, "rect");
        if (map.split.axis === "y") {
          const cut = bb.y + bb.height * map.split.at;
          r.setAttribute("x", bb.x - 5); r.setAttribute("width", bb.width + 10);
          r.setAttribute("y", i === 0 ? bb.y - 5 : cut); r.setAttribute("height", i === 0 ? cut - bb.y + 5 : bb.y + bb.height - cut + 5);
        } else {
          const cut = bb.x + bb.width * map.split.at;
          const outerIsLeft = bb.x + bb.width / 2 < CENTER_X[view];
          const leftPart = i === 0 ? outerIsLeft : !outerIsLeft;
          r.setAttribute("y", bb.y - 5); r.setAttribute("height", bb.height + 10);
          r.setAttribute("x", leftPart ? bb.x - 5 : cut); r.setAttribute("width", leftPart ? cut - bb.x + 5 : bb.x + bb.width - cut + 5);
        }
        cp.appendChild(r); defs.appendChild(cp);
        const copy = el.cloneNode(); copy.setAttribute("clip-path", `url(#${id})`); tag(copy, map.z, s);
        svg.appendChild(copy);
      });
    }
  }
}
function tag(el, z, s) {
  el.setAttribute("class", "bm-m"); el.dataset.z = z; el.dataset.s = s;
  el.setAttribute("tabindex", "0"); el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${ZONES[z].nombre}: ${ZONES[z].subs[s]}`);
}

/**
 * Monta el selector en `root`. `state` = { zonas: {zona: [subs]}, prioridad: ["zona.sub"] } (se modifica en el lugar).
 * Devuelve { destroy } para limpiar listeners al salir de la pantalla.
 */
export function mountBodyMap(root, state, onChange) {
  const prio = new Set(state.prioridad ?? []);
  const sel = state.zonas;
  let open = null, hoverZone = null;
  const wasSelected = {};

  root.innerHTML = `
    <div class="bm">
      <div class="bm-presets" role="group" aria-label="Atajos"><span class="label">Atajos</span>
        ${Object.entries(PRESETS).map(([k, p]) => `<button class="bm-preset" data-p="${k}" aria-pressed="false">${p.nombre}</button>`).join("")}
      </div>
      <div class="bm-stage" data-view="front">
        <div class="bm-toggle" role="group" aria-label="Vista">
          <button data-view="front" aria-pressed="true">Frente</button><button data-view="back" aria-pressed="false">Espalda</button>
        </div>
        <div class="bm-views">
          <div class="bm-fig" data-view="front"><svg viewBox="0 0 724 1448" role="img" aria-label="Cuerpo de frente"></svg><span class="bm-view-name">Frente</span></div>
          <div class="bm-fig" data-view="back"><svg viewBox="724 0 724 1448" role="img" aria-label="Cuerpo de espalda"></svg><span class="bm-view-name">Espalda</span></div>
        </div>
        <div class="bm-picked"></div>
      </div>
    </div>`;
  const [svgF, svgB] = root.querySelectorAll("svg");
  buildFigure(svgF, BODY_FRONT, "front");
  buildFigure(svgB, BODY_BACK, "back");

  const layer = document.getElementById("layer");
  const pop = document.createElement("div"); pop.className = "bm-pop"; pop.hidden = true; pop.setAttribute("role", "dialog");
  const tip = document.createElement("div"); tip.className = "bm-tip"; tip.hidden = true;
  layer.append(pop, tip);

  const commit = () => { state.prioridad = [...prio]; onChange?.(); };
  const samePreset = () => {
    const norm = s => JSON.stringify(Object.keys(s).filter(z => s[z]?.length).sort().map(z => [z, [...s[z]].sort()]));
    return Object.keys(PRESETS).find(k => norm(PRESETS[k].sel) === norm(sel)) ?? null;
  };
  const dropPrio = z => [...prio].forEach(k => k.startsWith(z + ".") && prio.delete(k));

  function paint() {
    root.querySelectorAll(".bm-m").forEach(el => {
      const { z, s } = el.dataset;
      const inc = (sel[z] ?? []).includes(s);
      const pr = prio.has(K(z, s)) || (z === "abdomen" && s === "recto" && prio.has("abdomen.estabilidad"));
      el.classList.toggle("on", inc); el.classList.toggle("prio", inc && pr);
    });
    const preset = samePreset();
    root.querySelectorAll(".bm-preset").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === preset)));
    const zones = Object.keys(ZONES).filter(z => sel[z]?.length);
    root.querySelector(".bm-picked").innerHTML = zones.length
      ? zones.map(z => { const n = [...prio].filter(k => k.startsWith(z + ".")).length;
          return `<button class="chip" data-z="${z}">${ZONES[z].nombre}${n ? `<small>${n === 1 ? "prioridad" : n + " prioridades"}</small>` : ""}</button>`; }).join("")
      : `<span class="muted">Toca una parte del cuerpo o escoge un atajo.</span>`;
    if (open) updatePop();
  }

  function renderPop(z) {
    pop.innerHTML = `<div class="bm-pop-head"><h3>${ZONES[z].nombre}</h3><button class="bm-x" data-act="close">Cerrar</button></div>
      <div class="bm-subs">${Object.entries(ZONES[z].subs).map(([s, label]) => `<div class="bm-sub">
        <button class="bm-sub-toggle" data-act="sub" data-s="${s}" aria-pressed="false">${label}</button>
        <button class="bm-star" data-act="prio" data-s="${s}" aria-pressed="false" aria-label="Priorizar ${label}">Prioridad</button></div>`).join("")}</div>
      <div class="bm-pop-foot"><button class="bm-link" data-act="remove">Quitar zona</button><button class="bm-done" data-act="close">Listo</button></div>
      <span class="bm-note">Los cambios se guardan al momento. Doble clic o Supr quita la zona.</span>`;
    pop.setAttribute("aria-label", `Opciones de ${ZONES[z].nombre}`);
    updatePop();
  }
  function updatePop() {
    const z = open.z;
    pop.querySelectorAll(".bm-sub").forEach(row => {
      const s = row.querySelector(".bm-sub-toggle").dataset.s, inc = (sel[z] ?? []).includes(s);
      row.querySelector(".bm-sub-toggle").setAttribute("aria-pressed", String(inc));
      const star = row.querySelector(".bm-star"); star.setAttribute("aria-pressed", String(prio.has(K(z, s)))); star.disabled = !inc;
    });
  }
  function openPop(z, x, y) {
    open = { z }; renderPop(z); pop.hidden = false;
    if (matchMedia("(max-width: 640px)").matches) { pop.style.left = ""; pop.style.top = ""; return; }
    const w = pop.offsetWidth, h = pop.offsetHeight, pad = 12;
    let left = x + 18; if (left + w > innerWidth - pad) left = x - w - 18;
    const top = Math.max(pad, Math.min(y - 40, innerHeight - h - pad));
    pop.style.left = `${Math.max(pad, left)}px`; pop.style.top = `${top}px`;
  }
  function closePop() { open = null; pop.hidden = true; }
  function removeZone(z) { delete sel[z]; dropPrio(z); if (open?.z === z) closePop(); paint(); commit(); }
  function choose(el, x, y) {
    const { z } = el.dataset;
    if (!sel[z]?.length) { sel[z] = [...ALL_SUBS[z]]; commit(); }
    paint(); openPop(z, x, y);
  }

  pop.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b || !open) return;
    const z = open.z, s = b.dataset.s;
    if (b.dataset.act === "close") return closePop();
    if (b.dataset.act === "remove") return removeZone(z);
    if (b.dataset.act === "sub") {
      const list = sel[z] ??= [];
      if (list.includes(s)) { sel[z] = list.filter(x => x !== s); prio.delete(K(z, s)); if (!sel[z].length) delete sel[z]; }
      else list.push(s);
    }
    if (b.dataset.act === "prio") prio.has(K(z, s)) ? prio.delete(K(z, s)) : prio.add(K(z, s));
    paint(); commit();
  });

  for (const svg of [svgF, svgB]) {
    svg.addEventListener("click", e => {
      const el = e.target.closest(".bm-m"); if (!el) return;
      if (e.detail <= 1) wasSelected[el.dataset.z] = !!sel[el.dataset.z]?.length;
      if (e.detail === 2) return;
      choose(el, e.clientX, e.clientY);
    });
    svg.addEventListener("dblclick", e => { const el = e.target.closest(".bm-m"); if (el && wasSelected[el.dataset.z]) removeZone(el.dataset.z); });
    svg.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("bm-m")) {
        e.preventDefault(); const r = e.target.getBoundingClientRect(); choose(e.target, r.right, r.top + r.height / 2);
      }
    });
    svg.addEventListener("pointermove", e => {
      const el = e.target.closest(".bm-m");
      root.querySelectorAll(".bm-m.hover").forEach(p => p.classList.remove("hover"));
      if (!el || e.pointerType !== "mouse") { tip.hidden = true; hoverZone = null; return; }
      hoverZone = el.dataset.z;
      root.querySelectorAll(`.bm-m[data-z="${el.dataset.z}"]`).forEach(p => p.classList.add("hover"));
      tip.textContent = `${ZONES[el.dataset.z].nombre} · ${ZONES[el.dataset.z].subs[el.dataset.s]}`;
      tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`; tip.hidden = false;
    });
    svg.addEventListener("pointerleave", () => { hoverZone = null; tip.hidden = true; root.querySelectorAll(".bm-m.hover").forEach(p => p.classList.remove("hover")); });
  }

  root.querySelector(".bm-presets").addEventListener("click", e => {
    const b = e.target.closest(".bm-preset"); if (!b) return;
    const active = b.getAttribute("aria-pressed") === "true";
    for (const z of Object.keys(sel)) delete sel[z];
    if (!active) Object.assign(sel, structuredClone(PRESETS[b.dataset.p].sel));
    [...prio].forEach(k => { const [z, s] = k.split("."); if (!sel[z]?.includes(s)) prio.delete(k); });
    closePop(); paint(); commit();
  });
  root.querySelector(".bm-picked").addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    e.stopPropagation(); const r = c.getBoundingClientRect(); openPop(c.dataset.z, r.left + r.width / 2, r.top - 120);
  });
  root.querySelector(".bm-toggle").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    root.querySelector(".bm-stage").dataset.view = b.dataset.view;
    root.querySelectorAll(".bm-toggle button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  });

  const onDown = e => { if (open && !pop.contains(e.target) && !e.target.closest(".bm-m, .chip")) closePop(); };
  const onKey = e => {
    if (e.key === "Escape") return closePop();
    if ((e.key === "Delete" || e.key === "Backspace") && !e.target.closest("input, textarea")) {
      const z = open?.z ?? (hoverZone && sel[hoverZone]?.length ? hoverZone : null) ?? document.activeElement?.dataset?.z;
      if (z && sel[z]?.length) { e.preventDefault(); removeZone(z); }
    }
  };
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey);
  paint();

  return {
    destroy() {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      pop.remove(); tip.remove();
    },
  };
}
