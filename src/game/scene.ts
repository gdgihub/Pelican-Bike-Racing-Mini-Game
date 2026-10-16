import * as THREE from "three";
import type { AudioHandle } from "./audio";
import { Bin, createToon } from "./materials";
import { createRider } from "./rider";
import { createSim, step, toHud, type Hud, type Input, type Sim } from "./sim";
import { GULL_COUNT, ROAD_Y, gullPose, type GullPose } from "./track";
import { buildWorld } from "./world";

export type TouchState = {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  drift: boolean;
};

const EMPTY_TOUCH: TouchState = {
  left: false,
  right: false,
  gas: false,
  brake: false,
  drift: false,
};

export type RideHooks = {
  getRunning: () => boolean;
  getTouch: () => TouchState;
  getAudio: () => AudioHandle | null;
  onHud: (hud: Hud) => void;
};

type Spark = { life: number; mesh: THREE.Mesh; v: THREE.Vector3 };

export function mountRide(canvas: HTMLCanvasElement, hooks: RideHooks) {
  const bin = new Bin();
  const { toon, gradient } = createToon(bin);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf6c79a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 700);
  const world = buildWorld(scene, bin, toon, gradient);
  const rider = createRider(bin, toon);
  scene.add(rider.yawPivot);

  let sim = createSim();
  const fishes = buildFish(scene, bin, toon, sim);
  buildCoolers(scene, bin, toon, sim);
  const gulls = buildGulls(scene, bin, toon);
  const sparks = buildSparks(bin, scene, toon);

  const keys = new Set<string>();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desired = new THREE.Vector3();
  const lookDesired = new THREE.Vector3();
  const look = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const gullTmp: GullPose = { x: 0, z: 0, y: 0, yaw: 0 };
  let visualTime = 0;
  let acc = 0;
  let hudAt = 0;
  let sparkAt = 0;
  let shake = 0;
  let lean = 0;
  let camReady = false;
  let alive = true;
  let raf = 0;
  let visualY = ROAD_Y;

  const onKeyDown = (e: KeyboardEvent) => {
    const ride = hooks.getRunning();
    if (
      ride &&
      (e.code === "Space" ||
        e.code.startsWith("Arrow") ||
        e.code === "KeyW" ||
        e.code === "KeyA" ||
        e.code === "KeyS" ||
        e.code === "KeyD")
    ) {
      e.preventDefault();
    }
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const onBlur = () => keys.clear();
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onBlur);

  if (import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa")) {
    window.__controlsTest = {
      getYaw: () => sim.yaw,
      getSpeed: () => sim.fSpeed,
      setKeys: (codes: string[]) => {
        keys.clear();
        for (const code of codes) keys.add(code);
      },
    };
  }

  function readInput(): Input {
    const touch = hooks.getTouch() ?? EMPTY_TOUCH;
    let steer = 0;
    let throttle = 0;
    if (touch.left || keys.has("KeyA") || keys.has("ArrowLeft")) steer += 1;
    if (touch.right || keys.has("KeyD") || keys.has("ArrowRight")) steer -= 1;
    if (touch.gas || keys.has("KeyW") || keys.has("ArrowUp")) throttle += 1;
    if (touch.brake || keys.has("KeyS") || keys.has("ArrowDown")) throttle -= 1;
    steer = Math.max(-1, Math.min(1, steer));
    throttle = Math.max(-1, Math.min(1, throttle));
    const drift = touch.drift || keys.has("Space") || keys.has("ShiftLeft") || keys.has("ShiftRight");
    return { steer, throttle, drift };
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function frame(now: number) {
    if (!alive) return;
    const t = now * 0.001;
    const dt = Math.min(0.05, Math.max(0, t - visualTime || 0.016));
    visualTime = t;
    const running = hooks.getRunning();
    const audio = hooks.getAudio();

    if (running) {
      acc += dt;
      let steps = 0;
      let collect = 0;
      let boost = false;
      let hit = false;
      let lap = false;
      let finish = false;
      while (acc >= 1 / 60 && steps < 5) {
        const ev = step(sim, readInput(), 1 / 60);
        collect += ev.collect;
        boost = boost || ev.boost;
        hit = hit || ev.hit;
        lap = lap || ev.lap;
        finish = finish || ev.finish;
        acc -= 1 / 60;
        steps += 1;
      }
      if (audio) {
        if (collect) audio.playCollect();
        if (boost) audio.playBoost();
        if (hit) audio.playHit();
        if (finish) audio.playFinish();
        else if (lap) audio.playLap();
        audio.pedal(sim.phase, sim.fSpeed);
        audio.ambience(dt);
      }
      if (hit) shake = Math.min(1, shake + 0.7);
      if (boost) shake = Math.min(1, shake + 0.25);
      if (collect) burst(sim.x, 1.2, sim.z, 8);
    } else {
      acc = 0;
    }

    const fx = -Math.sin(sim.yaw);
    const fz = -Math.cos(sim.yaw);
    forward.set(fx, 0, fz);
    const targetY = sim.offtrack && running ? 0.05 : ROAD_Y;
    visualY += (targetY - visualY) * (1 - Math.exp(-8 * dt));
    rider.yawPivot.position.set(sim.x, visualY, sim.z);
    rider.yawPivot.rotation.y = sim.yaw + Math.PI;
    const input = running ? readInput() : { steer: 0, throttle: 0, drift: false };
    lean += ((running ? -input.steer * 0.32 : 0) - lean) * (1 - Math.exp(-8 * dt));
    const phase = running ? sim.phase : visualTime * (reduce ? 0 : 1.6);
    const boostMix = Math.min(1, sim.boostT);
    rider.update({
      phase,
      lean: reduce ? 0 : lean,
      boost: boostMix,
      time: visualTime,
      hit: sim.hitFlash,
    });

    for (let i = 0; i < fishes.length; i++) {
      const fish = sim.fish[i];
      const mesh = fishes[i];
      if (!fish || !mesh) continue;
      mesh.visible = !fish.taken;
      mesh.position.set(fish.x, 0.85 + Math.sin(visualTime * 2.2 + i) * 0.12, fish.z);
      mesh.rotation.y = visualTime * 1.4 + i;
    }
    for (let i = 0; i < gulls.length; i++) {
      gullPose(i, running ? sim.time : visualTime * 0.25, gullTmp);
      const g = gulls[i];
      if (!g) continue;
      g.position.set(gullTmp.x, gullTmp.y, gullTmp.z);
      g.rotation.y = gullTmp.yaw + Math.PI;
      const wing = g.userData.wing as number;
      const flap = Math.sin(visualTime * 12 + i) * (reduce ? 0.1 : 0.55);
      g.children[wing]!.rotation.z = 0.35 + flap;
      g.children[wing + 1]!.rotation.z = -0.35 - flap;
    }
    for (const b of world.buoys) {
      const phaseB = (b.userData.phase as number) ?? 0;
      b.position.y = 0.15 + Math.sin(visualTime * 1.4 + phaseB) * 0.12;
    }
    world.clouds.rotation.y = visualTime * (reduce ? 0 : 0.012);
    world.waterMat.uniforms.uTime!.value = visualTime;

    if (running && sim.drifting && Math.abs(sim.fSpeed) > 3) {
      sparkAt += dt;
      if (sparkAt > 0.03) {
        sparkAt = 0;
        burst(sim.x - fx * 0.75, visualY + 0.25, sim.z - fz * 0.75, 1);
      }
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.v.y -= 6 * dt;
      const k = Math.max(s.life, 0);
      s.mesh.scale.setScalar(0.15 + k * 0.45);
      s.mesh.visible = s.life > 0;
    }
    shake *= Math.exp(-3.5 * dt);

    const wide = window.innerWidth >= 800;
    if (!running) {
      const swing = reduce ? 0.35 : Math.sin(visualTime * 0.35) * 0.55;
      desired.set(sim.x + Math.sin(swing) * 2.6 + (wide ? -2.8 : 0), wide ? 2.5 : 2.15, sim.z + (wide ? 6.8 : 5.5));
      lookDesired.set(sim.x + (wide ? 0.4 : 0), 1.55, sim.z + 0.35);
      camera.fov += (42 - camera.fov) * (1 - Math.exp(-3 * dt));
    } else {
      const follow = wide ? 8.4 : 7.2;
      const height = wide ? 3.15 : 2.7;
      desired.set(sim.x - fx * follow, visualY + height, sim.z - fz * follow);
      lookDesired.set(sim.x + fx * 3.4, visualY + 1.45, sim.z + fz * 3.4);
      const targetFov = 50 + Math.min(Math.abs(sim.fSpeed), 22) * 0.5 + (sim.boostT > 0 ? 5 : 0);
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-3 * dt));
    }
    const k = 1 - Math.exp(-(running ? 3.4 : 2.2) * dt);
    if (!camReady) {
      camera.position.copy(desired);
      look.copy(lookDesired);
      camReady = true;
    } else {
      camera.position.lerp(desired, k);
      look.lerp(lookDesired, k);
    }
    if (shake > 0.01 && !reduce) {
      camera.position.x += Math.sin(visualTime * 48) * shake * 0.18;
      camera.position.y += Math.cos(visualTime * 37) * shake * 0.12;
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    if (!reduce) camera.rotateZ(lean * -0.18);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    hudAt += dt;
    if (hudAt > 0.08) {
      hudAt = 0;
      hooks.onHud(toHud(sim));
    }
    raf = requestAnimationFrame(frame);
  }

  function burst(x: number, y: number, z: number, n: number) {
    let left = n;
    for (const s of sparks) {
      if (left <= 0) break;
      if (s.life > 0) continue;
      s.life = 0.35 + Math.random() * 0.2;
      s.mesh.visible = true;
      s.mesh.position.set(x, y, z);
      s.v.set((Math.random() - 0.5) * 3, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 3);
      left -= 1;
    }
  }

  raf = requestAnimationFrame(frame);

  return {
    reset() {
      sim = createSim();
      shake = 0;
      acc = 0;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onBlur);
      if (window.__controlsTest) delete window.__controlsTest;
      bin.dispose();
      renderer.dispose();
    },
  };
}

