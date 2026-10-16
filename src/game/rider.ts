import * as THREE from "three";
import type { Bin } from "./materials";
import { WHEEL_R } from "./track";

const CREAM = 0xf4efe4;
const BELLY = 0xffd3ae;
const BEAK = 0xef6b2c;
const POUCH = 0xff8a3d;
const SEA = 0x1f8a8a;
const SAND = 0xe7c98a;
const TIRE = 0x241c18;
const SEAT = 0x6b3a2a;
const WOOD = 0x8a5a32;
const SCALE = 0x7ec8c0;
const BLUSH = 0xf0a097;
const PUPIL = 0x1a120c;

type Toon = (color: number, side?: THREE.Side) => THREE.MeshToonMaterial;

export type Rider = {
  yawPivot: THREE.Group;
  update: (o: { phase: number; lean: number; boost: number; time: number; hit: number }) => void;
};

export function createRider(bin: Bin, toon: Toon): Rider {
  const yawPivot = new THREE.Group();
  const leanPivot = new THREE.Group();
  yawPivot.add(leanPivot);

  const vMid = new THREE.Vector3();
  const vDir = new THREE.Vector3();
  const vUp = new THREE.Vector3(0, 1, 0);
  const vDelta = new THREE.Vector3();
  const vPerp = new THREE.Vector3();
  const vKnee = new THREE.Vector3();
  const vFoot = new THREE.Vector3();

  function placeBone(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
    vDir.copy(to).sub(from);
    const len = vDir.length();
    if (len < 1e-4) return;
    vDir.multiplyScalar(1 / len);
    vMid.copy(from).add(to).multiplyScalar(0.5);
    mesh.position.copy(vMid);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(vUp, vDir);
  }

  function solveKnee(hip: THREE.Vector3, foot: THREE.Vector3, side: number) {
    const L1 = 0.5;
    const L2 = 0.48;
    vDelta.copy(foot).sub(hip);
    let d = vDelta.length();
    const max = L1 + L2 - 0.001;
    const min = Math.abs(L1 - L2) + 0.001;
    if (d > max) {
      vDelta.multiplyScalar(max / d);
      d = max;
    } else if (d < min) {
      vDelta.multiplyScalar(min / Math.max(d, 0.0001));
      d = min;
    }
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    vDir.copy(vDelta).multiplyScalar(1 / d);
    vPerp.set(side, 0.25, 0.85);
    vPerp.addScaledVector(vDir, -vPerp.dot(vDir));
    if (vPerp.lengthSq() < 1e-6) vPerp.set(side, 1, 0);
    vPerp.normalize();
    vKnee.copy(hip).addScaledVector(vDir, a).addScaledVector(vPerp, h);
  }

  function tube(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number) {
    const geo = bin.add(new THREE.CylinderGeometry(radius, radius, 1, 8));
    const mesh = new THREE.Mesh(geo, toon(color));
    placeBone(mesh, a, b);
    leanPivot.add(mesh);
    return mesh;
  }

  const bb = new THREE.Vector3(0, 0.5, 0.06);
  const seatPos = new THREE.Vector3(0, 1.02, -0.34);
  const stem = new THREE.Vector3(0, 1.05, 0.58);
  const rear = new THREE.Vector3(0, WHEEL_R, -0.72);
  const front = new THREE.Vector3(0, WHEEL_R, 0.8);

  tube(bb, seatPos, 0.045, SEA);
  tube(bb, stem, 0.045, SEA);
  tube(rear, bb, 0.04, SEA);
  tube(rear, seatPos, 0.038, SEA);
  tube(front, stem, 0.04, SEA);
  tube(new THREE.Vector3(-0.08, WHEEL_R, 0.8), stem, 0.028, SEA);
  tube(new THREE.Vector3(0.08, WHEEL_R, 0.8), stem, 0.028, SEA);

  const bars = new THREE.Group();
  bars.position.copy(stem);
  leanPivot.add(bars);
  const barGeo = bin.add(new THREE.CylinderGeometry(0.035, 0.035, 0.86, 8));
  const bar = new THREE.Mesh(barGeo, toon(SEA));
  bar.rotation.z = Math.PI / 2;
  bars.add(bar);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 8)), toon(BEAK));
    grip.rotation.z = Math.PI / 2;
    grip.position.x = side * 0.4;
    bars.add(grip);
    const hand = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.1, 10, 8)), toon(CREAM));
    hand.position.set(side * 0.4, -0.02, 0.02);
    bars.add(hand);
  }
  const bell = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.07, 10, 8)), toon(SAND));
  bell.position.set(0.18, 0.08, 0);
  bars.add(bell);

  const seat = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.16, 12, 10)), toon(SEAT));
  seat.scale.set(1.1, 0.45, 1.5);
  seat.position.copy(seatPos);
  leanPivot.add(seat);

  function addWheel(at: THREE.Vector3) {
    const group = new THREE.Group();
    group.position.copy(at);
    const tire = new THREE.Mesh(bin.add(new THREE.TorusGeometry(WHEEL_R, 0.075, 8, 18)), toon(TIRE));
    tire.rotation.y = Math.PI / 2;
    group.add(tire);
    const hub = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10)), toon(SAND));
    hub.rotation.z = Math.PI / 2;
    group.add(hub);
    const spokeGeo = bin.add(new THREE.CylinderGeometry(0.012, 0.012, WHEEL_R * 1.7, 4));
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(spokeGeo, toon(SAND));
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = (i / 6) * Math.PI;
      group.add(spoke);
    }
    leanPivot.add(group);
    const fender = new THREE.Mesh(
      bin.add(new THREE.TorusGeometry(WHEEL_R + 0.08, 0.035, 6, 14, Math.PI * 0.9)),
      toon(BEAK),
    );
    fender.rotation.y = Math.PI / 2;
    fender.position.copy(at);
    leanPivot.add(fender);
    return group;
  }

  const wheels = [addWheel(rear), addWheel(front)];

  const crank = new THREE.Group();
  crank.position.copy(bb);
  leanPivot.add(crank);
  const ring = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12)), toon(SEA));
  ring.rotation.z = Math.PI / 2;
  crank.add(ring);

  const pedalL = new THREE.Group();
  pedalL.position.set(-0.2, 0, 0.18);
  const pedalR = new THREE.Group();
  pedalR.position.set(0.2, 0, -0.18);
  const pedalGeo = bin.add(new THREE.BoxGeometry(0.18, 0.05, 0.1));
  pedalL.add(new THREE.Mesh(pedalGeo, toon(BEAK)));
  pedalR.add(new THREE.Mesh(pedalGeo, toon(BEAK)));
  crank.add(pedalL, pedalR);

  const basket = new THREE.Group();
  basket.position.set(0, 0.22, 0.42);
  const rim = new THREE.Mesh(bin.add(new THREE.TorusGeometry(0.26, 0.028, 6, 12)), toon(WOOD));
  rim.rotation.x = Math.PI / 2;
  basket.add(rim);
  const bottom = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.24, 10)), toon(WOOD));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.16;
  basket.add(bottom);
  const snack = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.1, 8, 6)), toon(BEAK));
  snack.scale.set(0.7, 0.45, 1.3);
  snack.position.y = -0.08;
  basket.add(snack);
  bars.add(basket);

  const body = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.82, 28, 20)), toon(CREAM));
  body.scale.set(1.18, 0.82, 1.02);
  body.position.set(0, 1.54, 0.02);
  leanPivot.add(body);

  const belly = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.58, 18, 14)), toon(BELLY));
  belly.scale.set(1.05, 0.9, 0.82);
  belly.position.set(0, 1.3, 0.32);
  leanPivot.add(belly);

  const scaleGeo = bin.add(new THREE.CircleGeometry(0.11, 10));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const sc = new THREE.Mesh(scaleGeo, toon(SCALE));
      sc.position.set(side * 0.96, 1.58 - i * 0.2, -0.02 + i * 0.04);
      sc.rotation.y = (side * Math.PI) / 2;
      leanPivot.add(sc);
    }
  }

  const neck = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.26, 12, 10)), toon(CREAM));
  neck.scale.set(1, 0.75, 1.15);
  neck.position.set(0, 2.08, 0.2);
  leanPivot.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 2.36, 0.38);
  leanPivot.add(head);
  const skull = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.46, 22, 16)), toon(CREAM));
  skull.scale.set(1.08, 0.94, 1.02);
  head.add(skull);

  const beakGeo = bin.add(new THREE.ConeGeometry(0.16, 0.92, 10));
  beakGeo.translate(0, 0.38, 0);
  const beak = new THREE.Mesh(beakGeo, toon(BEAK));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.06, 0.28);
  head.add(beak);

  const pouch = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.3, 16, 12)), toon(POUCH));
  pouch.scale.set(0.85, 0.7, 1.2);
  pouch.position.set(0, -0.2, 0.55);
  head.add(pouch);

  const eyeGeo = bin.add(new THREE.SphereGeometry(0.11, 12, 10));
  const pupilGeo = bin.add(new THREE.SphereGeometry(0.055, 10, 8));
  const glintGeo = bin.add(new THREE.SphereGeometry(0.025, 6, 6));
  const glintMat = bin.add(new THREE.MeshBasicMaterial({ color: 0xfffaf4 }));
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, toon(0xfffaf4));
    eye.position.set(side * 0.2, 0.08, 0.36);
    head.add(eye);
    eyes.push(eye);
    const pupil = new THREE.Mesh(pupilGeo, bin.add(new THREE.MeshBasicMaterial({ color: PUPIL })));
    pupil.position.set(side * 0.22, 0.07, 0.46);
    head.add(pupil);
    const glint = new THREE.Mesh(glintGeo, glintMat);
    glint.position.set(side * 0.25, 0.11, 0.48);
    head.add(glint);
    const blush = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.09, 10)), toon(BLUSH));
    blush.position.set(side * 0.4, -0.08, 0.28);
    blush.rotation.y = (side * Math.PI) / 2;
    head.add(blush);
  }

  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const gill = new THREE.Mesh(bin.add(new THREE.BoxGeometry(0.03, 0.08, 0.16)), toon(0xc47a6a));
      gill.position.set(side * 0.42, 2.02 - i * 0.1, 0.22);
      gill.rotation.y = side * 0.4;
      leanPivot.add(gill);
    }
  }

  const wingGeo = bin.add(new THREE.SphereGeometry(0.42, 12, 10));
  wingGeo.scale(1.15, 0.32, 0.7);
  const wingL = new THREE.Mesh(wingGeo, toon(CREAM));
  wingL.position.set(-0.72, 1.78, 0.18);
  wingL.rotation.z = 0.85;
  wingL.rotation.y = -0.35;
  const wingR = new THREE.Mesh(wingGeo, toon(CREAM));
  wingR.position.set(0.72, 1.78, 0.18);
  wingR.rotation.z = -0.85;
  wingR.rotation.y = 0.35;
  leanPivot.add(wingL, wingR);
  const wingLz = wingL.rotation.z;
  const wingRz = wingR.rotation.z;

  const fin = new THREE.Mesh(bin.add(new THREE.ConeGeometry(0.2, 0.5, 4)), toon(CREAM));
  fin.position.set(0, 2.22, -0.22);
  fin.rotation.x = 0.35;
  leanPivot.add(fin);

  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0.05);
  tailShape.lineTo(0.58, 0.46);
  tailShape.lineTo(0.36, 0.06);
  tailShape.lineTo(0.64, -0.4);
  tailShape.lineTo(0, -0.06);
  tailShape.lineTo(-0.64, -0.4);
  tailShape.lineTo(-0.36, 0.06);
  tailShape.lineTo(-0.58, 0.46);
  tailShape.closePath();
  const tailGeo = bin.add(new THREE.ExtrudeGeometry(tailShape, { depth: 0.08, bevelEnabled: false }));
  tailGeo.translate(0, 0, -0.04);
  const tail = new THREE.Group();
  tail.position.set(0, 1.32, -0.78);
  const tailMesh = new THREE.Mesh(tailGeo, toon(CREAM, THREE.DoubleSide));
  const tailEdge = new THREE.Mesh(tailGeo, toon(BEAK, THREE.DoubleSide));
  tailEdge.scale.setScalar(0.72);
  tailEdge.position.z = 0.02;
  tail.add(tailMesh, tailEdge);
  leanPivot.add(tail);

  const thighGeo = bin.add(new THREE.CylinderGeometry(0.11, 0.09, 1, 8));
  const shinGeo = bin.add(new THREE.CylinderGeometry(0.08, 0.07, 1, 8));
  const footGeo = bin.add(new THREE.SphereGeometry(0.1, 8, 6));
  const hipL = new THREE.Vector3(-0.26, 1.12, -0.08);
  const hipR = new THREE.Vector3(0.26, 1.12, -0.08);
  const thighL = new THREE.Mesh(thighGeo, toon(0xf2c7a5));
  const shinL = new THREE.Mesh(shinGeo, toon(0xf2c7a5));
  const thighR = new THREE.Mesh(thighGeo, toon(0xf2c7a5));
  const shinR = new THREE.Mesh(shinGeo, toon(0xf2c7a5));
  const footL = new THREE.Mesh(footGeo, toon(BEAK));
  const footR = new THREE.Mesh(footGeo, toon(BEAK));
  footL.scale.set(1.3, 0.45, 1.7);
  footR.scale.set(1.3, 0.45, 1.7);
  leanPivot.add(thighL, shinL, thighR, shinR, footL, footR);

  const shadow = new THREE.Mesh(
    bin.add(new THREE.CircleGeometry(1.15, 20)),
    bin.add(new THREE.MeshBasicMaterial({ color: 0x102430, transparent: true, opacity: 0.28 })),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  yawPivot.add(shadow);

  const bodyBase = body.position.y;
  const pouchBase = pouch.scale.y;

  return {
    yawPivot,
    update({ phase, lean, boost, time, hit }) {
      leanPivot.rotation.z = lean;
      leanPivot.rotation.x = -boost * 0.14;
      bars.rotation.y = -lean * 1.4;
      crank.rotation.x = phase;
      for (const w of wheels) w.rotation.x = phase;
      body.position.y = bodyBase + Math.sin(phase * 2) * 0.035 * (1 - hit);
      body.scale.set(1.18 + hit * 0.06, 0.82 * (1 - hit * 0.1), 1.02);
      pouch.scale.y = pouchBase + boost * 0.35 + Math.sin(time * 2) * 0.03;
      tail.rotation.y = Math.sin(time * 4.5 + phase) * (0.18 + boost * 0.2);
      tail.rotation.x = Math.sin(time * 2.2) * 0.08;
      const flap = Math.sin(phase * 2) * 0.06;
      wingL.rotation.z = wingLz + flap;
      wingR.rotation.z = wingRz - flap;
      const blink = Math.pow(Math.sin(time * 0.55), 40) > 0.6 ? 0.12 : 1;
      for (const eye of eyes) eye.scale.y = blink;

      leanPivot.updateWorldMatrix(true, true);
      const legs: [THREE.Vector3, THREE.Object3D, THREE.Mesh, THREE.Mesh, THREE.Mesh, number][] = [
        [hipL, pedalL, thighL, shinL, footL, -1],
        [hipR, pedalR, thighR, shinR, footR, 1],
      ];
      for (const [hip, pedal, thigh, shin, foot, side] of legs) {
        pedal.getWorldPosition(vFoot);
        leanPivot.worldToLocal(vFoot);
        solveKnee(hip, vFoot, side);
        placeBone(thigh, hip, vKnee);
        placeBone(shin, vKnee, vFoot);
        foot.position.copy(vFoot);
      }
    },
  };
}
