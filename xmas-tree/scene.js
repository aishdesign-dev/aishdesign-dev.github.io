import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const TREE_H = 3.05;
const TREE_R = 1.16;
const HERO_ANGLE = 0.52;
const SPIN = 0.11;
const MOON = { x: 0.42, y: 6.25, z: -12.2, r: 1.62 };

const ORNAMENTS = [
  { h: 0.24, a: 0.45, s: 0.13, color: 0xff4f8b, gem: "oct", thick: 140 },
  { h: 0.38, a: 1.15, s: 0.1, color: 0xb79cff, gem: "ico", thick: 220 },
  { h: 0.5, a: 1.85, s: 0.14, color: 0x2f6bff, gem: "oct", thick: 180 },
  { h: 0.62, a: 2.45, s: 0.09, color: 0xffc857, gem: "ico", thick: 260 },
  { h: 0.3, a: 2.95, s: 0.11, color: 0x2ee6d6, gem: "oct", thick: 200 },
  { h: 0.7, a: 0.15, s: 0.1, color: 0xff4f8b, gem: "ico", thick: 300 },
  { h: 0.44, a: 3.35, s: 0.12, color: 0xb79cff, gem: "oct", thick: 160 },
  { h: 0.56, a: 0.9, s: 0.08, color: 0x2f6bff, gem: "ico", thick: 340 },
  { h: 0.2, a: 4.3, s: 0.11, color: 0xffc857, gem: "oct", thick: 210 },
  { h: 0.48, a: 5.1, s: 0.13, color: 0xff4f8b, gem: "ico", thick: 250 },
  { h: 0.66, a: 4.7, s: 0.09, color: 0x2ee6d6, gem: "oct", thick: 190 },
  { h: 0.34, a: 5.7, s: 0.12, color: 0xb79cff, gem: "ico", thick: 280 },
];

const GIFTS = [
  { x: -1.12, z: 1.12, w: 0.4, h: 0.32, d: 0.34, rot: 0.4, color: 0x2f6bff, ribbon: 0xffc857 },
  { x: -0.42, z: 1.38, w: 0.28, h: 0.22, d: 0.28, rot: -0.35, color: 0xff4f8b, ribbon: 0xffc857 },
  { x: 0.28, z: 1.32, w: 0.44, h: 0.3, d: 0.36, rot: 0.12, color: 0xb79cff, ribbon: 0x2ee6d6 },
  { x: 0.92, z: 1.02, w: 0.3, h: 0.36, d: 0.3, rot: -0.5, color: 0xffc857, ribbon: 0xff4f8b },
  { x: -0.88, z: 1.58, w: 0.24, h: 0.2, d: 0.24, rot: 0.7, color: 0x2ee6d6, ribbon: 0xffc857 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutBack(t) {
  const c = 1.70158;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

function easeOutBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

function canvasTexture(draw) {
  const canvas = document.createElement("canvas");
  draw(canvas);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function discTexture(stops) {
  return canvasTexture((canvas) => {
    canvas.width = canvas.height = 256;
    const g = canvas.getContext("2d");
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [at, color] of stops) grd.addColorStop(at, color);
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
}

function moonTexture() {
  return canvasTexture((canvas) => {
    canvas.width = canvas.height = 512;
    const g = canvas.getContext("2d");
    g.fillStyle = "#f4e9c8";
    g.fillRect(0, 0, 512, 512);
    const spots = [
      [190, 210, 78],
      [300, 280, 96],
      [230, 140, 40],
      [340, 170, 32],
      [150, 320, 36],
      [280, 380, 48],
      [120, 180, 22],
    ];
    for (const [x, y, r] of spots) {
      const grd = g.createRadialGradient(x, y, r * 0.15, x, y, r);
      grd.addColorStop(0, "rgba(168, 146, 108, 0.55)");
      grd.addColorStop(1, "rgba(244, 233, 200, 0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const limb = g.createRadialGradient(256, 256, 150, 256, 256, 256);
    limb.addColorStop(0, "rgba(0,0,0,0)");
    limb.addColorStop(1, "rgba(70, 54, 32, 0.42)");
    g.fillStyle = limb;
    g.fillRect(0, 0, 512, 512);
  });
}

function skyTexture() {
  return canvasTexture((canvas) => {
    canvas.width = 32;
    canvas.height = 512;
    const g = canvas.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, "#070b1f");
    grd.addColorStop(0.42, "#0b1440");
    grd.addColorStop(0.72, "#101848");
    grd.addColorStop(1, "#070b1f");
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 512);
  });
}

function crystalMaterial(hex, thickness) {
  const color = new THREE.Color(hex);
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.12,
    roughness: 0.08,
    iridescence: 1,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [thickness, thickness + 320],
    emissive: color,
    emissiveIntensity: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.35,
  });
}

function helixStrip(turns, y0, y1, width, segments) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = y0 + (y1 - y0) * t;
    const r = TREE_R * (1 - (y - y0) / (y1 - y0 + 0.001)) + 0.045;
    const a = t * turns * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    positions.push(c * r, y, s * r);
    positions.push(c * (r - width * 0.25), y + width, s * (r - width * 0.25));
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.setDrawRange(0, 0);
  return geo;
}

function starGeometry() {
  const shape = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 0.36 : 0.15;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  geo.center();
  return geo;
}

function ridge(heights, color, z) {
  const shape = new THREE.Shape();
  shape.moveTo(-14, 0);
  const step = 28 / (heights.length - 1);
  heights.forEach((h, i) => shape.lineTo(-14 + i * step, h));
  shape.lineTo(14, 0);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(0, 0, z);
  return mesh;
}

function pine(height, radius) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x050814 });
  const lower = new THREE.Mesh(new THREE.ConeGeometry(radius, height * 0.62, 7), mat);
  lower.position.y = height * 0.38;
  const upper = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.68, height * 0.48, 7), mat);
  upper.position.y = height * 0.72;
  group.add(lower, upper);
  return group;
}

