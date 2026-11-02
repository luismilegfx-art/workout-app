// Cinemática del bot: proporciones del cuerpo y herramientas para calcular posiciones de articulaciones.
// Sistema de coordenadas: Y arriba, la figura mira hacia +Z, su izquierda es +X. Unidades en metros.
// El resultado de cada pose es un mapa de articulaciones en 3D: el mismo formato que entrega la cámara (MediaPipe),
// para que la demostración y la corrección compartan la definición de cada ejercicio.
import { Vector3 } from "three";

export const BODY = {
  thigh: 0.44, shin: 0.43, ankleH: 0.075, footLen: 0.25, heelBack: 0.06,
  torso: 0.50, neck: 0.09, headR: 0.11,
  shoulderHalf: 0.19, hipHalf: 0.105,
  upperArm: 0.29, forearm: 0.26, hand: 0.085,
};

export const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
export const UP = v(0, 1, 0), FWD = v(0, 0, 1), LEFT = v(1, 0, 0);
export const rad = d => d * Math.PI / 180;
export const deg = r => r * 180 / Math.PI;
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = t => t * t * (3 - 2 * t);            // suave al empezar y al terminar

// Ángulo en B (grados) entre BA y BC
export function angleAt(A, B, C) {
  const a = A.clone().sub(B), c = C.clone().sub(B);
  return deg(a.angleTo(c));
}

/**
 * IK de dos huesos: dado el inicio A, el objetivo T y la dirección de doblez `pole`,
 * devuelve la articulación media (rodilla o codo) y el extremo alcanzado (igual a T si llega).
 */
export function ik2(A, T, l1, l2, pole) {
  const toT = T.clone().sub(A);
  const d = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const dir = toT.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // componente del polo perpendicular a la dirección
  const u = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (u.lengthSq() < 1e-8) u.copy(Math.abs(dir.y) < 0.9 ? UP : FWD).sub(dir.clone().multiplyScalar(dir.dot(Math.abs(dir.y) < 0.9 ? UP : FWD)));
  u.normalize();
  const mid = A.clone().add(dir.clone().multiplyScalar(l1 * cosA)).add(u.multiplyScalar(l1 * sinA));
  const end = A.clone().add(dir.multiplyScalar(d));
  return { mid, end };
}

// Brazo con un ángulo de codo (FK): el húmero sigue `armDir`, el antebrazo gira en el plano definido por `bendDir`
export function armFK(shoulder, armDir, elbowDeg, bendDir, lens = BODY) {
  const a = armDir.clone().normalize();
  const elbow = shoulder.clone().add(a.clone().multiplyScalar(lens.upperArm));
  const b = bendDir.clone().sub(a.clone().multiplyScalar(bendDir.dot(a))).normalize();
  const flex = rad(180 - elbowDeg);                       // 180 = brazo estirado
  const fore = a.clone().multiplyScalar(Math.cos(flex)).add(b.multiplyScalar(Math.sin(flex)));
  const wrist = elbow.clone().add(fore.clone().multiplyScalar(lens.forearm));
  const hand = wrist.clone().add(fore.multiplyScalar(lens.hand));
  return { elbow, wrist, hand };
}

/**
 * Tronco a partir de la pelvis: `up` es el eje de la columna (pelvis → pecho) y `fwd` hacia dónde mira.
 * Devuelve pelvis, pecho, cuello, cabeza, hombros y caderas, más la base local (izquierda, arriba, frente).
 */
export function trunk(pelvis, up, fwd, lens = BODY, headTilt = 0) {
  const u = up.clone().normalize();
  const f = fwd.clone().sub(u.clone().multiplyScalar(fwd.dot(u))).normalize();
  const l = u.clone().cross(f).normalize();
  const chest = pelvis.clone().add(u.clone().multiplyScalar(lens.torso));
  const headDir = u.clone().applyAxisAngle(l, -rad(headTilt));
  const neck = chest.clone().add(headDir.clone().multiplyScalar(lens.neck));
  const head = neck.clone().add(headDir.clone().multiplyScalar(lens.headR + 0.02));
  return {
    pelvis, chest, neck, head, basis: { l, u, f },
    shoulderL: chest.clone().add(l.clone().multiplyScalar(lens.shoulderHalf)).add(u.clone().multiplyScalar(-0.03)),
    shoulderR: chest.clone().add(l.clone().multiplyScalar(-lens.shoulderHalf)).add(u.clone().multiplyScalar(-0.03)),
    hipL: pelvis.clone().add(l.clone().multiplyScalar(lens.hipHalf)),
    hipR: pelvis.clone().add(l.clone().multiplyScalar(-lens.hipHalf)),
  };
}

// Pie apoyado en el suelo: tobillo, talón y punta a partir de la posición en el suelo y la dirección de la punta
export function footOnFloor(x, z, toeDir, lens = BODY) {
  const d = toeDir.clone().setY(0).normalize();
  const ankle = v(x, lens.ankleH, z);
  return { ankle, heel: v(x, 0.02, z).sub(d.clone().multiplyScalar(lens.heelBack)), toe: v(x, 0.02, z).add(d.clone().multiplyScalar(lens.footLen - lens.heelBack)) };
}

// Pierna con el pie plantado: IK de cadera a tobillo, rodilla hacia `kneeDir`
export function plantedLeg(hip, foot, kneeDir, lens = BODY) {
  const { mid, end } = ik2(hip, foot.ankle, lens.thigh, lens.shin, kneeDir);
  return { knee: mid, ankle: end, heel: foot.heel, toe: foot.toe };
}

// Arma el mapa final de articulaciones con nombres estables (lado L = izquierdo de la figura)
export function joints(t, legL, legR, armL, armR) {
  return {
    pelvis: t.pelvis, chest: t.chest, neck: t.neck, head: t.head,
    hipL: t.hipL, hipR: t.hipR, shoulderL: t.shoulderL, shoulderR: t.shoulderR,
    kneeL: legL.knee, kneeR: legR.knee, ankleL: legL.ankle, ankleR: legR.ankle,
    heelL: legL.heel, heelR: legR.heel, toeL: legL.toe, toeR: legR.toe,
    elbowL: armL.elbow, elbowR: armR.elbow, wristL: armL.wrist, wristR: armR.wrist, handL: armL.hand, handR: armR.hand,
    basis: t.basis,
  };
}

// Mano que debe llegar a un punto (barra, suelo): IK de hombro a muñeca y la mano sigue la dirección indicada
export function reachArm(shoulder, wristTarget, elbowDir, handDir, lens = BODY) {
  const { mid, end } = ik2(shoulder, wristTarget, lens.upperArm, lens.forearm, elbowDir);
  return { elbow: mid, wrist: end, hand: end.clone().add(handDir.clone().normalize().multiplyScalar(lens.hand)) };
}