function buildFish(scene: THREE.Scene, bin: Bin, toon: (c: number) => THREE.Material, sim: Sim) {
  const bodyGeo = bin.add(new THREE.SphereGeometry(0.28, 10, 8));
  const tailGeo = bin.add(new THREE.ConeGeometry(0.16, 0.32, 6));
  const groups: THREE.Group[] = [];
  sim.fish.forEach((f, i) => {
    const g = new THREE.Group();
    const mat = toon(i % 2 ? 0xef6b2c : 0xf2f6f4);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.scale.set(0.7, 0.55, 1.25);
    const tail = new THREE.Mesh(tailGeo, mat);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.32;
    const eye = new THREE.Mesh(
      bin.add(new THREE.SphereGeometry(0.04, 6, 6)),
      bin.add(new THREE.MeshBasicMaterial({ color: 0x1a120c })),
    );
    eye.position.set(0.1, 0.06, 0.18);
    g.add(body, tail, eye);
    g.position.set(f.x, 0.9, f.z);
    scene.add(g);
    groups.push(g);
  });
  return groups;
}

function buildCoolers(scene: THREE.Scene, bin: Bin, toon: (c: number) => THREE.Material, sim: Sim) {
  const colors = [0xef6b2c, 0x1f8a8a, 0xe7c98a];
  const box = bin.add(new THREE.BoxGeometry(0.85, 0.62, 0.5));
  const lid = bin.add(new THREE.BoxGeometry(0.88, 0.1, 0.52));
  const groups: THREE.Group[] = [];
  for (const c of sim.crates) {
    const g = new THREE.Group();
    const hue = colors[c.hue] ?? 0x1f8a8a;
    const body = new THREE.Mesh(box, toon(hue));
    body.position.y = 0.31;
    const top = new THREE.Mesh(lid, toon(0xf7f1e6));
    top.position.y = 0.66;
    g.add(body, top);
    g.position.set(c.x, ROAD_Y, c.z);
    g.rotation.y = c.rot;
    scene.add(g);
    groups.push(g);
  }
  return groups;
}

