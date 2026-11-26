import { createGestureController, hintText } from "./gestures.js";
import { createScene } from "./scene.js";

const params = new URLSearchParams(location.search);
const corner = params.get("corner") === "1";
const record = params.get("record") === "1";
const forceDemo = params.get("demo") === "1";
const shot = params.get("shot") === "1";

if (corner) document.body.classList.add("corner");
if (record) document.body.classList.add("record");

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/vision_bundle.mjs";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const PLACEHOLDER = [
  [0.5, 0.72],
  [0.42, 0.66],
  [0.34, 0.58],
  [0.28, 0.5],
  [0.24, 0.4],
  [0.4, 0.52],
  [0.38, 0.4],
  [0.37, 0.32],
  [0.36, 0.22],
  [0.5, 0.48],
  [0.5, 0.36],
  [0.5, 0.26],
  [0.5, 0.16],
  [0.58, 0.5],
  [0.6, 0.38],
  [0.61, 0.3],
  [0.62, 0.2],
  [0.66, 0.56],
  [0.7, 0.46],
  [0.72, 0.38],
  [0.74, 0.3],
];

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const fit = document.getElementById("cam-fit");
const cam = document.getElementById("cam");
const hint = document.getElementById("hint");
const debugEl = document.getElementById("debug");
const canvas = document.getElementById("scene-canvas");
const ctx = overlay.getContext("2d");

const scene = createScene(canvas, { corner, preserveDrawingBuffer: shot });
const gestures = createGestureController();
scene.snap(1);

let demo = forceDemo;
let landmarker = null;
let lastVideoTime = -1;
let demoIndex = 0;
let debugOn = false;

if (demo) document.body.classList.add("demo");

function renderHint() {
  hint.textContent = hintText(gestures);
}

function onGesture(event) {
  if (!event) return;
  scene.play(event.type);
  renderHint();
}

function demoType() {
  if (gestures.phase === "free") {
    const cycle = ["tree", "ornament", "star", "gifts", "reindeer", "snow", "sleigh"];
    const type = cycle[demoIndex % cycle.length];
    demoIndex += 1;
    return type;
  }
  if (gestures.step === 2 && gestures.ornamentCount >= 3) return "star";
  return ["", "tree", "ornament", "star", "gifts", "reindeer", "snow", "sleigh"][gestures.step];
}

document.getElementById("stage").addEventListener("click", () => {
  if (!demo) return;
  const event = gestures.acknowledge(demoType(), performance.now() / 1000);
  onGesture(event);
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key >= "1" && event.key <= "7") {
    const step = Number(event.key);
    gestures.jumpTo(step);
    scene.snap(step);
    renderHint();
    event.preventDefault();
  } else if (event.key === "r" || event.key === "R") {
    gestures.reset();
    scene.snap(1);
    renderHint();
  } else if (event.key === "d" || event.key === "D") {
    debugOn = !debugOn;
    document.body.classList.toggle("debug", debugOn);
  }
});

document.getElementById("stage").addEventListener("contextmenu", (event) => event.preventDefault());

function layoutCam() {
  const rect = cam.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;
  if (video.videoWidth) {
    const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    fit.style.width = `${dw}px`;
    fit.style.height = `${dh}px`;
    fit.style.left = `${(cw - dw) / 2}px`;
    fit.style.top = `${(ch - dh) / 2}px`;
  } else {
    fit.style.width = `${cw}px`;
    fit.style.height = `${ch}px`;
    fit.style.left = "0px";
    fit.style.top = "0px";
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(fit.clientWidth * dpr));
  const h = Math.max(1, Math.round(fit.clientHeight * dpr));
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }
}

function drawHands(landmarks) {
  const w = overlay.width;
  const h = overlay.height;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks || !landmarks.length) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.lineWidth = 2 * dpr;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 4 * dpr;
  for (const lm of landmarks) {
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    ctx.stroke();
    for (const point of lm) {
      ctx.beginPath();
      ctx.arc(point.x * w, point.y * h, 2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (debugOn && !record) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#00f0ff";
      ctx.font = `${11 * dpr}px sans-serif`;
      lm.forEach((point, index) => {
        ctx.fillText(String(index), point.x * w + 4, point.y * h - 4);
      });
      ctx.fillStyle = "#ffffff";
    }
  }
}

function handsFrom(result) {
  const hands = [];
  const marks = result.landmarks || [];
  const sides = result.handedness || [];
  for (let i = 0; i < marks.length; i++) {
    hands.push({
      landmarks: marks[i].map((point) => ({ x: point.x, y: point.y, z: point.z || 0 })),
      handedness: sides[i] && sides[i][0] ? sides[i][0].categoryName : i === 0 ? "Right" : "Left",
    });
  }
  return hands;
}

async function startCamera() {
  if (forceDemo || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    demo = true;
    document.body.classList.add("demo");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = stream;
    await video.play();
    document.body.classList.add("live");
    const visionModule = await import(VISION);
    const files = await visionModule.FilesetResolver.forVisionTasks(WASM);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.65,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
    try {
      landmarker = await visionModule.HandLandmarker.createFromOptions(files, options("GPU"));
    } catch {
      landmarker = await visionModule.HandLandmarker.createFromOptions(files, options("CPU"));
    }
  } catch {
    demo = true;
    document.body.classList.add("demo");
  }
}

let last = performance.now();
let ready = false;
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  layoutCam();
  if (!demo && landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const result = landmarker.detectForVideo(video, now);
      drawHands(result.landmarks);
      onGesture(gestures.push({ t: now / 1000, hands: handsFrom(result) }));
    } catch {
      drawHands(null);
    }
  } else if (demo) {
    drawHands([PLACEHOLDER.map(([x, y]) => ({ x, y }))]);
  }
  if (debugOn && !record) {
    const info = gestures.debug;
    const lines = [`step ${info.step}  ${info.phase}`, `ornaments ${info.ornaments}`];
    for (const hand of info.hands || []) {
      lines.push(
        `open ${hand.open}  fist ${hand.fist}  pinch ${hand.pinch}`,
        `index ${hand.index}  heart ${hand.heart}  peace ${hand.peace}`,
      );
    }
    debugEl.textContent = lines.join("\n");
  }
  scene.update(dt);
  scene.render();
  if (!ready) {
    ready = true;
    window.__XMAS_READY = true;
  }
  requestAnimationFrame(frame);
}

renderHint();
requestAnimationFrame(frame);
startCamera();
