// Definición de los ejercicios de la prueba del bot.
// Cada ejercicio describe su movimiento como una función de t (0 = posición inicial, 1 = posición final)
// más el tempo, la respiración y los puntos clave. El ángulo y su rango son la misma regla que usará la cámara.
import { BODY, v, rad, lerp, UP, FWD, trunk, footOnFloor, plantedLeg, joints, reachArm, armFK, ik2 } from "./rig.js";

const toeDir = (side, out = 15) => v(Math.sin(rad(out)) * side, 0, Math.cos(rad(out)));

// ───────── Sentadilla con barra ─────────
const sentadilla = {
  id: "sentadilla-barra", nombre: "Sentadilla con barra", zona: "Piernas · Cuádriceps y glúteos",
  vista: { az: 62, el: 8, radius: 1.0, target: [0, 0.86, 0] },
  musculos: ["thighL", "thighR", "pelvis"],
  fijas: [{ joint: "heelL", label: "Talones apoyados" }, { joint: "heelR" }],
  flecha: "pelvis",
  angulo: { nombre: "Rodilla", puntos: ["hipL", "kneeL", "ankleL"], rango: [65, 178] },
  tempo: [
    { desde: 0, hasta: 0, dur: 0.9, fase: "Prepárate", resp: "Inhala y aprieta el abdomen", esfuerzo: 0.15, cue: "Barra sobre la parte alta de la espalda, pies al ancho de los hombros" },
    { desde: 0, hasta: 1, dur: 2.0, fase: "Baja", resp: "Mantén el aire", esfuerzo: 0.55, cue: "Cadera atrás y rodillas en la dirección de las puntas" },
    { desde: 1, hasta: 1, dur: 0.5, fase: "Abajo", resp: "Mantén el aire", esfuerzo: 0.8, cue: "Cadera a la altura de las rodillas, pecho arriba" },
    { desde: 1, hasta: 0, dur: 1.2, fase: "Sube", resp: "Exhala al subir", esfuerzo: 1, cue: "Empuja el suelo con todo el pie; la barra sube en línea recta" },
  ],
  props: ["barbell"],
  pose(t) {
    const lean = lerp(4, 40, t);
    const pelvis = v(0, lerp(0.94, 0.50, t), lerp(0, -0.19, t));
    const up = v(0, Math.cos(rad(lean)), Math.sin(rad(lean)));
    const tr = trunk(pelvis, up, FWD, BODY, lean * 0.6);
    const fL = footOnFloor(0.17, 0.02, toeDir(1)), fR = footOnFloor(-0.17, 0.02, toeDir(-1));
    const legL = plantedLeg(tr.hipL, fL, toeDir(1)), legR = plantedLeg(tr.hipR, fR, toeDir(-1));
    const { l, u, f } = tr.basis;
    const bar = tr.chest.clone().add(f.clone().multiplyScalar(-0.10)).add(u.clone().multiplyScalar(0.02));
    const grip = s => bar.clone().add(l.clone().multiplyScalar(0.40 * s)).add(u.clone().multiplyScalar(-0.03));
    const elbowDir = s => u.clone().multiplyScalar(-1).add(f.clone().multiplyScalar(-0.6)).add(l.clone().multiplyScalar(0.3 * s));
    const armL = reachArm(tr.shoulderL, grip(1), elbowDir(1), u), armR = reachArm(tr.shoulderR, grip(-1), elbowDir(-1), u);
    return { j: joints(tr, legL, legR, armL, armR), props: { barbell: { center: bar, axis: l } } };
  },
  lineas(j, p) {
    const barDown = p.props.barbell.center.clone().setY(0.005);
    return [[p.props.barbell.center, barDown, "Barra sobre el medio del pie"], [j.pelvis, j.neck, "Espalda recta"]];
  },
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
  id: "flexiones", nombre: "Flexiones", zona: "Pecho · Tríceps y hombro anterior",
  vista: { az: 70, el: 14, radius: 0.95, target: [0, 0.32, 0.72] },
  musculos: ["chest", "upperArmL", "upperArmR", "shoulderL", "shoulderR"],
  fijas: [],
  flecha: "chest",
  angulo: { nombre: "Codo", puntos: ["shoulderL", "elbowL", "wristL"], rango: [60, 180] },
  tempo: [
    { desde: 0, hasta: 0, dur: 0.7, fase: "Arriba", resp: "Inhala", esfuerzo: 0.3, cue: "Cuerpo en línea recta de la cabeza a los talones" },
    { desde: 0, hasta: 1, dur: 2.0, fase: "Baja", resp: "Inhala al bajar", esfuerzo: 0.6, cue: "Codos a unos 45° del torso, no abiertos hacia los lados" },
    { desde: 1, hasta: 1, dur: 0.3, fase: "Abajo", resp: "", esfuerzo: 0.8, cue: "El pecho casi toca el suelo" },
    { desde: 1, hasta: 0, dur: 1.1, fase: "Sube", resp: "Exhala al empujar", esfuerzo: 1, cue: "Empuja el suelo sin dejar caer la cadera" },
  ],
  props: ["mat"],
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
  lineas(j) { return [[j.ankleL.clone().setX(0), j.head, "Cuerpo en línea recta"]]; },
};