function buildGulls(scene: THREE.Scene, bin: Bin, toon: (c: number) => THREE.Material) {
  const groups: THREE.Group[] = [];
  const bodyGeo = bin.add(new THREE.SphereGeometry(0.28, 10, 8));
  const headGeo = bin.add(new THREE.SphereGeometry(0.14, 8, 8));
  const beakGeo = bin.add(new THREE.ConeGeometry(0.05, 0.22, 6));
  const wingGeo = bin.add(new THREE.BoxGeometry(0.55, 0.05, 0.22));
  for (let i = 0; i < GULL_COUNT; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, toon(0xfffaf4));
    body.scale.set(0.7, 0.55, 1.35);
    const head = new THREE.Mesh(headGeo, toon(0xfffaf4));
    head.position.set(0, 0.12, 0.32);
    const beak = new THREE.Mesh(beakGeo, toon(0xe7c98a));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.1, 0.5);
    const wingL = new THREE.Mesh(wingGeo, toon(0xd9e4ea));
    wingL.position.set(-0.38, 0.05, 0);
    const wingR = new THREE.Mesh(wingGeo, toon(0xd9e4ea));
    wingR.position.set(0.38, 0.05, 0);
    g.add(body, head, beak, wingL, wingR);
    g.userData.wing = 3;
    scene.add(g);
    groups.push(g);
  }
  return groups;
}

function buildSparks(bin: Bin, scene: THREE.Scene, toon: (c: number) => THREE.Material) {
  const geo = bin.add(new THREE.SphereGeometry(0.12, 6, 6));
  const mat = toon(0xef6b2c);
  const sparks: Spark[] = [];
  for (let i = 0; i < 36; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ life: 0, mesh, v: new THREE.Vector3() });
  }
  return sparks;
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
    };
  }
}
