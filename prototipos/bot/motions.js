// Modelos de movimiento del bot: solo la geometría de cada ejercicio.
// pose(t, time) da las articulaciones para t de 0 (posición inicial) a 1 (posición final); lineas() da los dos puntos
// de cada alineación por su id. Los textos, el tempo, el ángulo, los puntos fijos y la vista viven en la ficha del ejercicio
// (js/data/exercises.js). Los modelos hechos a mano se irán sustituyendo por movimiento extraído de video.
import { BODY, v, rad, lerp, UP, FWD, trunk, footOnFloor, plantedLeg, joints, reachArm, armFK } from "./rig.js";
import sentadillaVideo from "./motions/sentadilla-barra.video.js";

const toeDir = (side, out = 15) => v(Math.sin(rad(out)) * side, 0, Math.cos(rad(out)));

// Barra sobre la parte alta de la espalda, con las manos agarrándola (sentadilla trasera)
function barOnBack(tr, elbowPole) {
  const { l, u, f } = tr.basis;
  const bar = tr.chest.clone().add(f.clone().multiplyScalar(-0.10)).add(u.clone().multiplyScalar(0.02));
  const grip = s => bar.clone().add(l.clone().multiplyScalar(0.40 * s)).add(u.clone().multiplyScalar(-0.03));
  const elbowDir = s => elbowPole?.(s) ?? u.clone().multiplyScalar(-1).add(f.clone().multiplyScalar(-0.6)).add(l.clone().multiplyScalar(0.3 * s));
  return {
    armL: reachArm(tr.shoulderL, grip(1), elbowDir(1), u), armR: reachArm(tr.shoulderR, grip(-1), elbowDir(-1), u),
    barbell: { center: bar, axis: l },
  };
}
const squatLines = (j, p) => ({ "barra-medio-pie": [p.props.barbell.center, p.props.barbell.center.clone().setY(0.005)], "espalda-recta": [j.pelvis, j.neck] });

// ───────── Movimiento extraído de video ─────────
// Del video se toma lo que la cámara mide bien sin importar desde dónde grabe: los ángulos de rodilla y cadera
// por profundidad t (0 = inicio, 1 = final), la apertura de los pies y cuánto apuntan hacia afuera.
// La postura completa se resuelve con las proporciones del bot y una regla física: la barra queda sobre el medio del pie.
export function squatFromVideo(data) {
  const M = data.muestras;
  const at = t => {
    let i = 0; while (i < M.length - 2 && M[i + 1].t < t) i++;
    const a = M[i], b = M[i + 1], k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t || 1)));
    return { K: lerp(a.rodilla, b.rodilla, k), H: lerp(a.cadera, b.cadera, k) };
  };
  const legLen = BODY.thigh + BODY.shin;
  const footX = data.apertura * legLen / 2;
  const abd = Math.asin(Math.min(0.5, (footX - BODY.hipHalf) / legLen));       // piernas algo abiertas
  const shin = BODY.shin * Math.cos(abd), thigh = BODY.thigh * Math.cos(abd);
  const midFootZ = BODY.footLen / 2 - BODY.heelBack;
  const dir = a => v(0, Math.cos(a), Math.sin(a));                              // ángulo desde la vertical, positivo hacia el frente

  function build(t, thetaS) {
    const { K, H } = at(t);
    const knee = v(0, BODY.ankleH, 0).addScaledVector(dir(thetaS), shin);
    const aThigh = thetaS + rad(K) + Math.PI;                                  // de la rodilla a la cadera
    const pelvis = knee.clone().addScaledVector(dir(aThigh), thigh);
    const aSpine = thetaS + rad(K) - rad(H);                                   // inclinación del tronco
    const tr = trunk(pelvis, dir(aSpine), FWD, BODY, Math.max(0, aSpine * 180 / Math.PI) * 0.6);
    return { tr, ...barOnBack(tr) };
  }
  // Ángulo de la tibia que deja la barra sobre el medio del pie (búsqueda por bisección)
  function solve(t) {
    let lo = rad(-5), hi = rad(50);
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (build(t, mid).barbell.center.z < midFootZ) lo = mid; else hi = mid;
    }
    return build(t, (lo + hi) / 2);
  }
  return {
    data,
    pose(t) {
      const { tr, armL, armR, barbell } = solve(t);
      const fL = footOnFloor(footX, 0, toeDir(1, data.puntas)), fR = footOnFloor(-footX, 0, toeDir(-1, data.puntas));
      const legL = plantedLeg(tr.hipL, fL, toeDir(1, data.puntas)), legR = plantedLeg(tr.hipR, fR, toeDir(-1, data.puntas));
      return { j: joints(tr, legL, legR, armL, armR), props: { barbell } };
    },
    lineas: squatLines,
  };
}

