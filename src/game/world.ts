import * as THREE from "three";
import type { Bin } from "./materials";
import { sandTexture, woodTexture } from "./materials";
import {
  ROAD_HALF,
  ROAD_Y,
  SAND_HALF,
  TAU,
  trackPoint,
  yawFromForward,
  type TrackPoint,
} from "./track";

type Toon = (color: number, side?: THREE.Side) => THREE.MeshToonMaterial;

export type World = {
  waterMat: THREE.ShaderMaterial;
  clouds: THREE.Group;
  buoys: THREE.Object3D[];
};

function ribbonGeometry(
  bin: Bin,
  lat0: number,
  lat1: number,
  y: number,
  samples: number,
  vPerMeter: number,
) {
  const count = samples + 1;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const p: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
  let arc = 0;
  let prevX = 0;
  let prevZ = 0;
  for (let i = 0; i < count; i++) {
    const t = (i / samples) * TAU;
    trackPoint(t, p);
    if (i > 0) arc += Math.hypot(p.x - prevX, p.z - prevZ);
    prevX = p.x;
    prevZ = p.z;
    for (let k = 0; k < 2; k++) {
      const lat = k === 0 ? lat0 : lat1;
      const idx = i * 2 + k;
      positions[idx * 3] = p.x + p.ox * lat;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = p.z + p.oz * lat;
      uvs[idx * 2] = k;
      uvs[idx * 2 + 1] = arc * vPerMeter;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geo = bin.add(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildWorld(scene: THREE.Scene, bin: Bin, toon: Toon, gradient: THREE.Texture): World {
  const skyGeo = bin.add(new THREE.SphereGeometry(420, 24, 16));
  const skyMat = bin.add(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld - cameraPosition);
          float h = dir.y;
          vec3 zenith = vec3(0.27, 0.68, 0.76);
          vec3 horizon = vec3(0.99, 0.78, 0.56);
          vec3 warm = vec3(0.95, 0.52, 0.30);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.6, h));
          col = mix(warm, col, smoothstep(-0.25, 0.1, h));
          vec3 sunDir = normalize(vec3(0.5, 0.48, 0.62));
          float sun = pow(max(dot(dir, sunDir), 0.0), 90.0);
          float glow = pow(max(dot(dir, sunDir), 0.0), 4.5);
          col += vec3(1.0, 0.9, 0.6) * sun;
          col += vec3(1.0, 0.52, 0.25) * glow * 0.4;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const waterGeo = bin.add(new THREE.PlaneGeometry(520, 520, 80, 80));
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = bin.add(
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorld;
        void main() {
          vec3 p = position;
          float w = sin(p.x * 0.08 + uTime * 1.2) * 0.18 + cos(p.z * 0.07 - uTime * 0.9) * 0.14;
          p.y += w;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vWorld;
        void main() {
          vec2 q = vWorld.xz * 0.06;
          float a = sin(q.x * 3.0 + uTime * 1.1) + cos(q.y * 2.4 - uTime * 0.8);
          float b = sin(q.x * 7.0 - q.y * 6.0 + uTime * 1.6);
          vec3 deep = vec3(0.04, 0.24, 0.38);
          vec3 mid = vec3(0.12, 0.55, 0.64);
          vec3 foam = vec3(0.78, 0.93, 0.88);
          vec3 col = mix(deep, mid, smoothstep(-1.2, 1.1, a));
          col = mix(col, foam, smoothstep(0.75, 1.05, b) * 0.45);
          float glint = pow(max(sin(q.x * 14.0 + uTime * 2.0) * sin(q.y * 11.0 - uTime), 0.0), 10.0);
          col += vec3(1.0, 0.86, 0.55) * glint * 0.5;
          float dist = length(vWorld.xz - cameraPosition.xz);
          float fogF = smoothstep(50.0, 200.0, dist);
          col = mix(col, vec3(0.97, 0.78, 0.58), fogF);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = -0.35;
  scene.add(water);

  const sandTex = sandTexture(bin);
  const sandMat = bin.add(
    new THREE.MeshToonMaterial({
      color: 0xffffff,
      map: sandTex,
      gradientMap: gradient,
      side: THREE.DoubleSide,
    }),
  );
  const sand = new THREE.Mesh(ribbonGeometry(bin, -SAND_HALF, SAND_HALF, 0.04, 160, 0.08), sandMat);
  scene.add(sand);

  const wood = woodTexture(bin);
  const roadMat = bin.add(
    new THREE.MeshToonMaterial({
      color: 0xffffff,
      map: wood,
      gradientMap: gradient,
      side: THREE.DoubleSide,
    }),
  );
  const road = new THREE.Mesh(ribbonGeometry(bin, -ROAD_HALF, ROAD_HALF, ROAD_Y, 200, 0.125), roadMat);
  scene.add(road);

  const curbMat = toon(0xf7f1e6, THREE.DoubleSide);
  const curbOuter = new THREE.Mesh(
    ribbonGeometry(bin, ROAD_HALF - 0.08, ROAD_HALF + 0.28, ROAD_Y + 0.08, 160, 0.05),
    curbMat,
  );
  const curbInner = new THREE.Mesh(
    ribbonGeometry(bin, -ROAD_HALF - 0.28, -ROAD_HALF + 0.08, ROAD_Y + 0.08, 160, 0.05),
    curbMat,
  );
  scene.add(curbOuter, curbInner);

  const dashes = buildDashes(bin, toon);
  scene.add(dashes);

  buildGate(scene, bin, toon);
  buildPalms(scene, bin, toon);
  buildRocks(scene, bin, toon);
  const buoys = buildBuoys(scene, bin, toon);
  const clouds = buildClouds(scene, bin, toon);

  const hemi = new THREE.HemisphereLight(0xd4f4f1, 0xe7c98a, 1.05);
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.45);
  sun.position.set(40, 56, 48);
  const fill = new THREE.DirectionalLight(0xfff4e4, 0.55);
  fill.position.set(-28, 24, -36);
  scene.add(hemi, sun, fill);
  scene.fog = new THREE.Fog(0xf6c79a, 55, 210);

  return { waterMat, clouds, buoys };
}

function buildDashes(bin: Bin, toon: Toon) {
  const p: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
  const samples = 90;
  const mesh = new THREE.InstancedMesh(
    bin.add(new THREE.BoxGeometry(0.16, 0.04, 1.4)),
    toon(0xf7f1e6),
    samples,
  );
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scl = new THREE.Vector3(1, 1, 1);
  const fwd = new THREE.Vector3();
  for (let i = 0; i < samples; i++) {
    if (i % 2 === 0) {
      m.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, m);
      continue;
    }
    trackPoint((i / samples) * TAU, p);
    pos.set(p.x, ROAD_Y + 0.05, p.z);
    fwd.set(p.tx, 0, p.tz);
    quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
    m.compose(pos, quat, scl);
    mesh.setMatrixAt(i, m);
    void up;
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function buildGate(scene: THREE.Scene, bin: Bin, toon: Toon) {
  const p: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
  trackPoint(0, p);
  const gate = new THREE.Group();
  gate.position.set(p.x, 0, p.z);
  gate.rotation.y = yawFromForward(p.tx, p.tz);

  const postGeo = bin.add(new THREE.CylinderGeometry(0.12, 0.14, 3.7, 8));
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, toon(0x1f8a8a));
    post.position.set(side * (ROAD_HALF - 0.15), 1.85, 0);
    gate.add(post);
    const cap = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.16, 8, 8)), toon(0xef6b2c));
    cap.position.set(side * (ROAD_HALF - 0.15), 3.75, 0);
    gate.add(cap);
  }

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#f7f1e6" : "#102430";
      g.fillRect(i * 32, 0, 32, 64);
    }
  }
  const tex = bin.add(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(ROAD_HALF * 2 - 0.5, 0.7)),
    bin.add(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })),
  );
  banner.position.y = 3.55;
  gate.add(banner);

  const line = new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(ROAD_HALF * 2 - 0.4, 1.1)),
    bin.add(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = ROAD_Y + 0.03;
  gate.add(line);

  const pennant = bin.add(new THREE.ConeGeometry(0.1, 0.28, 4));
  const colors = [0xef6b2c, 0x1f8a8a, 0xe7c98a];
  for (let i = 0; i < 9; i++) {
    const flag = new THREE.Mesh(pennant, toon(colors[i % 3] ?? 0xef6b2c));
    flag.position.set(-ROAD_HALF + 0.8 + i * 1.25, 3.05, 0);
    flag.rotation.x = Math.PI;
    gate.add(flag);
  }
  scene.add(gate);
}

