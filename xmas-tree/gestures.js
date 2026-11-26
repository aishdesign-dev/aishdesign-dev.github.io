// Hand gesture classifier for the Christmas scene.
// Landmarks are MediaPipe's 21 points in normalized image space (y grows downward).
// Distances used for finger pose are 2D. Travel is a fraction of the frame.

export const THRESHOLDS = Object.freeze({
  pinchRatio: 0.25,
  pinchHold: 0.15,
  heartTouchRatio: 0.42,
  heartHold: 0.3,
  indexHold: 0.3,
  peaceHold: 0.3,
  fistHold: 0.25,
  fistOpenWindow: 0.6,
  riseDy: 0.15,
  riseWindow: 0.6,
  pushDy: 0.12,
  pushWindow: 0.5,
  swipeDx: 0.4,
  swipeWindow: 0.5,
  // A one-frame landmark spike is not a gesture.
  minTravel: 0.08,
  cooldown: 0.6,
  repeatCooldown: 0.4,
  smoothFrames: 4,
  maxOrnaments: 12,
  // How close the wrist must finish to the extreme of its travel.
  endSlop: 0.045,
});

const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const PIP = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };
const MCP = { thumb: 2, index: 5, middle: 9, ring: 13, pinky: 17 };
const FOUR = ["index", "middle", "ring", "pinky"];

export function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function palmSize(lm) {
  return dist2(lm[0], lm[9]);
}

// Straight when the tip is farther from the wrist than the middle joint (PIP, thumb IP).
export function fingerStraight(lm, tip, pip) {
  return dist2(lm[tip], lm[0]) > dist2(lm[pip], lm[0]);
}

function segmentsCross(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const c1 = cross(a, b, c);
  const c2 = cross(a, b, d);
  const c3 = cross(c, d, a);
  const c4 = cross(c, d, b);
  if (c1 === 0 || c2 === 0 || c3 === 0 || c4 === 0) return false;
  return c1 > 0 !== c2 > 0 && c3 > 0 !== c4 > 0;
}

// Thumb and index have crossed when each tip sits closer to the other knuckle
// than to its own, or the two bones actually intersect.
function fingersCrossed(lm) {
  if (segmentsCross(lm[2], lm[4], lm[5], lm[8])) return true;
  const thumbSwapped = dist2(lm[4], lm[5]) < dist2(lm[4], lm[2]);
  const indexSwapped = dist2(lm[8], lm[2]) < dist2(lm[8], lm[5]);
  return thumbSwapped && indexSwapped;
}

function pointsUp(lm, tip, mcp, palm) {
  const dy = lm[mcp].y - lm[tip].y;
  const dx = Math.abs(lm[tip].x - lm[mcp].x);
  return dy > palm * 0.18 && dy > dx * 0.75;
}

export function analyzeHand(lm) {
  if (!lm || lm.length < 21) return null;
  const palm = palmSize(lm);
  if (!(palm > 1e-4)) return null;

  const straight = {};
  for (const name of Object.keys(TIP)) {
    straight[name] = fingerStraight(lm, TIP[name], PIP[name]);
  }

  const fist = FOUR.every((name) => dist2(lm[TIP[name]], lm[0]) < dist2(lm[MCP[name]], lm[0]));
  const open = straight.thumb && straight.index && straight.middle && straight.ring && straight.pinky;
  const pinchRatio = dist2(lm[4], lm[8]) / palm;
  const pinch = pinchRatio < THRESHOLDS.pinchRatio;
  const othersCurled = !straight.middle && !straight.ring && !straight.pinky;
  const heart = pinchRatio < THRESHOLDS.heartTouchRatio && fingersCrossed(lm) && othersCurled;
  // A finger heart also bends the index toward the thumb. Don't let that light the star.
  const indexUp =
    straight.index &&
    !straight.middle &&
    !straight.ring &&
    !straight.pinky &&
    pointsUp(lm, 8, 5, palm) &&
    !heart;
  const peace =
    straight.index &&
    straight.middle &&
    !straight.ring &&
    !straight.pinky &&
    pointsUp(lm, 8, 5, palm) &&
    pointsUp(lm, 12, 9, palm) &&
    !heart;

  return {
    palm,
    straight,
    fist,
    open,
    pinch,
    pinchRatio,
    indexUp,
    peace,
    heart,
    wrist: { x: lm[0].x, y: lm[0].y },
  };
}

function makeSlot() {
  return {
    smooth: [],
    history: [],
    lastSeen: -Infinity,
    flags: null,
    hold: Object.create(null),
    latch: Object.create(null),
    fistStart: null,
    fistReadyAt: null,
  };
}