// ───────── Curl de bíceps con mancuernas ─────────
const curl = {
  id: "curl-mancuernas", nombre: "Curl de bíceps con mancuernas", zona: "Brazos · Bíceps",
  vista: { az: 38, el: 6, radius: 0.98, target: [0, 0.88, 0] },
  musculos: ["upperArmL", "upperArmR"],
  fijas: [{ joint: "elbowL", label: "Codos pegados al torso" }, { joint: "elbowR" }],
  flecha: "wristL",
  angulo: { nombre: "Codo", puntos: ["shoulderL", "elbowL", "wristL"], rango: [45, 170] },
  tempo: [
    { desde: 0, hasta: 0, dur: 0.5, fase: "Abajo", resp: "Inhala", esfuerzo: 0.2, cue: "Brazos casi estirados, palmas al frente" },
    { desde: 0, hasta: 1, dur: 1.0, fase: "Sube", resp: "Exhala al subir", esfuerzo: 1, cue: "Solo se mueve el codo; los hombros quietos" },
    { desde: 1, hasta: 1, dur: 0.5, fase: "Aprieta", resp: "", esfuerzo: 0.9, cue: "Aprieta el bíceps arriba un instante" },
    { desde: 1, hasta: 0, dur: 2.0, fase: "Baja", resp: "Inhala al bajar", esfuerzo: 0.5, cue: "Baja lento y controlado, sin balancear el cuerpo" },
  ],
  props: ["dumbbells"],
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
  lineas(j) { return [[j.shoulderL, j.shoulderL.clone().add(v(0, -0.36, 0)), "El codo no se adelanta"]]; },
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
  id: "plancha", nombre: "Plancha", zona: "Abdomen · Estabilidad", isometrico: true,
  vista: { az: 72, el: 12, radius: 0.92, target: [0, 0.2, 0.68] },
  musculos: ["abdomen", "pelvis"],
  fijas: [{ joint: "pelvis", label: "Cadera quieta: ni arriba ni hundida" }],
  flecha: null,
  angulo: { nombre: "Cadera", puntos: ["shoulderL", "hipL", "kneeL"], rango: [170, 180] },
  tempo: [{ desde: 0, hasta: 0, dur: 6, fase: "Sostén", resp: "Respira corto y constante", esfuerzo: 0.85, cue: "Antebrazos bajo los hombros, glúteos y abdomen apretados" }],
  props: ["mat"],
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
  lineas(j) { return [[j.ankleL.clone().setX(0), j.neck, "Línea recta de talones a hombros"]]; },
};

// ───────── Sentadilla isométrica en pared ─────────
const WALL_Z = -0.30;
const pared = {
  id: "sentadilla-pared", nombre: "Sentadilla isométrica en pared", zona: "Piernas · Cuádriceps", isometrico: true,
  vista: { az: 68, el: 8, radius: 0.85, target: [0, 0.62, 0.05] },
  musculos: ["thighL", "thighR"],
  fijas: [{ joint: "pelvis", label: "Espalda pegada a la pared" }, { joint: "kneeL", label: "Rodillas sobre los tobillos" }],
  flecha: null,
  angulo: { nombre: "Rodilla", puntos: ["hipL", "kneeL", "ankleL"], rango: [85, 95] },
  tempo: [{ desde: 0, hasta: 0, dur: 6, fase: "Sostén", resp: "Respira lento, sin aguantar el aire", esfuerzo: 0.85, cue: "Muslos paralelos al suelo, peso en los talones" }],
  props: ["wall"],
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
  lineas(j) { return [[j.kneeL, j.kneeL.clone().setY(0.005), "Rodilla sobre el tobillo"], [j.hipL, j.kneeL, "Muslo paralelo al suelo"]]; },
};

export const BOT_EXERCISES = [sentadilla, flexiones, curl, plancha, pared];

// Posición t y fase actual a partir del tiempo del ciclo
export function sample(ex, time) {
  const total = ex.tempo.reduce((s, p) => s + p.dur, 0);
  let tc = ((time % total) + total) % total;
  for (const ph of ex.tempo) {
    if (tc <= ph.dur) {
      const k = ph.dur ? tc / ph.dur : 1;
      const e = k * k * (3 - 2 * k);
      return { t: lerp(ph.desde, ph.hasta, e), fase: ph, restante: ph.dur - tc, total };
    }
    tc -= ph.dur;
  }
  const last = ex.tempo[ex.tempo.length - 1];
  return { t: last.hasta, fase: last, restante: 0, total };
}

export { ik2 };
