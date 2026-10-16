import * as THREE from "three";

export class Bin {
  private items: Array<{ dispose: () => void }> = [];

  add<T extends { dispose: () => void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose() {
    for (const item of this.items) item.dispose();
    this.items.length = 0;
  }
}

export function createToon(bin: Bin) {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 1;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("gradient");
  ["#4a3b30", "#a88868", "#f0d2b0", "#fff8f0"].forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(i, 0, 1, 1);
  });
  const gradient = bin.add(new THREE.CanvasTexture(canvas));
  gradient.magFilter = THREE.NearestFilter;
  gradient.minFilter = THREE.NearestFilter;
  gradient.colorSpace = THREE.NoColorSpace;

  const toon = (color: number, side: THREE.Side = THREE.FrontSide) =>
    bin.add(new THREE.MeshToonMaterial({ color, gradientMap: gradient, side }));

  return { gradient, toon };
}

export function woodTexture(bin: Bin) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("wood");
  g.fillStyle = "#c4894a";
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = y % 32 === 0 ? "#a56b32" : "#d7a15c";
    g.fillRect(0, y + 1, 256, 13);
    g.strokeStyle = "rgba(70, 36, 12, 0.35)";
    g.beginPath();
    g.moveTo(0, y + 8);
    g.bezierCurveTo(80, y + 4, 160, y + 12, 256, y + 7);
    g.stroke();
  }
  g.strokeStyle = "rgba(60, 30, 8, 0.45)";
  g.lineWidth = 2;
  for (let y = 0; y < 256; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  const tex = bin.add(new THREE.CanvasTexture(canvas));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function sandTexture(bin: Bin) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("sand");
  g.fillStyle = "#e7c98a";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 180; i++) {
    g.fillStyle = i % 2 ? "rgba(160, 110, 50, 0.35)" : "rgba(255, 236, 190, 0.4)";
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = bin.add(new THREE.CanvasTexture(canvas));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