function smoothInto(buffer, lm, max) {
  const copy = new Array(21);
  for (let i = 0; i < 21; i++) {
    const p = lm[i];
    copy[i] = { x: p.x, y: p.y, z: p.z || 0 };
  }
  buffer.push(copy);
  if (buffer.length > max) buffer.shift();
  const n = buffer.length;
  const out = new Array(21);
  for (let i = 0; i < 21; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < n; k++) {
      x += buffer[k][i].x;
      y += buffer[k][i].y;
      z += buffer[k][i].z;
    }
    out[i] = { x: x / n, y: y / n, z: z / n };
  }
  return out;
}

// Extrema of wrist travel inside a recent time window.
function extrema(history, now, windowSec) {
  const start = now - windowSec;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let tMinY = 0;
  let tMaxY = 0;
  let tMinX = 0;
  let tMaxX = 0;
  let count = 0;
  let cur = null;
  for (let i = 0; i < history.length; i++) {
    const s = history[i];
    if (s.t < start - 1e-6) continue;
    if (s.t > now + 1e-6) break;
    count++;
    if (s.x < minX) {
      minX = s.x;
      tMinX = s.t;
    }
    if (s.x > maxX) {
      maxX = s.x;
      tMaxX = s.t;
    }
    if (s.y < minY) {
      minY = s.y;
      tMinY = s.t;
    }
    if (s.y > maxY) {
      maxY = s.y;
      tMaxY = s.t;
    }
    cur = s;
  }
  if (count < 3 || !cur) return null;
  return { minX, maxX, minY, maxY, tMinY, tMaxY, tMinX, tMaxX, cur };
}

function handKey(hand, index, all) {
  const label = hand.handedness === "Left" || hand.handedness === "Right" ? hand.handedness : "Hand";
  let n = 0;
  for (let i = 0; i < all.length; i++) {
    const other = all[i].handedness === "Left" || all[i].handedness === "Right" ? all[i].handedness : "Hand";
    if (other === label) n++;
  }
  return n > 1 ? `${label}#${index}` : label;
}

const HINTS = {
  1: "Raise an open palm",
  2: "Pinch",
  3: "Index up",
  4: "Both palms down",
  5: "Finger heart",
  6: "Fist, then open",
  7: "Swipe",
};

export function hintText(controller) {
  if (!controller || controller.phase === "free") return "";
  if (controller.step === 2 && controller.ornamentCount >= 3) return "Index up";
  return HINTS[controller.step] || "";
}