function buildPalms(scene: THREE.Scene, bin: Bin, toon: Toon) {
  const count = 26;
  const trunkGeo = bin.add(new THREE.CylinderGeometry(0.16, 0.24, 1, 6));
  trunkGeo.translate(0, 0.5, 0);
  const leafGeo = bin.add(new THREE.ConeGeometry(0.28, 1.5, 5));
  leafGeo.translate(0, 0.75, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8a5a32), count);
  const leaves = new THREE.InstancedMesh(leafGeo, toon(0x2f8f62), count * 5);
  const p: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.05);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU + 0.15;
    trackPoint(t, p);
    const side = i % 2 === 0 ? 1 : -1;
    const lat = side * (ROAD_HALF + 3.1 + (i % 3) * 0.7);
    const h = 2.6 + (i % 4) * 0.35;
    pos.set(p.x + p.ox * lat, 0, p.z + p.oz * lat);
    scl.set(1, h, 1);
    quat.identity();
    m.compose(pos, quat, scl);
    trunks.setMatrixAt(i, m);
    for (let k = 0; k < 5; k++) {
      qYaw.setFromAxisAngle(up, (k / 5) * TAU + i);
      quat.copy(qYaw).multiply(qTilt);
      pos.set(p.x + p.ox * lat, h, p.z + p.oz * lat);
      scl.set(1, 1, 1);
      m.compose(pos, quat, scl);
      leaves.setMatrixAt(i * 5 + k, m);
    }
  }
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks, leaves);
}

