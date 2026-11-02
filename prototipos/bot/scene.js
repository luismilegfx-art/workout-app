// Escena 3D del bot: figura robótica de segmentos entre articulaciones, accesorios y capas de puntos clave.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BODY } from "./rig.js";

const C = {
  bg: 0x0f1112, shell: 0x8a949c, shellDark: 0x4a535a, joint: 0x2a3036,
  accent: 0xc9a25b, glow: 0xf2c879, fixed: 0x7fa3bd, line: 0xece8e1, iron: 0x2a2f33, plate: 0x1a1d20, chrome: 0x9aa3aa,
};
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

function shellMat(color = C.shell) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.32, emissive: C.accent, emissiveIntensity: 0 });
}

export function createBot(canvas, labelLayer) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  // Reflejos suaves de estudio para que el metal se lea (sin esto, el metal se ve negro)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.minDistance = 1.4; controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotateSpeed = 1.2;

  // Luces: principal con sombra, relleno frío y contraluz cálido
  scene.add(new THREE.HemisphereLight(0xc8d0d6, 0x0b0c0d, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.2, 4.2, 2.8); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1, near: 0.5, far: 12 });
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd9a0, 1.4); rim.position.set(-2.5, 2.2, -3); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9fb6c8, 0.5); fill.position.set(-3, 1, 2); scene.add(fill);

  // Solo la sombra en el suelo (sin piso visible)
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.38 }));
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.receiveShadow = true; scene.add(shadowPlane);

  // ───── Figura ─────
  const robot = new THREE.Group(); scene.add(robot);
  const parts = {};
  const add = (name, mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.base = mesh.material.color.clone(); mesh.name = name; robot.add(mesh); parts[name] = mesh; return mesh; };
  const accentColor = new THREE.Color(0xd9a441);
  const cyl = (r1, r2, seg = 24) => new THREE.CylinderGeometry(r1, r2, 1, seg, 1);
  const sphere = r => new THREE.SphereGeometry(r, 32, 20);

  const limbs = [
    ["thighL", "hipL", "kneeL", 0.068, 0.054], ["thighR", "hipR", "kneeR", 0.068, 0.054],
    ["shinL", "kneeL", "ankleL", 0.052, 0.038], ["shinR", "kneeR", "ankleR", 0.052, 0.038],
    ["upperArmL", "shoulderL", "elbowL", 0.048, 0.040], ["upperArmR", "shoulderR", "elbowR", 0.048, 0.040],
    ["forearmL", "elbowL", "wristL", 0.040, 0.030], ["forearmR", "elbowR", "wristR", 0.040, 0.030],
    ["neck", "chest", "neck", 0.042, 0.038],
  ];
  for (const [name, , , r1, r2] of limbs) add(name, new THREE.Mesh(cyl(r2, r1), shellMat()));
  const jointBalls = { kneeL: 0.058, kneeR: 0.058, elbowL: 0.044, elbowR: 0.044, ankleL: 0.042, ankleR: 0.042, wristL: 0.033, wristR: 0.033, hipL: 0.07, hipR: 0.07 };
  for (const [n, r] of Object.entries(jointBalls)) add(`j_${n}`, new THREE.Mesh(sphere(r), shellMat(C.joint)));
  add("shoulderL", new THREE.Mesh(sphere(0.068), shellMat()));
  add("shoulderR", new THREE.Mesh(sphere(0.068), shellMat()));
  add("chest", new THREE.Mesh(sphere(1), shellMat()));
  add("abdomen", new THREE.Mesh(cyl(0.105, 0.12), shellMat(C.shellDark)));
  add("pelvis", new THREE.Mesh(sphere(1), shellMat()));
  add("head", new THREE.Mesh(sphere(1), shellMat()));
  const visor = add("visor", new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.024, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x1a1308, emissive: C.glow, emissiveIntensity: 1.6, roughness: 0.3 })));
  visor.castShadow = false;
  for (const s of ["L", "R"]) {
    add(`foot${s}`, new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shellMat(C.shellDark)));
    add(`hand${s}`, new THREE.Mesh(sphere(1), shellMat(C.shellDark)));
  }

  const tmpM = new THREE.Matrix4();
  function segment(mesh, a, b) {
    const d = b.clone().sub(a), len = d.length();
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(Y, d.normalize());
    mesh.scale.set(1, len, 1);
  }
  function oriented(mesh, center, l, u, f, sx, sy, sz) {
    tmpM.makeBasis(l, u, f);
    mesh.quaternion.setFromRotationMatrix(tmpM);
    mesh.position.copy(center); mesh.scale.set(sx, sy, sz);
  }

  // ───── Accesorios ─────
  const props = new THREE.Group(); scene.add(props);
  const ironMat = new THREE.MeshStandardMaterial({ color: C.iron, metalness: 0.8, roughness: 0.32 });
  const plateMat = new THREE.MeshStandardMaterial({ color: C.plate, metalness: 0.4, roughness: 0.55 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: C.chrome, metalness: 0.95, roughness: 0.2 });
  const shadowy = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  function makeBarbell() {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.0, 16), chromeMat); bar.rotation.z = Math.PI / 2; g.add(bar);
    for (const s of [-1, 1]) {
      for (const [x, r, w] of [[0.80, 0.225, 0.045], [0.86, 0.225, 0.045], [0.91, 0.16, 0.03]]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 40), plateMat); p.rotation.z = Math.PI / 2; p.position.x = x * s; g.add(p);
      }
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), chromeMat); collar.rotation.z = Math.PI / 2; collar.position.x = 0.75 * s; g.add(collar);
    }
    return shadowy(g);
  }
  function makeDumbbell() {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 12), chromeMat); h.rotation.z = Math.PI / 2; g.add(h);
    for (const s of [-1, 1]) { const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 6), ironMat); head.rotation.z = Math.PI / 2; head.position.x = 0.10 * s; g.add(head); }
    return shadowy(g);
  }
  let barbell = null, dumbbells = [], mat = null, wall = null;

  function setProps(list, ex) {
    props.clear(); barbell = null; dumbbells = []; mat = null; wall = null;
    if (list.includes("barbell")) { barbell = makeBarbell(); props.add(barbell); }
    if (list.includes("dumbbells")) { dumbbells = [makeDumbbell(), makeDumbbell()]; dumbbells.forEach(d => props.add(d)); }
    if (list.includes("mat")) {
      mat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.008, 1.95), new THREE.MeshStandardMaterial({ color: 0x1d2226, roughness: 0.9 }));
      mat.position.set(0, 0.004, 0.75); mat.receiveShadow = true; props.add(mat);
    }
    if (list.includes("wall")) {
      wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.85 }));
      wall.position.set(0, 1.15, ex.wallZ - 0.04); wall.receiveShadow = true; props.add(wall);
    }
  }

  // ───── Capas de puntos clave ─────
  const overlay = new THREE.Group(); scene.add(overlay);
  const ringGeo = new THREE.RingGeometry(0.062, 0.074, 48);
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C.fixed, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    m.renderOrder = 10; overlay.add(m); return m;
  });
  const lineMat = new THREE.LineDashedMaterial({ color: C.line, dashSize: 0.035, gapSize: 0.025, transparent: true, opacity: 0.7, depthTest: false });
  const lines = [0, 1, 2].map(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
    const l = new THREE.Line(g, lineMat); l.renderOrder = 9; overlay.add(l); return l;
  });
  const arrowMat = new THREE.MeshBasicMaterial({ color: C.glow, transparent: true, depthTest: false });
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.16, 12), arrowMat); shaft.position.y = 0.08;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 20), arrowMat); tip.position.y = 0.19;
  arrow.add(shaft, tip); arrow.renderOrder = 11; shaft.renderOrder = tip.renderOrder = 11; overlay.add(arrow);

  // Etiquetas HTML proyectadas sobre la escena
  const labels = [0, 1, 2, 3, 4].map(() => { const d = document.createElement("div"); d.className = "tag3d"; d.hidden = true; labelLayer.appendChild(d); return d; });
  let placed = [];
  function placeLabel(i, text, p, dx = 14, dy = -10) {
    const el = labels[i]; if (!text) { el.hidden = true; return; }
    const s = p.clone().project(camera);
    if (s.z > 1) { el.hidden = true; return; }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    el.textContent = text; el.hidden = false;
    let x = (s.x * 0.5 + 0.5) * w + dx, y = (-s.y * 0.5 + 0.5) * h + dy;
    const bw = el.offsetWidth || 160, bh = 24;
    for (let guard = 0; guard < 6 && placed.some(r => x < r.x + r.w && x + bw > r.x && y < r.y + r.h && y + bh > r.y); guard++) y += bh + 4;
    x = Math.min(Math.max(4, x), w - bw - 4);
    placed.push({ x, y, w: bw, h: bh });
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ───── Cámara ─────
  let viewAnim = null;
  function spherical(target, az, el, dist) {
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    return new THREE.Vector3(target.x + dist * Math.sin(a) * Math.cos(e), target.y + dist * Math.sin(e), target.z + dist * Math.cos(a) * Math.cos(e));
  }
  let currentView = null, userMoved = false;
  // Distancia para que el ejercicio quepa completo según el ancho y alto de la pantalla
  function fitDist(radius) {
    const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
    return radius / Math.sin(Math.min(v, h)) * 1.05;
  }
  function setView({ az, el, dist, target, radius }, instant = false) {
    currentView = { az, el, dist, target, radius };
    const tgt = new THREE.Vector3(...target);
    const to = spherical(tgt, az, el, radius ? fitDist(radius) : dist);
    if (instant) { controls.target.copy(tgt); camera.position.copy(to); controls.update(); return; }
    viewAnim = { from: camera.position.clone(), fromT: controls.target.clone(), to, toT: tgt, t: 0 };
  }
  controls.addEventListener("start", () => { viewAnim = null; userMoved = true; });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (currentView && !userMoved && !viewAnim) setView(currentView, true);   // reencuadrar al cambiar el tamaño
    }
  }

  // ───── Actualización por cuadro ─────
  const camRight = new THREE.Vector3();
  function update({ j, props: pp }, ex, opts, info) {
    // Extremidades y articulaciones
    for (const [name, a, b] of limbs) segment(parts[name], j[a], j[b]);
    for (const n of Object.keys(jointBalls)) parts[`j_${n}`].position.copy(j[n]);
    parts.shoulderL.position.copy(j.shoulderL); parts.shoulderR.position.copy(j.shoulderR);
    const { l, u, f } = j.basis;
    const mid = j.pelvis.clone().addScaledVector(u, 0.30);
    oriented(parts.chest, j.chest.clone().addScaledVector(u, -0.11).addScaledVector(f, 0.005), l, u, f, 0.205, 0.165, 0.125);
    segment(parts.abdomen, j.pelvis.clone().addScaledVector(u, 0.07), mid);
    oriented(parts.pelvis, j.pelvis.clone().addScaledVector(u, 0.03), l, u, f, 0.165, 0.10, 0.115);
    const hu = j.head.clone().sub(j.neck).normalize(), hf = f.clone().addScaledVector(hu, -f.dot(hu)).normalize(), hl = hu.clone().cross(hf);
    oriented(parts.head, j.head, hl, hu, hf, 0.098, 0.118, 0.108);
    oriented(parts.visor, j.head.clone().addScaledVector(hf, 0.095).addScaledVector(hu, 0.012), hl, hu, hf, 1, 1, 1);
    for (const s of ["L", "R"]) {
      const heel = j[`heel${s}`], toe = j[`toe${s}`], ft = toe.clone().sub(heel), len = ft.length();
      const fdir = ft.clone().normalize(), fl = Y.clone().cross(fdir).normalize(), fu = fdir.clone().cross(fl).normalize();
      oriented(parts[`foot${s}`], heel.clone().add(toe).multiplyScalar(0.5).addScaledVector(fu, 0.025), fl, fu, fdir, 0.085, 0.055, len + 0.02);
      const w = j[`wrist${s}`], h = j[`hand${s}`], hd = h.clone().sub(w).normalize();
      const hl2 = (Math.abs(hd.dot(l)) > 0.9 ? f : l).clone().cross(hd).normalize(), hu2 = hd.clone().cross(hl2).normalize();
      oriented(parts[`hand${s}`], w.clone().add(h).multiplyScalar(0.5), hl2, hu2, hd, 0.04, 0.025, 0.055);
    }

    // Accesorios
    if (barbell && pp.barbell) { barbell.position.copy(pp.barbell.center); barbell.quaternion.setFromUnitVectors(X, pp.barbell.axis.clone().normalize()); }
    if (dumbbells.length && pp.dumbbells) pp.dumbbells.forEach((d, i) => { dumbbells[i].position.copy(d.center); dumbbells[i].quaternion.setFromUnitVectors(X, d.axis); });

    // Músculo trabajado: se tiñe de latón y brilla más cuando el esfuerzo de la fase es mayor
    const k = opts.musculo ? 0.45 + 0.5 * info.esfuerzo * (0.9 + 0.1 * Math.sin(info.time * 6)) : 0;
    for (const p of Object.values(parts)) {
      if (p === parts.visor) continue;
      const on = opts.musculo && ex.musculos.includes(p.name);
      p.material.color.copy(p.userData.base); p.material.emissiveIntensity = 0;
      if (on) { p.material.color.lerp(accentColor, Math.min(1, k + 0.25)); p.material.emissiveIntensity = 0.12 + 0.45 * info.esfuerzo; }
    }

    // Articulaciones que no deben moverse
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    rings.forEach((r, i) => {
      const fx = opts.fijas ? ex.fijas[i] : null;
      r.visible = !!fx;
      if (fx) { r.position.copy(j[fx.joint]); r.quaternion.copy(camera.quaternion); r.material.opacity = 0.65 + 0.35 * Math.sin(info.time * 3); }
    });

    // Flecha de dirección: sigue la velocidad del punto clave
    const showArrow = opts.flecha && ex.flecha && info.vel && info.vel.length() > 0.02;
    arrow.visible = !!showArrow;
    if (showArrow) {
      const dir = info.vel.clone().normalize();
      arrow.position.copy(j[ex.flecha]).addScaledVector(camRight, 0.30);
      arrow.quaternion.setFromUnitVectors(Y, dir);
      arrowMat.opacity = Math.min(1, info.vel.length() * 3);
    }

    // Líneas de alineación
    const segs = opts.lineas && ex.lineas ? ex.lineas(j, { j, props: pp }) : [];
    lines.forEach((ln, i) => {
      const s = segs[i]; ln.visible = !!s;
      if (s) { ln.geometry.setFromPoints([s[0], s[1]]); ln.computeLineDistances(); }
    });

    // Movimiento de cámara animado
    if (viewAnim) {
      viewAnim.t = Math.min(1, viewAnim.t + 0.045);
      const k = viewAnim.t * viewAnim.t * (3 - 2 * viewAnim.t);
      camera.position.lerpVectors(viewAnim.from, viewAnim.to, k);
      controls.target.lerpVectors(viewAnim.fromT, viewAnim.toT, k);
      if (viewAnim.t >= 1) viewAnim = null;
    }
    controls.update();
    resize();
    renderer.render(scene, camera);

    // Etiquetas (después de render, con la cámara final)
    let li = 0; placed = [];
    if (opts.fijas) ex.fijas.forEach(fx => { if (fx.label) placeLabel(li++, fx.label, j[fx.joint]); });
    if (opts.lineas) segs.forEach(s => { if (s[2]) placeLabel(li++, s[2], s[0].clone().lerp(s[1], 0.5), 10, 6); });
    for (; li < labels.length; li++) labels[li].hidden = true;
  }

  return {
    setExercise(ex) { setProps(ex.props ?? [], ex); userMoved = false; setView(ex.vista, true); },
    setView(v, instant) { userMoved = false; setView(v, instant); }, update,
    setAutoRotate(on) { controls.autoRotate = on; },
    camera, controls,
  };
}