export function createGestureController(options = {}) {
  const smoothFrames = options.smoothFrames || THRESHOLDS.smoothFrames;
  const slots = new Map();
  const global = makeSlot();

  const api = {
    step: 1,
    phase: "sequence",
    ornamentCount: 0,
    lastTriggerTime: -Infinity,
    lastTriggerType: null,
    debug: { step: 1, phase: "sequence", ornaments: 0, hands: [] },

    reset() {
      api.jumpTo(1);
    },

    jumpTo(step) {
      const s = Math.max(1, Math.min(7, step | 0));
      api.phase = "sequence";
      api.step = s;
      api.ornamentCount = s >= 3 ? 8 : 0;
      api.lastTriggerTime = -Infinity;
      api.lastTriggerType = null;
      slots.clear();
      global.hold = Object.create(null);
      global.latch = Object.create(null);
      api.debug = { step: api.step, phase: api.phase, ornaments: api.ornamentCount, hands: [] };
    },

    accepts(type) {
      if (type === "ornament" && api.ornamentCount >= THRESHOLDS.maxOrnaments) return false;
      if (api.phase === "free") return true;
      if (type === "tree") return api.step === 1;
      if (type === "ornament") return api.step === 2;
      if (type === "star") return api.step === 3 || (api.step === 2 && api.ornamentCount >= 1);
      if (type === "gifts") return api.step === 4;
      if (type === "reindeer") return api.step === 5;
      if (type === "snow") return api.step === 6;
      if (type === "sleigh") return api.step === 7;
      return false;
    },

    cooled(type, t) {
      const repeat =
        (type === "ornament" || type === "gifts") && api.lastTriggerType === type;
      const gap = repeat ? THRESHOLDS.repeatCooldown : THRESHOLDS.cooldown;
      return t - api.lastTriggerTime >= gap - 1e-6;
    },

    acknowledge(type, t) {
      if (!api.accepts(type) || !api.cooled(type, t)) return null;
      return commit(type, t);
    },

    push(frame) {
      const t = frame.t;
      const incoming = frame.hands || [];
      const seen = new Set();
      const tracks = [];

      for (let i = 0; i < incoming.length; i++) {
        const hand = incoming[i];
        if (!hand || !hand.landmarks || hand.landmarks.length < 21) continue;
        const key = handKey(hand, i, incoming);
        seen.add(key);
        let slot = slots.get(key);
        if (!slot) {
          slot = makeSlot();
          slots.set(key, slot);
        }
        slot.lastSeen = t;
        const smoothed = smoothInto(slot.smooth, hand.landmarks, smoothFrames);
        const flags = analyzeHand(smoothed);
        if (!flags) continue;
        slot.flags = flags;
        slot.history.push({ t, x: flags.wrist.x, y: flags.wrist.y });
        const keep = t - 1.6;
        while (slot.history.length && slot.history[0].t < keep) slot.history.shift();
        tracks.push(slot);
      }

      for (const [key, slot] of slots) {
        if (!seen.has(key) && t - slot.lastSeen > 0.45) slots.delete(key);
      }

      for (let i = 0; i < tracks.length; i++) {
        const slot = tracks[i];
        const travel = {
          rise: riseReady(slot, t),
          swipe: swipeReady(slot, t),
        };
        note(slot, "pinch", slot.flags.pinch, t);
        note(slot, "index", slot.flags.indexUp, t);
        note(slot, "heart", slot.flags.heart, t);
        note(slot, "peace", slot.flags.peace, t);
        note(slot, "rise", travel.rise, t);
        note(slot, "swipe", travel.swipe, t);
        noteFist(slot, slot.flags, t);
      }
      note(global, "push", pushReady(tracks, t), t);

      const order =
        api.phase === "free"
          ? ["reindeer", "star", "snow", "sleigh", "gifts", "ornament", "tree"]
          : api.step === 2
            ? ["ornament", "star"]
            : [typeForStep(api.step)];

      let fired = null;
      for (let i = 0; i < order.length; i++) {
        const type = order[i];
        if (!type) continue;
        if (predicate(type, tracks, t) && api.accepts(type) && api.cooled(type, t)) {
          fired = type;
          break;
        }
      }

      api.debug = {
        step: api.step,
        phase: api.phase,
        ornaments: api.ornamentCount,
        hands: tracks.map((slot) => ({
          open: slot.flags.open,
          fist: slot.flags.fist,
          pinch: Number(slot.flags.pinchRatio.toFixed(3)),
          index: slot.flags.indexUp,
          heart: slot.flags.heart,
          peace: slot.flags.peace,
        })),
      };

      if (!fired) return null;
      latch(fired, tracks);
      return commit(fired, t);
    },
  };

  function latch(type, tracks) {
    if (type === "gifts") {
      global.latch.push = true;
      return;
    }
    if (type === "snow") {
      for (const slot of tracks) {
        slot.fistReadyAt = null;
        slot.fistStart = null;
        slot.fistEdge = false;
      }
      return;
    }
    if (type === "reindeer") {
      for (const slot of tracks) {
        if (slot.flags.heart) slot.latch.heart = true;
        if (slot.flags.peace) slot.latch.peace = true;
      }
      return;
    }
    const key = type === "star" ? "index" : type === "sleigh" ? "swipe" : type === "ornament" ? "pinch" : "rise";
    for (const slot of tracks) {
      if (slot.hold[key] != null) slot.latch[key] = true;
    }
  }

  function typeForStep(step) {
    if (step === 1) return "tree";
    if (step === 3) return "star";
    if (step === 4) return "gifts";
    if (step === 5) return "reindeer";
    if (step === 6) return "snow";
    if (step === 7) return "sleigh";
    return null;
  }

  function predicate(type, tracks, t) {
    if (type === "gifts") return ready(global, "push", 0, t);
    if (type === "reindeer") {
      return tracks.some(
        (slot) => ready(slot, "heart", THRESHOLDS.heartHold, t) || ready(slot, "peace", THRESHOLDS.peaceHold, t),
      );
    }
    if (type === "star") return tracks.some((slot) => ready(slot, "index", THRESHOLDS.indexHold, t));
    if (type === "snow") return tracks.some((slot) => slot.fistEdge);
    if (type === "sleigh") return tracks.some((slot) => ready(slot, "swipe", 0, t));
    if (type === "ornament") return tracks.some((slot) => ready(slot, "pinch", THRESHOLDS.pinchHold, t));
    if (type === "tree") return tracks.some((slot) => ready(slot, "rise", 0, t));
    return false;
  }

function commit(type, t) {
    const at = api.phase === "free" ? "free" : api.step;
    api.lastTriggerTime = t;
    api.lastTriggerType = type;
    if (type === "ornament") {
      api.ornamentCount = Math.min(THRESHOLDS.maxOrnaments, api.ornamentCount + 1);
      api.debug.ornaments = api.ornamentCount;
      return { type, step: at, count: api.ornamentCount };
    }
    if (api.phase !== "free") {
      if (type === "tree") api.step = 2;
      else if (type === "star") api.step = 4;
      else if (type === "gifts") api.step = 5;
      else if (type === "reindeer") api.step = 6;
      else if (type === "snow") api.step = 7;
      else if (type === "sleigh") api.phase = "free";
    }
    api.debug.step = api.step;
    api.debug.phase = api.phase;
    return { type, step: at, count: api.ornamentCount };
  }

  return api;
}

