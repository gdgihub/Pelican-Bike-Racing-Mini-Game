import {
  GULL_COUNT,
  ROAD_HALF,
  SAND_HALF,
  SPAWN_THETA,
  TOTAL_LAPS,
  WHEEL_R,
  gullPose,
  layoutCrates,
  layoutFish,
  nearestTheta,
  sectorOf,
  spawnPose,
  trackPoint,
  type CrateSpot,
  type GullPose,
  type TrackPoint,
} from "./track";

const BEST_KEY = "pelican-fatfish-best-ms";

export type Input = { steer: number; throttle: number; drift: boolean };

export type Hud = {
  speed: number;
  lapsDone: number;
  fish: number;
  ms: number;
  charge: number;
  boosting: boolean;
  finished: boolean;
  offtrack: boolean;
  wrongWay: boolean;
  theta: number;
  yaw: number;
  bestMs: number | null;
  isNewBest: boolean;
  drifting: boolean;
};

export type StepEvents = {
  collect: number;
  boost: boolean;
  hit: boolean;
  lap: boolean;
  finish: boolean;
};

type Fish = {
  x: number;
  z: number;
  baseX: number;
  baseZ: number;
  taken: boolean;
  respawnAt: number;
};

export type Sim = {
  x: number;
  z: number;
  yaw: number;
  fSpeed: number;
  lat: number;
  phase: number;
  time: number;
  ms: number;
  laps: number;
  nextCp: number;
  lastSector: number;
  fishCount: number;
  fish: Fish[];
  crates: CrateSpot[];
  charge: number;
  wasDrift: boolean;
  drifting: boolean;
  boostT: number;
  hitCd: number;
  hitFlash: number;
  offtrack: boolean;
  wrongWay: boolean;
  finished: boolean;
  saved: boolean;
  isNewBest: boolean;
  bestMs: number | null;
  theta: number;
};