// ───────── Sentadilla con barra ─────────
const sentadilla = {
  pose(t) {
    const lean = lerp(4, 40, t);
    const pelvis = v(0, lerp(0.94, 0.50, t), lerp(0, -0.19, t));
    const up = v(0, Math.cos(rad(lean)), Math.sin(rad(lean)));
    const tr = trunk(pelvis, up, FWD, BODY, lean * 0.6);
    const fL = footOnFloor(0.17, 0.02, toeDir(1)), fR = footOnFloor(-0.17, 0.02, toeDir(-1));
    const legL = plantedLeg(tr.hipL, fL, toeDir(1)), legR = plantedLeg(tr.hipR, fR, toeDir(-1));
    const { armL, armR, barbell } = barOnBack(tr);
    return { j: joints(tr, legL, legR, armL, armR), props: { barbell } };
  },
  lineas: squatLines,
};

// ───────── Flexiones ─────────
const flexionPose = (t, ext = {}) => {
  const ankleY = 0.10, bodyLen = BODY.thigh + BODY.shin + BODY.torso - 0.03;
  const shoulderY = lerp(0.62, 0.30, t);
  const theta = Math.asin((shoulderY - ankleY) / bodyLen);
  const dir = v(0, Math.sin(theta), Math.cos(theta));
  const pelvis = v(0, ankleY, 0).add(dir.clone().multiplyScalar(BODY.thigh + BODY.shin));
  const tr = trunk(pelvis, dir, v(0, -Math.cos(theta), Math.sin(theta)), BODY, ext.head ?? 8);
  return { tr, theta };
};
const handsZ = (() => { const { tr } = flexionPose(0); return tr.chest.z + 0.03; })();
const flexiones = {
  pose(t) {
    const { tr } = flexionPose(t);
    const { u } = tr.basis;
    const foot = s => ({ ankle: v(0.10 * s, 0.10, 0), heel: v(0.10 * s, 0.16, -0.05), toe: v(0.10 * s, 0.015, 0.05) });
    const legL = plantedLeg(tr.hipL, foot(1), v(0, -1, 0)), legR = plantedLeg(tr.hipR, foot(-1), v(0, -1, 0));
    const wrist = s => v(0.25 * s, 0.05, handsZ);
    const elbowDir = s => v(0.7 * s, 0.4, -1);
    const armL = reachArm(tr.shoulderL, wrist(1), elbowDir(1), FWD), armR = reachArm(tr.shoulderR, wrist(-1), elbowDir(-1), FWD);
    return { j: joints(tr, legL, legR, armL, armR), props: {} };
  },
  lineas(j) { return { "cuerpo-recto": [j.ankleL.clone().setX(0), j.head] }; },
};