function note(slot, name, pred, t) {
  if (!pred) {
    slot.hold[name] = null;
    slot.latch[name] = false;
    return;
  }
  if (slot.hold[name] == null) slot.hold[name] = t;
}

function ready(slot, name, seconds, t) {
  if (slot.latch[name]) return false;
  if (slot.hold[name] == null) return false;
  return t - slot.hold[name] >= seconds - 1e-6;
}

function noteFist(slot, flags, t) {
  slot.fistEdge = false;
  if (flags.fist) {
    if (slot.fistStart == null) slot.fistStart = t;
    if (t - slot.fistStart >= THRESHOLDS.fistHold - 1e-6) slot.fistReadyAt = t;
    return;
  }
  if (
    slot.fistReadyAt != null &&
    flags.open &&
    t - slot.fistReadyAt <= THRESHOLDS.fistOpenWindow + 1e-6
  ) {
    slot.fistEdge = true;
    return;
  }
  if (slot.fistReadyAt != null && t - slot.fistReadyAt > THRESHOLDS.fistOpenWindow) {
    slot.fistReadyAt = null;
    slot.fistStart = null;
  }
  if (slot.fistReadyAt == null) slot.fistStart = null;
}

// How long the wrist has stayed within slop of a target, ending at the current sample.
function heldSpan(history, now, axis, target, slop) {
  let since = now;
  for (let i = history.length - 1; i >= 0; i--) {
    const s = history[i];
    if (Math.abs(s[axis] - target) > slop) break;
    since = s.t;
  }
  return now - since;
}

function riseReady(slot, t) {
  if (!slot.flags.open) return false;
  const ex = extrema(slot.history, t, THRESHOLDS.riseWindow);
  if (!ex) return false;
  const span = ex.maxY - ex.minY;
  const atTop = ex.cur.y <= ex.minY + THRESHOLDS.endSlop;
  const mostlyUp = span >= (ex.maxX - ex.minX) * 0.8;
  const held = heldSpan(slot.history, t, "y", ex.minY, THRESHOLDS.endSlop) >= THRESHOLDS.minTravel;
  return span >= THRESHOLDS.riseDy && atTop && mostlyUp && held;
}

function swipeReady(slot, t) {
  if (!slot.flags.open) return false;
  const ex = extrema(slot.history, t, THRESHOLDS.swipeWindow);
  if (!ex) return false;
  const span = ex.maxX - ex.minX;
  const atRight = Math.abs(ex.cur.x - ex.maxX) <= THRESHOLDS.endSlop;
  const atLeft = Math.abs(ex.cur.x - ex.minX) <= THRESHOLDS.endSlop;
  if (!(atRight || atLeft) || span <= ex.maxY - ex.minY) return false;
  const target = atRight ? ex.maxX : ex.minX;
  const held = heldSpan(slot.history, t, "x", target, THRESHOLDS.endSlop) >= THRESHOLDS.minTravel;
  return span >= THRESHOLDS.swipeDx && held;
}

function pushReady(tracks, t) {
  if (tracks.length < 2) return false;
  let n = 0;
  for (let i = 0; i < tracks.length; i++) {
    const slot = tracks[i];
    if (!slot.flags.open) continue;
    const ex = extrema(slot.history, t, THRESHOLDS.pushWindow);
    if (!ex) continue;
    const span = ex.maxY - ex.minY;
    const atBottom = ex.cur.y >= ex.maxY - THRESHOLDS.endSlop;
    const held = heldSpan(slot.history, t, "y", ex.maxY, THRESHOLDS.endSlop) >= THRESHOLDS.minTravel;
    if (span >= THRESHOLDS.pushDy && atBottom && held) n++;
  }
  return n >= 2;
}