function makeFlatDeer(mat) {
  const g = new THREE.Group();
  const add = (mesh, x, y, rot = 0, sx = 1, sy = 1) => {
    mesh.position.set(x, y, 0);
    mesh.rotation.z = rot;
    mesh.scale.set(sx, sy, 1);
    g.add(mesh);
    return mesh;
  };
  add(new THREE.Mesh(new THREE.CircleGeometry(1, 18), mat), 0.02, 0.3, 0, 0.36, 0.13);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.22), mat), 0.32, 0.4, -0.95);
  add(new THREE.Mesh(new THREE.CircleGeometry(1, 14), mat), 0.48, 0.52, 0, 0.12, 0.08);
  add(new THREE.Mesh(new THREE.CircleGeometry(1, 10), mat), 0.58, 0.49, 0, 0.075, 0.04);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.1), mat), 0.42, 0.6, 0.5);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.2), mat), 0.16, 0.16, 0.55);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.18), mat), 0.28, 0.15, 1.15);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.2), mat), -0.14, 0.16, -0.45);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.16), mat), -0.02, 0.14, 0.85);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.16), mat), 0.4, 0.68, 0.45);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.12), mat), 0.5, 0.66, -0.55);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.1), mat), 0.36, 0.74, 1.1);
  return g;
}

function makeSleigh(mat) {
  const g = new THREE.Group();
  const add = (mesh, x, y, rot = 0) => {
    mesh.position.set(x, y, 0);
    mesh.rotation.z = rot;
    g.add(mesh);
  };
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.26), mat), 0, 0.26);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.42), mat), -0.3, 0.34, 0.12);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.03), mat), 0.02, 0.05);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.2), mat), 0.38, 0.16, -0.7);
  const sack = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), mat);
  sack.scale.y = 0.82;
  add(sack, -0.08, 0.4);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), mat), 0.08, 0.44);
  add(new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), mat), 0.1, 0.58);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), mat), 0.13, 0.68, 0.35);
  return g;
}

function sampleDeer(rng) {
  const pts = [];
  const cols = [];
  const red = new THREE.Color("#e5384f");
  const gold = new THREE.Color("#ffc857");
  const hot = new THREE.Color("#ffe7a8");
  function push(x, y, z, chance) {
    pts.push(x, y, z);
    const roll = rng();
    const c = roll < chance * 0.35 ? hot : roll < chance ? gold : red;
    cols.push(c.r, c.g, c.b);
  }
  function ellipsoid(n, cx, cy, cz, rx, ry, rz, chance) {
    let i = 0;
    let guard = 0;
    while (i < n && guard < n * 40) {
      guard += 1;
      const x = rng() * 2 - 1;
      const y = rng() * 2 - 1;
      const z = rng() * 2 - 1;
      if (x * x + y * y + z * z > 1) continue;
      push(cx + x * rx, cy + y * ry, cz + z * rz, chance);
      i += 1;
    }
  }
  function capsule(n, ax, ay, az, bx, by, bz, r, chance) {
    for (let i = 0; i < n; i++) {
      const t = rng();
      const ang = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * r;
      push(
        ax + (bx - ax) * t + Math.cos(ang) * rad,
        ay + (by - ay) * t + Math.sin(ang) * rad * 0.45,
        az + (bz - az) * t + Math.sin(ang) * rad,
        chance,
      );
    }
  }
  ellipsoid(460, 0.02, 0.22, 0, 0.52, 0.2, 0.15, 0.32);
  ellipsoid(100, 0.4, 0.28, 0, 0.18, 0.15, 0.12, 0.4);
  ellipsoid(90, -0.34, 0.18, 0, 0.2, 0.16, 0.12, 0.34);
  capsule(80, 0.42, 0.32, 0, 0.72, 0.64, 0, 0.085, 0.45);
  ellipsoid(80, 0.82, 0.72, 0, 0.16, 0.11, 0.09, 0.5);
  ellipsoid(30, 0.98, 0.66, 0, 0.1, 0.055, 0.05, 0.8);
  ellipsoid(16, 0.72, 0.84, 0.02, 0.045, 0.09, 0.03, 0.25);
  ellipsoid(24, -0.58, 0.34, 0, 0.08, 0.1, 0.05, 0.9);
  capsule(40, 0.32, 0.1, 0.04, 0.55, -0.15, 0.05, 0.042, 0.4);
  capsule(30, 0.55, -0.15, 0.05, 0.78, -0.42, 0.03, 0.032, 0.55);
  capsule(34, 0.16, 0.08, -0.03, 0.0, -0.24, -0.02, 0.038, 0.35);
  capsule(26, 0.0, -0.24, -0.02, -0.16, -0.48, 0, 0.028, 0.5);
  capsule(36, -0.26, 0.08, 0.03, -0.58, -0.1, 0.04, 0.04, 0.4);
  capsule(26, -0.58, -0.1, 0.04, -0.82, 0.1, 0.02, 0.028, 0.6);
  capsule(30, -0.16, 0.05, -0.04, -0.42, -0.28, -0.03, 0.034, 0.35);
  capsule(24, 0.76, 0.82, 0, 0.62, 1.16, 0.02, 0.022, 0.95);
  capsule(14, 0.68, 1.0, 0, 0.5, 1.1, 0, 0.016, 0.98);
  capsule(14, 0.7, 1.06, 0, 0.86, 1.2, 0.02, 0.016, 0.98);
  capsule(20, 0.8, 0.84, 0, 0.96, 1.14, -0.02, 0.02, 0.95);
  capsule(12, 0.9, 1.0, 0, 1.04, 1.08, 0, 0.014, 0.98);
  return {
    count: pts.length / 3,
    position: new Float32Array(pts),
    color: new Float32Array(cols),
  };
}

