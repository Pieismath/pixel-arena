import * as THREE from 'three';

/** Frame both ends of a live pass. Units are feet; the margin covers the athlete and camera lag. */
export function actionFraming(subject: THREE.Vector3, ball: THREE.Vector3, direction: number, dunk: boolean, aspect: number, fov: number) {
  const target = subject.clone().lerp(ball, .5);
  target.y = Math.max(4, target.y);
  const offset = new THREE.Vector3(direction * (dunk ? -8 : 9), dunk ? 7 : 8, dunk ? 24 : 26).normalize();
  const halfVertical = THREE.MathUtils.degToRad(fov / 2);
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const radius = subject.distanceTo(ball) / 2 + 6.5;
  const distance = Math.max(29, radius / Math.sin(Math.min(halfVertical, halfHorizontal) * .78));
  // A far retreat would put the southern row of buildings between the lens and the court.
  // Rise within the park for wide passes; keep the ordinary possession view at courtside height.
  const retreat = target.z + offset.z * distance;
  const rise = THREE.MathUtils.smoothstep(retreat, 60, 96);
  if (rise > 0) offset.lerp(new THREE.Vector3(direction * .12, .84, .53).normalize(), rise).normalize();
  return { target, camera: target.clone().addScaledVector(offset, distance) };
}

/** A fitted overview cannot clip the far end of the court on a narrow display. */
export function overviewFraming(aspect: number, fov: number) {
  const target = new THREE.Vector3(0, 3, -4);
  const offset = new THREE.Vector3(40, 49, 74);
  const half = Math.min(THREE.MathUtils.degToRad(fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect));
  const distance = Math.max(offset.length(), 65 / Math.sin(half * .92));
  return { target, camera: target.clone().addScaledVector(offset.normalize(), distance) };
}