// ───────── Curl de bíceps con mancuernas ─────────
const curl = {
  pose(t) {
    const tr = trunk(v(0, 0.93, 0), UP, FWD);
    const fL = footOnFloor(0.12, 0, toeDir(1, 8)), fR = footOnFloor(-0.12, 0, toeDir(-1, 8));
    const legL = plantedLeg(tr.hipL, fL, toeDir(1)), legR = plantedLeg(tr.hipR, fR, toeDir(-1));
    const elbowDeg = lerp(168, 42, t);
    const armDir = s => v(0.06 * s, -1, -0.02);
    const armL = armFK(tr.shoulderL, armDir(1), elbowDeg, FWD), armR = armFK(tr.shoulderR, armDir(-1), elbowDeg, FWD);
    const db = a => ({ center: a.wrist.clone().lerp(a.hand, 0.5), axis: v(1, 0, 0) });
    return { j: joints(tr, legL, legR, armL, armR), props: { dumbbells: [db(armL), db(armR)] } };
  },
  lineas(j) { return { "codo-bajo-hombro": [j.shoulderL, j.shoulderL.clone().add(v(0, -0.36, 0))] }; },
};

// ───────── Plancha ─────────
const planchaPose = (breath = 0) => {
  const ankleY = 0.10, shoulderY = 0.04 + BODY.upperArm + 0.012 * breath, bodyLen = BODY.thigh + BODY.shin + BODY.torso - 0.03;
  const theta = Math.asin((shoulderY - ankleY) / bodyLen);
  const dir = v(0, Math.sin(theta), Math.cos(theta));
  const pelvis = v(0, ankleY, 0).add(dir.clone().multiplyScalar(BODY.thigh + BODY.shin));
  return trunk(pelvis, dir, v(0, -Math.cos(theta), Math.sin(theta)), BODY, 6);
};
const plancha = {
  pose(t, time = 0) {
    const tr = planchaPose(Math.sin(time * 2 * Math.PI / 3));
    const foot = s => ({ ankle: v(0.10 * s, 0.10, 0), heel: v(0.10 * s, 0.16, -0.05), toe: v(0.10 * s, 0.015, 0.05) });
    const legL = plantedLeg(tr.hipL, foot(1), v(0, -1, 0)), legR = plantedLeg(tr.hipR, foot(-1), v(0, -1, 0));
    const arm = (sh, s) => {
      const elbow = v(0.16 * s, 0.045, sh.z);
      const wrist = elbow.clone().add(v(-0.03 * s, 0, BODY.forearm));
      return { elbow, wrist, hand: wrist.clone().add(v(-0.02 * s, 0, BODY.hand)) };
    };
    return { j: joints(tr, legL, legR, arm(tr.shoulderL, 1), arm(tr.shoulderR, -1)), props: {} };
  },
  lineas(j) { return { "talones-hombros": [j.ankleL.clone().setX(0), j.neck] }; },
};

// ───────── Sentadilla isométrica en pared ─────────
const WALL_Z = -0.30;
const pared = {
  wallZ: WALL_Z,
  pose(t, time = 0) {
    const breath = Math.sin(time * 2 * Math.PI / 4) * 0.004;
    const kneeY = BODY.ankleH + BODY.shin;
    const pelvis = v(0, kneeY + breath, WALL_Z + 0.13);
    const tr = trunk(pelvis, UP, FWD, BODY, 0);
    const z = pelvis.z + BODY.thigh;
    const fL = footOnFloor(0.15, z, toeDir(1, 10)), fR = footOnFloor(-0.15, z, toeDir(-1, 10));
    const legL = plantedLeg(tr.hipL, fL, toeDir(1, 10)), legR = plantedLeg(tr.hipR, fR, toeDir(-1, 10));
    const armL = armFK(tr.shoulderL, v(0.12, -1, 0.15), 160, FWD), armR = armFK(tr.shoulderR, v(-0.12, -1, 0.15), 160, FWD);
    return { j: joints(tr, legL, legR, armL, armR), props: { wall: { z: WALL_Z } } };
  },
  lineas(j) { return { "rodilla-tobillo": [j.kneeL, j.kneeL.clone().setY(0.005)], "muslo-paralelo": [j.hipL, j.kneeL] }; },
};

export const MOTIONS = {
  "sentadilla-barra": sentadilla, "sentadilla-barra-video": squatFromVideo(sentadillaVideo), "flexiones": flexiones, "curl-mancuernas": curl, "plancha": plancha, "sentadilla-pared": pared,
};
