export const TAU = Math.PI * 2;
export const TRACK_A = 54;
export const TRACK_B = 34;
export const ROAD_HALF = 6;
export const SAND_HALF = 13.5;
export const CP_COUNT = 8;
export const TOTAL_LAPS = 3;
export const WHEEL_R = 0.48;
export const ROAD_Y = 0.16;
export const SPAWN_THETA = 0.22;
export const GULL_COUNT = 3;
export const FISH_COUNT = 18;

export type TrackPoint = {
  x: number;
  z: number;
  tx: number;
  tz: number;
  ox: number;
  oz: number;
};

const scratch: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
const gullScratch: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };

export function trackPoint(theta: number, out: TrackPoint): TrackPoint {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  out.x = TRACK_A * c;
  out.z = TRACK_B * s;
  let tx = -TRACK_A * s;
  let tz = TRACK_B * c;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len;
  tz /= len;
  out.tx = tx;
  out.tz = tz;
  out.ox = tz;
  out.oz = -tx;
  return out;
}

/** yaw whose forward (-sin yaw, -cos yaw) matches (fx, fz). */
export function yawFromForward(fx: number, fz: number): number {
  return Math.atan2(-fx, -fz);
}

function dist2(x: number, z: number, theta: number): number {
  trackPoint(theta, scratch);
  const dx = x - scratch.x;
  const dz = z - scratch.z;
  return dx * dx + dz * dz;
}

export function nearestTheta(x: number, z: number): number {
  let bestT = 0;
  let bestD = Infinity;
  const N = 48;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const d = dist2(x, z, t);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  let step = TAU / N;
  let t = bestT;
  for (let k = 0; k < 12; k++) {
    step *= 0.5;
    const dM = dist2(x, z, t);
    const dL = dist2(x, z, t - step);
    const dR = dist2(x, z, t + step);
    if (dL < dM && dL <= dR) t -= step;
    else if (dR < dM) t += step;
  }
  return ((t % TAU) + TAU) % TAU;
}

export function sectorOf(theta: number): number {
  const u = ((theta % TAU) + TAU) % TAU;
  return Math.floor((u / TAU) * CP_COUNT) % CP_COUNT;
}

export function spawnPose(): { x: number; z: number; yaw: number; theta: number } {
  const p: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
  trackPoint(SPAWN_THETA, p);
  return { x: p.x, z: p.z, yaw: yawFromForward(p.tx, p.tz), theta: SPAWN_THETA };
}

const CRATE_SPEC: { theta: number; lat: number }[] = [
  { theta: 0.7, lat: 3.15 },
  { theta: 1.35, lat: -3.35 },
  { theta: 2.1, lat: 2.7 },
  { theta: 2.75, lat: -3.2 },
  { theta: 3.5, lat: 3.25 },
  { theta: 4.2, lat: -2.65 },
  { theta: 4.9, lat: 3.05 },
  { theta: 5.6, lat: -3.15 },
];

export type CrateSpot = { x: number; z: number; rot: number; hue: number };

export function layoutCrates(): CrateSpot[] {
  const p: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
  return CRATE_SPEC.map((s, i) => {
    trackPoint(s.theta, p);
    return {
      x: p.x + p.ox * s.lat,
      z: p.z + p.oz * s.lat,
      rot: s.theta * 0.6,
      hue: i % 3,
    };
  });
}

export type Spot = { x: number; z: number };

export function layoutFish(): Spot[] {
  const p: TrackPoint = { x: 0, z: 0, tx: 0, tz: 0, ox: 0, oz: 0 };
  const out: Spot[] = [];
  for (let i = 0; i < FISH_COUNT; i++) {
    const theta = 0.36 + (i * TAU) / FISH_COUNT;
    const lat = ((i % 5) - 2) * 1.15;
    trackPoint(theta, p);
    out.push({ x: p.x + p.ox * lat, z: p.z + p.oz * lat });
  }
  return out;
}

export type GullPose = { x: number; z: number; y: number; yaw: number };

export function gullPose(i: number, time: number, out: GullPose): GullPose {
  const theta = ((i + 0.45) / GULL_COUNT) * TAU + time * 0.26;
  trackPoint(theta, gullScratch);
  const lat = Math.sin(time * 1.15 + i * 2.2) * (ROAD_HALF * 0.62);
  out.x = gullScratch.x + gullScratch.ox * lat;
  out.z = gullScratch.z + gullScratch.oz * lat;
  out.y = 1.15 + Math.sin(time * 2.1 + i * 1.7) * 0.12;
  out.yaw = yawFromForward(gullScratch.tx, gullScratch.tz);
  return out;
}
