import * as THREE from 'three';
import { mulberry32 } from '../data/random';

/** A short, local preview celebration. Never records a purchase or changes persisted state. */
export function createMoments() {
  const group = new THREE.Group();
  group.name = 'takeover-celebration';
  const count = 96;
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.65 });
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.65), material, count);
  confetti.frustumCulled = false;
  group.add(confetti);
  group.visible = false;
  const rnd = mulberry32(721);
  const pieces = Array.from({length: count}, () => ({
    x: (rnd() - 0.5) * 48, z: (rnd() - 0.5) * 26,
    y: 14 + rnd() * 13, speed: 1.6 + rnd() * 1.8,
    phase: rnd() * Math.PI * 2,
  }));
  const dummy = new THREE.Object3D();
  let age = 9;
  return {
    group,
    start(color: string, accent: string) {
      age = 0;
      group.visible = true;
      for (let i = 0; i < count; i++) confetti.setColorAt(i, new THREE.Color(i % 3 === 0 ? '#fff0c7' : i % 2 ? color : accent));
      if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
    },
    update(dt: number) {
      if (!group.visible) return;
      age += dt;
      if (age > 8) { group.visible = false; return; }
      for (let i = 0; i < count; i++) {
        const p = pieces[i];
        dummy.position.set(p.x + Math.sin(age * 1.8 + p.phase) * 2, Math.max(0.12, p.y - age * p.speed), p.z + Math.sin(age + p.phase) * 1.4);
        dummy.rotation.set(age * 2 + p.phase, age + p.phase, age * 1.7);
        dummy.scale.setScalar(Math.min(1, (8 - age) * 2));
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    },
  };
}