function loadBest(): number | null {
  try {
    const n = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function saveBest(sim: Sim) {
  if (sim.saved) return;
  sim.saved = true;
  const prev = sim.bestMs;
  if (prev === null || sim.ms < prev) {
    sim.isNewBest = true;
    sim.bestMs = sim.ms;
    try {
      localStorage.setItem(BEST_KEY, String(sim.ms));
    } catch {
      /* private mode */
    }
  }
}

export function createSim(): Sim {
  const spawn = spawnPose();
  const spots = layoutFish();
  return {
    x: spawn.x,
    z: spawn.z,
    yaw: spawn.yaw,
    fSpeed: 0,
    lat: 0,
    phase: 0,
    time: 0,
    ms: 0,
    laps: 0,
    nextCp: 1,
    lastSector: sectorOf(SPAWN_THETA),
    fishCount: 0,
    fish: spots.map((s) => ({
      x: s.x,
      z: s.z,
      baseX: s.x,
      baseZ: s.z,
      taken: false,
      respawnAt: 0,
    })),
    crates: layoutCrates(),
    charge: 0,
    wasDrift: false,
    drifting: false,
    boostT: 0,
    hitCd: 0,
    hitFlash: 0,
    offtrack: false,
    wrongWay: false,
    finished: false,
    saved: false,
    isNewBest: false,
    bestMs: loadBest(),
    theta: spawn.theta,
  };
}

export function toHud(sim: Sim): Hud {
  return {
    speed: sim.fSpeed,
    lapsDone: sim.laps,
    fish: sim.fishCount,
    ms: sim.ms,
    charge: sim.charge,
    boosting: sim.boostT > 0,
    finished: sim.finished,
    offtrack: sim.offtrack,
    wrongWay: sim.wrongWay,
    theta: sim.theta,
    yaw: sim.yaw,
    bestMs: sim.bestMs,
    isNewBest: sim.isNewBest,
    drifting: sim.drifting,
  };
}

const ev: StepEvents = { collect: 0, boost: false, hit: false, lap: false, finish: false };
const pt: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
const gullTmp: GullPose = { x: 0, z: 0, y: 0, yaw: 0 };

function clearEv(): StepEvents {
  ev.collect = 0;
  ev.boost = false;
  ev.hit = false;
  ev.lap = false;
  ev.finish = false;
  return ev;
}

function bump(sim: Sim, dx: number, dz: number) {
  sim.hitCd = 0.85;
  sim.fSpeed *= 0.48;
  sim.hitFlash = 1;
  const len = Math.hypot(dx, dz) || 1;
  sim.x += (dx / len) * 0.55;
  sim.z += (dz / len) * 0.55;
  ev.hit = true;
}

/**
 * Chase-cam vehicle basis (do not flip):
 * A / left → steer +1 → yaw increases → nose goes left on screen.
 * forward = (-sin yaw, 0, -cos yaw).
 */
export function step(sim: Sim, input: Input, dt: number): StepEvents {
  clearEv();
  if (sim.finished) return ev;

  sim.time += dt;
  sim.ms += dt * 1000;
  sim.hitFlash = Math.max(0, sim.hitFlash - dt * 1.8);
  if (sim.hitCd > 0) sim.hitCd -= dt;
  if (sim.boostT > 0) sim.boostT = Math.max(0, sim.boostT - dt);

  const steer = Math.max(-1, Math.min(1, input.steer));
  const throttle = Math.max(-1, Math.min(1, input.throttle));
  const speedFactor = Math.max(0.4, Math.min(1, Math.abs(sim.fSpeed) / 8));
  const reverse = sim.fSpeed >= 0 ? 1 : -1;
  const drifting = input.drift && sim.fSpeed > 4.2 && Math.abs(steer) > 0.2;
  sim.drifting = drifting;

  const turnRate = drifting ? 2.55 : 1.9;
  sim.yaw += steer * turnRate * speedFactor * reverse * dt;

  if (throttle > 0) sim.fSpeed += 15 * throttle * dt;
  else if (throttle < 0) sim.fSpeed -= 22 * dt;

  const drag = throttle === 0 ? 0.55 : 0.16;
  sim.fSpeed *= Math.exp(-drag * dt);
  if (Math.abs(sim.fSpeed) < 0.08 && throttle === 0) sim.fSpeed = 0;

  const maxF = sim.boostT > 0 ? 26 : 16.5;
  if (sim.fSpeed > maxF) sim.fSpeed = maxF;
  if (sim.fSpeed < -6.5) sim.fSpeed = -6.5;

  const grip = drifting ? 1.5 : 7.5;
  sim.lat *= Math.exp(-grip * dt);
  if (drifting) sim.lat += steer * Math.abs(sim.fSpeed) * 1.15 * dt;
  if (sim.lat > 7) sim.lat = 7;
  if (sim.lat < -7) sim.lat = -7;

  const fx = -Math.sin(sim.yaw);
  const fz = -Math.cos(sim.yaw);
  const rx = Math.cos(sim.yaw);
  const rz = -Math.sin(sim.yaw);
  sim.x += (fx * sim.fSpeed + rx * sim.lat) * dt;
  sim.z += (fz * sim.fSpeed + rz * sim.lat) * dt;
  sim.phase += (Math.abs(sim.fSpeed) / WHEEL_R) * dt;

  const theta = nearestTheta(sim.x, sim.z);
  const dth = Math.atan2(Math.sin(theta - sim.theta), Math.cos(theta - sim.theta));
  sim.wrongWay = dth < -0.012 && sim.fSpeed > 4.5;
  sim.theta = theta;

  trackPoint(theta, pt);
  const lateral = (sim.x - pt.x) * pt.ox + (sim.z - pt.z) * pt.oz;
  const absLat = Math.abs(lateral);
  sim.offtrack = absLat > ROAD_HALF + 0.25;
  if (sim.offtrack) {
    const excess = absLat - ROAD_HALF;
    sim.fSpeed *= Math.exp(-Math.min(excess, 7) * 1.05 * dt);
    sim.lat *= Math.exp(-2.4 * dt);
  }
  const hard = SAND_HALF + 0.4;
  if (absLat > hard) {
    const dir = Math.sign(lateral) || 1;
    const delta = dir * hard - lateral;
    sim.x += pt.ox * delta;
    sim.z += pt.oz * delta;
    sim.fSpeed *= 0.92;
  }

  const sec = sectorOf(sim.theta);
  if (sec !== sim.lastSector) {
    if (sec === sim.nextCp) {
      if (sim.nextCp === 0) {
        sim.laps += 1;
        ev.lap = true;
        if (sim.laps >= TOTAL_LAPS) {
          sim.finished = true;
          ev.finish = true;
          saveBest(sim);
        }
      }
      sim.nextCp = (sim.nextCp + 1) % 8;
    }
    sim.lastSector = sec;
  }

  if (drifting) {
    sim.charge = Math.min(1, sim.charge + dt * 0.7);
    sim.wasDrift = true;
  } else if (sim.wasDrift) {
    if (sim.charge > 0.42) {
      sim.boostT = 0.65 + sim.charge * 0.55;
      sim.fSpeed += 5 + sim.charge * 6;
      ev.boost = true;
    }
    sim.charge = 0;
    sim.wasDrift = false;
  } else if (sim.charge > 0) {
    sim.charge = Math.max(0, sim.charge - dt * 0.5);
  }

  const fishR = 1.6 * 1.6;
  for (const f of sim.fish) {
    if (f.taken) {
      if (sim.time >= f.respawnAt) {
        f.taken = false;
        f.x = f.baseX;
        f.z = f.baseZ;
      }
      continue;
    }
    const dx = sim.x - f.x;
    const dz = sim.z - f.z;
    if (dx * dx + dz * dz < fishR) {
      f.taken = true;
      f.respawnAt = sim.time + 9;
      sim.fishCount += 1;
      ev.collect += 1;
    }
  }

  if (sim.hitCd <= 0) {
    const crateR = 1.2 * 1.2;
    for (const c of sim.crates) {
      const dx = sim.x - c.x;
      const dz = sim.z - c.z;
      if (dx * dx + dz * dz < crateR) {
        bump(sim, dx, dz);
        break;
      }
    }
  }
  if (sim.hitCd <= 0) {
    const gullR = 1.25 * 1.25;
    for (let i = 0; i < GULL_COUNT; i++) {
      gullPose(i, sim.time, gullTmp);
      const dx = sim.x - gullTmp.x;
      const dz = sim.z - gullTmp.z;
      if (dx * dx + dz * dz < gullR) {
        bump(sim, dx, dz);
        break;
      }
    }
  }

  return ev;
}