function buildRocks(scene: THREE.Scene, bin: Bin, toon: Toon) {
  const count = 16;
  const mesh = new THREE.InstancedMesh(
    bin.add(new THREE.DodecahedronGeometry(0.55, 0)),
    toon(0xc4b08a),
    count,
  );
  const p: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU + 0.3;
    trackPoint(t, p);
    const side = i % 2 === 0 ? 1 : -1;
    const lat = side * (ROAD_HALF + 1.8 + (i % 3) * 0.4);
    const s = 0.45 + (i % 3) * 0.18;
    pos.set(p.x + p.ox * lat, 0.2 * s, p.z + p.oz * lat);
    scl.set(s, s * 0.7, s);
    quat.setFromEuler(new THREE.Euler(0, t, 0));
    m.compose(pos, quat, scl);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

function buildBuoys(scene: THREE.Scene, bin: Bin, toon: Toon) {
  const buoys: THREE.Object3D[] = [];
  const bodyGeo = bin.add(new THREE.SphereGeometry(0.35, 10, 8));
  const hatGeo = bin.add(new THREE.ConeGeometry(0.12, 0.45, 6));
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * TAU;
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, toon(i % 2 ? 0xef6b2c : 0xf7f1e6));
    body.scale.set(1, 0.8, 1);
    const hat = new THREE.Mesh(hatGeo, toon(0x1f8a8a));
    hat.position.y = 0.4;
    g.add(body, hat);
    g.position.set(Math.cos(t) * 54 * 0.42, 0.15, Math.sin(t) * 34 * 0.42);
    g.userData.base = g.position.y;
    g.userData.phase = i;
    scene.add(g);
    buoys.push(g);
  }
  return buoys;
}

function buildClouds(scene: THREE.Scene, bin: Bin, toon: Toon) {
  const clouds = new THREE.Group();
  const puff = bin.add(new THREE.SphereGeometry(1, 10, 8));
  const mat = toon(0xfff6ea);
  const spots = [
    [30, 32, -10],
    [-40, 28, 20],
    [10, 36, 50],
    [-20, 30, -45],
    [55, 26, 15],
    [-55, 34, -15],
  ];
  for (const [x, y, z] of spots) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(puff, mat);
      s.position.set(i * 1.3 - 1.2, (i % 2) * 0.3, 0);
      s.scale.setScalar(0.8 + (i % 2) * 0.35);
      g.add(s);
    }
    g.position.set(x ?? 0, y ?? 30, z ?? 0);
    clouds.add(g);
  }
  scene.add(clouds);
  return clouds;
}