export function createScene(canvas, { corner = false, preserveDrawingBuffer = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x070b1f, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 90);

  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch {
    scene.environment = null;
  }

  scene.add(new THREE.AmbientLight(0xb7c0ea, 0.72));
  const moonLight = new THREE.DirectionalLight(0xfff1cf, 1.55);
  moonLight.position.set(-3, 10, 2);
  scene.add(moonLight);
  const tealRim = new THREE.DirectionalLight(0x2ee6d6, 0.65);
  tealRim.position.set(4, 2, -3);
  scene.add(tealRim);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(42, 32, 24),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -2;
  scene.add(sky);

  const rng = mulberry32(20261225);

  const starCount = 520;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starBase = new Float32Array(starCount * 3);
  const starPhase = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (rng() - 0.5) * 36;
    starPositions[i * 3 + 1] = rng() * 16 + 0.4;
    starPositions[i * 3 + 2] = -14 - rng() * 12;
    const hot = rng();
    const color = hot > 0.92 ? new THREE.Color("#ffc857") : hot > 0.84 ? new THREE.Color("#b7d0ff") : new THREE.Color("#ffffff");
    const shade = 0.45 + rng() * 0.55;
    starBase[i * 3] = color.r * shade;
    starBase[i * 3 + 1] = color.g * shade;
    starBase[i * 3 + 2] = color.b * shade;
    starPhase[i] = rng() * Math.PI * 2;
  }
  starColors.set(starBase);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      size: 0.055,
      map: discTexture([[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,0.7)"], [1, "rgba(255,255,255,0)"]]),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);

  const brightGeo = new THREE.BufferGeometry();
  const brightPos = new Float32Array(70 * 3);
  for (let i = 0; i < 70; i++) {
    brightPos[i * 3] = (rng() - 0.5) * 28;
    brightPos[i * 3 + 1] = 2 + rng() * 12;
    brightPos[i * 3 + 2] = -15 - rng() * 8;
  }
  brightGeo.setAttribute("position", new THREE.BufferAttribute(brightPos, 3));
  const brightStars = new THREE.Points(
    brightGeo,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.11,
      map: stars.material.map,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  brightStars.frustumCulled = false;
  scene.add(brightStars);

  const moonMat = new THREE.MeshBasicMaterial({ map: moonTexture(), color: 0xfff6df });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON.r, 48, 32), moonMat);
  moon.position.set(MOON.x, MOON.y, MOON.z);
  scene.add(moon);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: discTexture([
        [0, "rgba(244,233,200,0.55)"],
        [0.35, "rgba(244,233,200,0.16)"],
        [1, "rgba(244,233,200,0)"],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  halo.position.copy(moon.position);
  halo.scale.set(7.2, 7.2, 1);
  scene.add(halo);

  scene.add(ridge([0, 0.35, 1.05, 0.45, 1.45, 0.55, 0.25, 1.2, 0.5, 0.95, 0.2, 0], 0x121a3c, -7.6));
  scene.add(ridge([0, 0.15, 0.7, 1.55, 0.45, 0.2, 0.35, 1.25, 1.85, 0.55, 0.15, 0], 0x060912, -5.7));

  const pineSpots = [
    [-6.4, 1.15, 0.46, -5.1],
    [-5.2, 1.7, 0.62, -5.3],
    [-4.0, 2.15, 0.78, -5.0],
    [-2.9, 1.35, 0.5, -4.7],
    [-1.9, 1.05, 0.4, -4.9],
    [1.9, 1.1, 0.42, -4.8],
    [2.9, 1.55, 0.58, -5.1],
    [4.0, 2.2, 0.8, -5.2],
    [5.2, 1.65, 0.6, -4.9],
    [6.3, 1.2, 0.46, -5.0],
    [-3.5, 0.9, 0.34, -4.2],
    [3.6, 0.95, 0.36, -4.15],
  ];
  for (const [x, h, r, z] of pineSpots) {
    const tree = pine(h, r);
    tree.position.set(x, 0, z);
    scene.add(tree);
  }

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(20, 48),
    new THREE.MeshBasicMaterial({ color: 0x070b1f }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  scene.add(ground);

  const platform = new THREE.Group();
  scene.add(platform);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.88, 2.02, 0.09, 72),
    new THREE.MeshStandardMaterial({
      color: 0x12182c,
      metalness: 0.55,
      roughness: 0.32,
      emissive: 0x0b1440,
      emissiveIntensity: 0.55,
    }),
  );
  plinth.position.y = -0.02;
  platform.add(plinth);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6),
    new THREE.MeshBasicMaterial({
      map: discTexture([
        [0, "rgba(255,200,87,0.45)"],
        [0.28, "rgba(46,230,214,0.28)"],
        [0.62, "rgba(46,230,214,0.08)"],
        [1, "rgba(46,230,214,0)"],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.035;
  platform.add(glow);

  const tealRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.02, 12, 96),
    new THREE.MeshBasicMaterial({ color: 0x2ee6d6, toneMapped: false }),
  );
  tealRing.rotation.x = Math.PI / 2;
  tealRing.position.y = 0.04;
  const goldRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.22, 0.012, 10, 80),
    new THREE.MeshBasicMaterial({ color: 0xffc857, toneMapped: false }),
  );
  goldRing.rotation.x = Math.PI / 2;
  goldRing.position.y = 0.045;
  platform.add(tealRing, goldRing);

  const treeLight = new THREE.PointLight(0xffc857, 8, 7, 2);
  treeLight.position.set(0, 1.5, 0.8);
  platform.add(treeLight);

  const soft = discTexture([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.75)"], [1, "rgba(255,255,255,0)"]]);

  function makeGlitter(count, shellBias, size, hotChance) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const h = Math.pow(rng(), shellBias);
      const y = 0.05 + h * TREE_H;
      const maxR = TREE_R * (1 - h);
      const rad = maxR * (shellBias > 1 ? 0.78 + rng() * 0.22 : Math.sqrt(rng()));
      const a = rng() * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * rad;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(a) * rad;
      heights[i] = h;
      seeds[i] = rng();
      const color = new THREE.Color(rng() < hotChance ? "#fff6d2" : "#ffc857");
      const shade = 0.72 + rng() * 0.28;
      colors[i * 3] = color.r * shade;
      colors[i * 3 + 1] = color.g * shade;
      colors[i * 3 + 2] = color.b * shade;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        map: soft,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        opacity: 0.95,
      }),
    );
    points.frustumCulled = false;
    points.renderOrder = 1;
    points.userData.targets = positions;
    points.userData.heights = heights;
    points.userData.seeds = seeds;
    points.userData.baseColors = colors.slice();
    return points;
  }

  const dust = makeGlitter(4600, 0.85, 0.068, 0.12);
  const spark = makeGlitter(1100, 1.15, 0.11, 0.62);
  platform.add(dust, spark);

  const ribbon = new THREE.Mesh(
    helixStrip(5.6, 0.12, TREE_H * 0.97, 0.052, 320),
    new THREE.MeshBasicMaterial({
      color: 0x2ee6d6,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  ribbon.renderOrder = 2;
  const ribbonCore = new THREE.Mesh(
    helixStrip(5.4, 0.1, TREE_H * 0.96, 0.028, 220),
    new THREE.MeshBasicMaterial({
      color: 0xd9fffb,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  ribbonCore.renderOrder = 2;
  platform.add(ribbon, ribbonCore);

  const gemGeo = {
    oct: new THREE.OctahedronGeometry(1, 0),
    ico: new THREE.IcosahedronGeometry(0.86, 0),
  };
  gemGeo.oct.scale(1, 1.45, 1);
  const ornaments = ORNAMENTS.map((spec) => {
    const mesh = new THREE.Mesh(gemGeo[spec.gem], crystalMaterial(spec.color, spec.thick));
    const y = 0.08 + spec.h * TREE_H;
    const rad = TREE_R * (1 - spec.h) * 0.94 + 0.03;
    mesh.position.set(Math.cos(spec.a) * rad, y, Math.sin(spec.a) * rad);
    mesh.userData.base = mesh.position.clone();
    mesh.userData.baseScale = spec.s;
    mesh.userData.glitch = 0;
    mesh.userData.spin = spec.a;
    mesh.scale.setScalar(0.001);
    mesh.visible = false;
    platform.add(mesh);
    return mesh;
  });

  const star = new THREE.Mesh(starGeometry(), crystalMaterial(0xffc857, 280));
  star.material.emissiveIntensity = 0.8;
  star.position.set(0, TREE_H + 0.28, 0);
  star.scale.setScalar(0.001);
  star.visible = false;
  platform.add(star);
  const starFlash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: discTexture([[0, "rgba(255,244,210,1)"], [0.4, "rgba(255,200,87,0.45)"], [1, "rgba(255,200,87,0)"]]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0,
    }),
  );
  starFlash.position.copy(star.position);
  starFlash.scale.set(0.2, 0.2, 1);
  platform.add(starFlash);
  const starLight = new THREE.PointLight(0xffe3a1, 0, 6, 2);
  starLight.position.copy(star.position);
  platform.add(starLight);

  const gifts = GIFTS.map((spec) => {
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), crystalMaterial(spec.color, 200));
    const ribbonMat = new THREE.MeshBasicMaterial({ color: spec.ribbon, toneMapped: false });
    const bandA = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 1.04, spec.h * 1.02, spec.d * 0.16), ribbonMat);
    const bandB = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.16, spec.h * 1.02, spec.d * 1.04), ribbonMat);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.34, spec.h * 0.16, spec.d * 0.22), ribbonMat);
    bow.position.y = spec.h * 0.56;
    group.add(box, bandA, bandB, bow);
    const restY = spec.h / 2 + 0.05;
    group.position.set(spec.x, restY, spec.z);
    group.rotation.y = spec.rot;
    group.userData.restY = restY;
    group.userData.restRot = spec.rot;
    group.visible = false;
    platform.add(group);
    return group;
  });

  const deerData = sampleDeer(rng);
  const deerFrom = new Float32Array(deerData.position.length);
  for (let i = 0; i < deerData.count; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 0.35 + rng() * 1.25;
    deerFrom[i * 3] = Math.cos(ang) * rad;
    deerFrom[i * 3 + 1] = 0.3 + (rng() - 0.4) * rad;
    deerFrom[i * 3 + 2] = Math.sin(ang) * rad * 0.55;
  }
  const deerGeo = new THREE.BufferGeometry();
  deerGeo.setAttribute("position", new THREE.BufferAttribute(deerFrom.slice(), 3));
  deerGeo.setAttribute("color", new THREE.BufferAttribute(deerData.color, 3));
  const deer = new THREE.Points(
    deerGeo,
    new THREE.PointsMaterial({
      size: 0.05,
      map: soft,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    }),
  );
  deer.frustumCulled = false;
  const deerPivot = new THREE.Group();
  deerPivot.add(deer);
  deerPivot.position.set(1.22, 0.5, 1.15);
  deerPivot.scale.setScalar(1.22);
  deerPivot.visible = false;
  platform.add(deerPivot);

  function snowCloud(count, size, spread) {
    const home = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      home[i * 3] = (rng() - 0.5) * spread;
      home[i * 3 + 1] = rng() * 8.2;
      home[i * 3 + 2] = (rng() - 0.5) * 5.2;
      speeds[i] = 0.28 + rng() * (size > 0.06 ? 0.35 : 0.85);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(home.slice(), 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size,
        map: soft,
        transparent: true,
        opacity: size > 0.06 ? 0.35 : 0.8,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    points.visible = false;
    points.userData.home = home;
    points.userData.speeds = speeds;
    points.userData.burst = new Float32Array(count * 3);
    scene.add(points);
    return points;
  }
  const snowFine = snowCloud(1300, 0.032, 8.4);
  const snowFat = snowCloud(160, 0.09, 7.2);

  const rings = [];
  const ringSpecs = [
    { r: 1.42, color: 0x2ee6d6, tilt: [1.15, 0.15], speed: 0.7 },
    { r: 1.68, color: 0xffc857, tilt: [0.75, 0.9], speed: -0.5 },
    { r: 1.95, color: 0xb79cff, tilt: [1.45, 0.45], speed: 0.85 },
  ];
  for (const spec of ringSpecs) {
    const tilt = new THREE.Group();
    tilt.rotation.set(spec.tilt[0], spec.tilt[1], 0);
    tilt.position.y = 1.55;
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(spec.r, 0.014, 12, 96),
      new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.userData.speed = spec.speed;
    tilt.add(mesh);
    tilt.scale.setScalar(0.001);
    platform.add(tilt);
    rings.push(tilt);
  }

  const silhouette = new THREE.MeshBasicMaterial({ color: 0x14080e, side: THREE.DoubleSide });
  const team = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const deerFlat = makeFlatDeer(silhouette);
    deerFlat.scale.setScalar(0.56);
    deerFlat.position.set(-0.72 + i * 0.4, Math.sin(i) * 0.015, 0);
    team.add(deerFlat);
  }
  const sleigh = makeSleigh(silhouette);
  sleigh.scale.setScalar(0.82);
  sleigh.position.set(0.92, -0.02, 0);
  team.add(sleigh);
  const trailCount = 42;
  const trailPos = new Float32Array(trailCount * 3);
  for (let i = 0; i < trailCount; i++) {
    trailPos[i * 3] = -1.9 - i * 0.055;
    trailPos[i * 3 + 1] = 0.28 + Math.sin(i * 0.7) * 0.07;
    trailPos[i * 3 + 2] = (i % 5) * 0.01;
  }
  const trail = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(trailPos, 3)),
    new THREE.PointsMaterial({
      color: 0xffc857,
      size: 0.045,
      map: soft,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  team.add(trail);
  team.position.set(-3.4, MOON.y - 0.05, MOON.z + 2.35);
  team.visible = false;
  scene.add(team);

  const glitchColors = [0xff2bd6, 0x00f0ff, 0xffc857];
  const glitches = [];
  const glitchSpots = [
    [-3.1, 4.9, -2.2],
    [2.7, 5.5, -2.4],
    [-2.15, 3.55, -1.2],
    [2.35, 3.7, -0.8],
    [0.85, 7.2, -4.2],
    [-3.8, 6.4, -4.4],
    [3.3, 4.6, -3.4],
    [-0.4, 6.8, -3.0],
    [1.7, 4.15, -1.6],
    [-1.5, 5.8, -2.8],
  ];
  glitchSpots.forEach((spot, index) => {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: glitchColors[index % glitchColors.length], toneMapped: false });
    const n = 4 + (index % 4);
    for (let i = 0; i < n; i++) {
      const s = 0.055 + rng() * 0.05;
      const cube = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
      cube.position.set(Math.round((rng() - 0.5) * 5) * 0.085, Math.round((rng() - 0.5) * 4) * 0.085, Math.round((rng() - 0.5) * 2) * 0.085);
      group.add(cube);
    }
    group.position.set(spot[0], spot[1], spot[2]);
    group.userData.base = group.position.clone();
    group.userData.phase = rng() * Math.PI * 2;
    group.userData.speed = 0.25 + rng() * 0.35;
    scene.add(group);
    glitches.push(group);
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.38, 0.42, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const state = {
    time: 0,
    grow: 0,
    spinning: false,
    shown: 0,
    deerT: 0,
    deerLive: false,
    snow: false,
    burst: 0,
    starReady: false,
    finale: false,
    corner,
  };
  const tweens = [];

  function tween(dur, apply, { delay = 0, tag = null } = {}) {
    if (tag) {
      for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].tag === tag) tweens.splice(i, 1);
    }
    tweens.push({ t: -delay, dur, apply, tag });
  }

  function writeGlitter(points, wobble) {
    const targets = points.userData.targets;
    const heights = points.userData.heights;
    const seeds = points.userData.seeds;
    const pos = points.geometry.attributes.position;
    const col = points.geometry.attributes.color;
    const base = points.userData.baseColors;
    for (let i = 0; i < heights.length; i++) {
      const start = heights[i] * 0.62;
      let k = (state.grow - start) / 0.38;
      if (k < 0) k = 0;
      else if (k > 1) k = 1;
      k = k * k * (3 - 2 * k);
      if (k < 0.02) {
        pos.setXYZ(i, 0, -30, 0);
        continue;
      }
      let x = targets[i * 3] * k;
      let y = targets[i * 3 + 1] * k;
      let z = targets[i * 3 + 2] * k;
      if (wobble && k > 0.98) {
        const s = seeds[i];
        x += Math.sin(state.time * 2.1 + s * 40) * 0.012;
        y += Math.cos(state.time * 1.6 + s * 20) * 0.01;
        const tw = 0.62 + 0.38 * Math.sin(state.time * 3.2 + s * 30);
        col.setXYZ(i, base[i * 3] * tw, base[i * 3 + 1] * tw, base[i * 3 + 2] * tw);
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    if (wobble) col.needsUpdate = true;
  }

  function resetSnow(points) {
    points.geometry.attributes.position.array.set(points.userData.home);
    points.geometry.attributes.position.needsUpdate = true;
    points.userData.burst.fill(0);
  }

  function placeDeer(t) {
    const pos = deer.geometry.attributes.position;
    const spin = (1 - t) * 7.5;
    const c = Math.cos(spin);
    const s = Math.sin(spin);
    for (let i = 0; i < deerData.count; i++) {
      const fx = deerFrom[i * 3];
      const fy = deerFrom[i * 3 + 1];
      const fz = deerFrom[i * 3 + 2];
      const sx = fx * c - fz * s;
      const sz = fx * s + fz * c;
      const tx = deerData.position[i * 3];
      const ty = deerData.position[i * 3 + 1];
      const tz = deerData.position[i * 3 + 2];
      pos.setXYZ(i, sx + (tx - sx) * t, fy + (ty - fy) * t, sz + (tz - sz) * t);
    }
    pos.needsUpdate = true;
  }

  function showOrnaments(count, animate) {
    state.shown = count;
    ornaments.forEach((mesh, i) => {
      const on = i < count;
      mesh.visible = on;
      mesh.userData.glitch = 0;
      mesh.position.copy(mesh.userData.base);
      if (!on) {
        mesh.scale.setScalar(0.001);
        return;
      }
      if (!animate) mesh.scale.setScalar(mesh.userData.baseScale);
    });
  }

  function frameCamera() {
    const tall = camera.aspect < 0.72 || state.corner;
    if (tall) {
      camera.fov = 32.5;
      camera.position.set(0.2, 2.35, 12.1);
      camera.lookAt(0.12, 2.95, 0);
    } else {
      camera.fov = 33.5;
      camera.position.set(0.06, 1.7, 8.15);
      camera.lookAt(0.0, 2.18, 0);
    }
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if (composer.setPixelRatio) composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / Math.max(1, h);
    frameCamera();
    camera.updateProjectionMatrix();
  }

  function snap(step) {
    tweens.length = 0;
    const grown = step >= 2;
    state.grow = grown ? 1 : 0;
    state.spinning = grown;
    platform.rotation.y = HERO_ANGLE;
    showOrnaments(step >= 3 ? 8 : 0, false);
    state.starReady = step >= 4;
    star.visible = state.starReady;
    star.scale.setScalar(state.starReady ? 1 : 0.001);
    starFlash.material.opacity = 0;
    starLight.intensity = state.starReady ? 1.4 : 0;
    gifts.forEach((gift) => {
      const on = step >= 5;
      gift.visible = on;
      gift.position.y = gift.userData.restY;
      gift.rotation.y = gift.userData.restRot;
    });
    state.deerLive = step >= 6;
    state.deerT = state.deerLive ? 1 : 0;
    deerPivot.visible = state.deerLive;
    deerPivot.scale.setScalar(1.22);
    if (state.deerLive) placeDeer(1);
    state.snow = step >= 7;
    state.burst = 0;
    snowFine.visible = state.snow;
    snowFat.visible = state.snow;
    resetSnow(snowFine);
    resetSnow(snowFat);
    state.finale = false;
    team.visible = false;
    team.position.x = -3.4;
    rings.forEach((ring) => ring.scale.setScalar(0.001));
  }

  function play(type) {
    if (type === "tree") {
      state.spinning = true;
      state.grow = 0;
      tween(2.5, (u) => {
        state.grow = easeOutCubic(u);
      }, { tag: "grow" });
    } else if (type === "ornament") {
      if (state.shown >= 12) return;
      const mesh = ornaments[state.shown];
      state.shown += 1;
      mesh.visible = true;
      mesh.userData.glitch = 0.22;
      mesh.scale.setScalar(0.001);
      const base = mesh.userData.baseScale;
      tween(0.4, (u) => mesh.scale.setScalar(Math.max(0.001, easeOutBack(u) * base)));
    } else if (type === "star") {
      star.visible = true;
      state.starReady = false;
      star.scale.setScalar(0.001);
      starFlash.material.opacity = 1;
      starFlash.scale.set(0.3, 0.3, 1);
      starLight.intensity = 8;
      tween(1, (u) => {
        const pop = Math.min(1, u * 1.35);
        star.scale.setScalar(Math.max(0.001, easeOutBack(pop)));
        starFlash.material.opacity = u < 0.45 ? 1 - u / 0.45 : 0;
        starFlash.scale.setScalar(0.4 + u * 3.2);
        starLight.intensity = 8 * (1 - u) + 1.4;
        if (u === 1) state.starReady = true;
      }, { tag: "star" });
    } else if (type === "gifts") {
      gifts.forEach((gift, i) => {
        gift.visible = true;
        const rest = gift.userData.restY;
        const start = rest + 3.6;
        gift.position.y = start;
        tween(0.95, (u) => {
          gift.position.y = start + (rest - start) * easeOutBounce(u);
          gift.rotation.y = gift.userData.restRot + (1 - u) * 0.4;
        }, { delay: i * 0.12 });
      });
    } else if (type === "reindeer") {
      deerPivot.visible = true;
      state.deerLive = true;
      state.deerT = 0;
      tween(2, (u) => {
        state.deerT = easeOutCubic(u);
      }, { tag: "deer" });
    } else if (type === "snow") {
      state.snow = true;
      state.burst = 1;
      snowFine.visible = true;
      snowFat.visible = true;
      for (const cloud of [snowFine, snowFat]) {
        const pos = cloud.geometry.attributes.position;
        const burst = cloud.userData.burst;
        const n = Math.min(420, pos.count);
        for (let i = 0; i < n; i++) {
          pos.setXYZ(i, (rng() - 0.5) * 0.4, 1.3 + rng() * 0.4, 0.4);
          burst[i * 3] = (rng() - 0.5) * 3.4;
          burst[i * 3 + 1] = rng() * 2.4;
          burst[i * 3 + 2] = (rng() - 0.5) * 3.4;
        }
        pos.needsUpdate = true;
      }
    } else if (type === "sleigh") {
      team.visible = true;
      state.finale = false;
      rings.forEach((ring) => ring.scale.setScalar(0.001));
      tween(3, (u) => {
        const e = easeInOut(u);
        team.position.x = -3.6 + (2.35 - -3.6) * e;
        team.position.y = MOON.y + 0.35 + Math.sin(u * Math.PI) * 0.16;
        const s = Math.max(0.001, easeOutBack(Math.min(1, u * 1.15)));
        rings.forEach((ring) => ring.scale.setScalar(s));
        if (u === 1) state.finale = true;
      }, { tag: "sleigh" });
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    state.time += dt;
    for (let i = 0; i < tweens.length; i++) {
      const tw = tweens[i];
      tw.t += dt;
      if (tw.t >= 0) tw.apply(Math.min(1, tw.t / tw.dur));
    }
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].t >= tweens[i].dur) tweens.splice(i, 1);

    if (state.spinning) platform.rotation.y += dt * SPIN;
    glow.material.opacity = 0.75 + Math.sin(state.time * 1.4) * 0.12;
    tealRing.material.opacity = 0.85 + Math.sin(state.time * 2) * 0.15;

    writeGlitter(dust, state.grow > 0.2);
    writeGlitter(spark, state.grow > 0.2);
    const ribbonCount = ribbon.geometry.index.count;
    ribbon.geometry.setDrawRange(0, Math.floor(ribbonCount * state.grow));
    ribbonCore.geometry.setDrawRange(0, Math.floor(ribbonCore.geometry.index.count * state.grow));

    for (let i = 0; i < ornaments.length; i++) {
      const mesh = ornaments[i];
      if (!mesh.visible) continue;
      mesh.rotation.y += dt * (0.35 + (i % 3) * 0.12);
      mesh.rotation.x += dt * 0.12;
      if (mesh.userData.glitch > 0) {
        mesh.userData.glitch -= dt;
        const kick = mesh.userData.glitch > 0.08 ? 0.07 : 0;
        mesh.position.x = mesh.userData.base.x + (i % 2 ? kick : -kick);
        mesh.position.y = mesh.userData.base.y;
      } else if (mesh.position.x !== mesh.userData.base.x) {
        mesh.position.copy(mesh.userData.base);
      }
    }

    if (state.starReady) {
      const p = 1 + Math.sin(state.time * 2.3) * 0.06;
      star.scale.setScalar(p);
      starLight.intensity = 1.2 + Math.sin(state.time * 2.3) * 0.35;
    }

    if (state.deerLive) {
      placeDeer(state.deerT);
      if (state.deerT >= 1) {
        const b = 1 + Math.sin(state.time * 1.7) * 0.035;
        deerPivot.scale.set(1.22, 1.22 * b, 1.22);
      }
    }

    if (state.snow) {
      state.burst = Math.max(0, state.burst - dt);
      for (const cloud of [snowFine, snowFat]) {
        const pos = cloud.geometry.attributes.position;
        const speeds = cloud.userData.speeds;
        const burst = cloud.userData.burst;
        const fade = state.burst;
        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i) + burst[i * 3] * dt * fade + Math.sin(state.time + i) * 0.05 * dt;
          let y = pos.getY(i) - speeds[i] * dt + burst[i * 3 + 1] * dt * fade;
          let z = pos.getZ(i) + burst[i * 3 + 2] * dt * fade;
          if (y < -0.2) {
            y = 8;
            x = cloud.userData.home[i * 3];
            z = cloud.userData.home[i * 3 + 2];
            burst[i * 3] = burst[i * 3 + 1] = burst[i * 3 + 2] = 0;
          }
          pos.setXYZ(i, x, y, z);
        }
        pos.needsUpdate = true;
      }
    }

    if (state.finale || team.visible) {
      rings.forEach((ring) => {
        const mesh = ring.children[0];
        mesh.rotation.z += dt * mesh.userData.speed;
      });
      const tpos = trail.geometry.attributes.position;
      for (let i = 0; i < tpos.count; i++) {
        const homeY = 0.28 + Math.sin(i * 0.7) * 0.07;
        tpos.setY(i, homeY + Math.sin(state.time * 3 + i) * 0.03);
      }
      tpos.needsUpdate = true;
    }

    const colors = starGeo.attributes.color;
    for (let i = 0; i < starCount; i++) {
      const tw = 0.55 + 0.45 * Math.sin(state.time * (1.2 + (i % 5) * 0.15) + starPhase[i]);
      colors.setXYZ(i, starBase[i * 3] * tw, starBase[i * 3 + 1] * tw, starBase[i * 3 + 2] * tw);
    }
    colors.needsUpdate = true;

    for (const group of glitches) {
      const b = group.userData.base;
      const s = group.userData.speed;
      const p = group.userData.phase;
      group.position.x = b.x + Math.sin(state.time * s + p) * 0.22;
      group.position.y = b.y + Math.cos(state.time * s * 0.7 + p) * 0.12;
      const glitch = Math.sin(state.time * 2.7 + p * 3) > 0.985;
      if (glitch) group.position.x += 0.18;
    }
  }

  function render() {
    composer.render();
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas.parentElement || canvas);
  resize();
  snap(1);

  return { resize, update, render, snap, play };
}
