import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeHand,
  createGestureController,
  fingerStraight,
  hintText,
  palmSize,
} from "./gestures.js";

// Templates are offsets from the wrist. Negative y is up the image.
const OPEN = [
  [0, 0],
  [-0.05, -0.06],
  [-0.16, -0.16],
  [-0.22, -0.28],
  [-0.28, -0.4],
  [-0.07, -0.28],
  [-0.08, -0.42],
  [-0.09, -0.52],
  [-0.1, -0.64],
  [0.02, -0.32],
  [0.02, -0.48],
  [0.02, -0.58],
  [0.02, -0.7],
  [0.11, -0.3],
  [0.12, -0.44],
  [0.13, -0.52],
  [0.14, -0.62],
  [0.18, -0.26],
  [0.2, -0.38],
  [0.21, -0.46],
  [0.22, -0.54],
];

const FIST = [
  [0, 0],
  [-0.04, -0.04],
  [-0.1, -0.08],
  [-0.06, -0.05],
  [-0.02, -0.02],
  [-0.07, -0.28],
  [-0.04, -0.12],
  [-0.02, -0.07],
  [-0.01, -0.03],
  [0.02, -0.32],
  [0.01, -0.12],
  [0, -0.07],
  [0, -0.03],
  [0.11, -0.3],
  [0.05, -0.12],
  [0.03, -0.07],
  [0.02, -0.03],
  [0.18, -0.26],
  [0.08, -0.11],
  [0.05, -0.06],
  [0.03, -0.03],
];

function clone(template) {
  return template.map((p) => p.slice());
}

function withPoints(template, points) {
  const next = clone(template);
  for (const [index, point] of Object.entries(points)) next[Number(index)] = point;
  return next;
}

const INDEX = withPoints(FIST, {
  5: [-0.07, -0.28],
  6: [-0.08, -0.42],
  7: [-0.09, -0.52],
  8: [-0.1, -0.64],
});

const PEACE = withPoints(FIST, {
  5: [-0.07, -0.28],
  6: [-0.08, -0.42],
  7: [-0.09, -0.52],
  8: [-0.1, -0.64],
  9: [0.04, -0.32],
  10: [0.05, -0.48],
  11: [0.05, -0.58],
  12: [0.06, -0.7],
});

const PINCH = withPoints(OPEN, {
  4: [-0.04, -0.24],
  6: [-0.05, -0.2],
  7: [-0.04, -0.22],
  8: [-0.04, -0.24],
});

const PINCH_MISS = withPoints(OPEN, {
  4: [-0.09, -0.24],
  8: [0.02, -0.24],
});

// Tips meet, other fingers curled, bones do not cross (a claw, not a heart).
const CLAW = withPoints(FIST, {
  2: [-0.18, -0.12],
  3: [-0.12, -0.18],
  4: [-0.05, -0.24],
  5: [0.1, -0.2],
  6: [0.06, -0.22],
  7: [0.03, -0.24],
  8: [-0.02, -0.25],
});

// Thumb and index cross near the tips; the other three stay curled.
const HEART = withPoints(FIST, {
  2: [-0.2, -0.14],
  3: [-0.08, -0.26],
  4: [0.05, -0.36],
  5: [0.14, -0.2],
  6: [0.04, -0.3],
  7: [-0.02, -0.34],
  8: [-0.06, -0.37],
});

const SIDEWAYS = withPoints(FIST, {
  5: [-0.06, -0.22],
  6: [0.08, -0.2],
  7: [0.18, -0.18],
  8: [0.32, -0.16],
});

// Tips sit between the knuckle and the middle joint: neither straight nor a fist.
const HALF = withPoints(OPEN, {
  4: [-0.16, -0.18],
  8: [-0.075, -0.34],
  12: [0.02, -0.38],
  16: [0.115, -0.36],
  20: [0.19, -0.3],
});

function place(template, x, y, scale = 1) {
  return template.map(([px, py]) => ({ x: x + px * scale, y: y + py * scale, z: 0 }));
}

function hand(landmarks, handedness = "Right") {
  return { landmarks, handedness };
}

function feed(controller, t0, t1, sample, dt = 0.05) {
  const events = [];
  const steps = Math.round((t1 - t0) / dt);
  for (let i = 0; i <= steps; i++) {
    const t = Number((t0 + i * dt).toFixed(5));
    const ev = controller.push({ t, hands: sample(t) });
    if (ev) events.push({ t, ...ev });
  }
  return events;
}

function hold(controller, t0, t1, template, x, y, extra = []) {
  return feed(controller, t0, t1, () => [hand(place(template, x, y)), ...extra]);
}

function slide(controller, t0, t1, template, from, to, extraAt) {
  return feed(controller, t0, t1, (t) => {
    const u = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-6, t1 - t0)));
    const x = from.x + (to.x - from.x) * u;
    const y = from.y + (to.y - from.y) * u;
    const hands = [hand(place(template, x, y))];
    if (extraAt) hands.push(extraAt(x, y, u));
    return hands;
  });
}

function controller() {
  return createGestureController({ smoothFrames: 1 });
}

describe("pose geometry", () => {
  it("treats a finger as straight only when the tip beats the middle joint", () => {
    const lm = place(OPEN, 0.5, 0.7);
    assert.equal(fingerStraight(lm, 8, 6), true);
    assert.ok(palmSize(lm) > 0.2);
    const curled = place(FIST, 0.5, 0.7);
    assert.equal(fingerStraight(curled, 8, 6), false);
  });

  it("classifies the synthetic poses", () => {
    const open = analyzeHand(place(OPEN, 0.5, 0.75));
    assert.equal(open.open, true);
    assert.equal(open.fist, false);
    assert.equal(open.pinch, false);

    const fist = analyzeHand(place(FIST, 0.5, 0.75));
    assert.equal(fist.fist, true);
    assert.equal(fist.open, false);

    const index = analyzeHand(place(INDEX, 0.5, 0.75));
    assert.equal(index.indexUp, true);
    assert.equal(index.peace, false);
    assert.equal(index.open, false);

    const peace = analyzeHand(place(PEACE, 0.5, 0.75));
    assert.equal(peace.peace, true);
    assert.equal(peace.indexUp, false);

    const pinch = analyzeHand(place(PINCH, 0.5, 0.75));
    assert.equal(pinch.pinch, true);
    assert.ok(pinch.pinchRatio < 0.25);

    const miss = analyzeHand(place(PINCH_MISS, 0.5, 0.75));
    assert.equal(miss.pinch, false);
    assert.ok(miss.pinchRatio > 0.25 && miss.pinchRatio < 0.4);

    const claw = analyzeHand(place(CLAW, 0.5, 0.75));
    assert.equal(claw.pinch, true, `claw ratio ${claw.pinchRatio}`);
    assert.equal(claw.heart, false);

    const heart = analyzeHand(place(HEART, 0.5, 0.75));
    assert.equal(heart.heart, true, `heart ratio ${heart.pinchRatio}`);
    assert.equal(heart.indexUp, false);
    assert.equal(heart.peace, false);

    const side = analyzeHand(place(SIDEWAYS, 0.5, 0.75));
    assert.equal(side.straight.index, true);
    assert.equal(side.indexUp, false);

    const half = analyzeHand(place(HALF, 0.5, 0.75));
    assert.equal(half.open, false);
    assert.equal(half.fist, false);
  });

  it("keeps pinch and pointing when the hand is far from the camera", () => {
    const pinch = analyzeHand(place(PINCH, 0.5, 0.6, 0.35));
    assert.equal(pinch.pinch, true);
    const index = analyzeHand(place(INDEX, 0.5, 0.6, 0.35));
    assert.equal(index.indexUp, true);
  });
});

describe("sequence and timing", () => {
  it("grows the tree on an open-palm rise and ignores a short or closed rise", () => {
    const good = controller();
    hold(good, 0, 0.2, OPEN, 0.5, 0.82);
    const rose = slide(good, 0.2, 0.45, OPEN, { x: 0.5, y: 0.82 }, { x: 0.5, y: 0.6 });
    const settled = hold(good, 0.45, 0.7, OPEN, 0.5, 0.6);
    const tree = [...rose, ...settled].filter((ev) => ev.type === "tree");
    assert.equal(tree.length, 1);
    assert.equal(good.step, 2);

    const short = controller();
    hold(short, 0, 0.2, OPEN, 0.5, 0.82);
    slide(short, 0.2, 0.45, OPEN, { x: 0.5, y: 0.82 }, { x: 0.5, y: 0.7 });
    const missed = hold(short, 0.45, 0.8, OPEN, 0.5, 0.7);
    assert.equal(missed.length, 0);
    assert.equal(short.step, 1);

    const closed = controller();
    hold(closed, 0, 0.2, FIST, 0.5, 0.82);
    slide(closed, 0.2, 0.45, FIST, { x: 0.5, y: 0.82 }, { x: 0.5, y: 0.55 });
    const still = hold(closed, 0.45, 0.75, FIST, 0.5, 0.55);
    assert.equal(still.length, 0);

    const spike = controller();
    const spiked = feed(spike, 0, 0.4, (t) => [hand(place(OPEN, 0.5, Math.abs(t - 0.2) < 0.001 ? 0.5 : 0.82))]);
    assert.equal(spiked.length, 0);
  });

  it("ignores a slow drift that never covers 15% inside the window", () => {
    const slow = controller();
    const events = slide(slow, 0, 2, OPEN, { x: 0.5, y: 0.84 }, { x: 0.5, y: 0.64 });
    assert.equal(events.length, 0);
  });

  it("does not treat other gestures as the palm rise", () => {
    const gate = controller();
    assert.equal(hold(gate, 0, 0.5, PINCH, 0.5, 0.6).length, 0);
    assert.equal(hold(gate, 0.5, 1.1, INDEX, 0.5, 0.6).length, 0);
    assert.equal(hold(gate, 1.1, 1.6, HEART, 0.5, 0.6).length, 0);
    assert.equal(hold(gate, 1.6, 2.2, PEACE, 0.5, 0.6).length, 0);
    assert.equal(gate.step, 1);
  });

  it("adds an ornament per new pinch, caps at 12, and rejects a near miss", () => {
    const pin = controller();
    pin.jumpTo(2);
    const first = hold(pin, 0, 0.5, PINCH, 0.5, 0.6);
    assert.equal(first.length, 1);
    assert.equal(first[0].type, "ornament");
    assert.equal(first[0].count, 1);
    assert.equal(hold(pin, 0.5, 0.9, PINCH, 0.5, 0.6).length, 0, "holding the pinch must not repeat");

    const gap = controller();
    gap.jumpTo(2);
    const opened = hold(gap, 0, 0.2, PINCH, 0.5, 0.6);
    assert.equal(opened.length, 1);
    hold(gap, 0.2, 0.26, OPEN, 0.5, 0.6);
    const early = hold(gap, 0.26, opened[0].t + 0.35, PINCH, 0.5, 0.6);
    assert.equal(early.length, 0, "second pinch inside the 0.4s gap");
    const again = hold(gap, opened[0].t + 0.4, opened[0].t + 0.75, PINCH, 0.5, 0.6);
    assert.equal(again.length, 1);
    assert.equal(again[0].count, 2);

    const far = controller();
    far.jumpTo(2);
    assert.equal(hold(far, 0, 0.4, PINCH_MISS, 0.5, 0.6).length, 0);

    const brief = controller();
    brief.jumpTo(2);
    assert.equal(hold(brief, 0, 0.1, PINCH, 0.5, 0.6).length, 0);

    const cap = controller();
    cap.jumpTo(2);
    let t = 0;
    for (let i = 0; i < 13; i++) {
      hold(cap, t, t + 0.05, OPEN, 0.5, 0.6);
      t += 0.05;
      hold(cap, t, t + 0.45, PINCH, 0.5, 0.6);
      t += 0.45;
    }
    assert.equal(cap.ornamentCount, 12);
    assert.equal(cap.step, 2);
  });

  it("lets index-up advance after at least one pinch, including a scaled hand", () => {
    const blocked = controller();
    blocked.jumpTo(2);
    assert.equal(hold(blocked, 0, 0.45, INDEX, 0.5, 0.6).length, 0);

    const scaled = controller();
    scaled.jumpTo(2);
    feed(scaled, 0, 0.25, () => [hand(place(PINCH, 0.5, 0.6, 0.4))]);
    assert.equal(scaled.ornamentCount, 1);
    feed(scaled, 0.3, 0.45, () => [hand(place(OPEN, 0.5, 0.6, 0.4))]);
    const star = feed(scaled, 1.1, 1.6, () => [hand(place(INDEX, 0.5, 0.55, 0.4))]);
    assert.equal(star.length, 1);
    assert.equal(star[0].type, "star");
    assert.equal(scaled.step, 4);
  });

  it("requires the index to be held and ignores a peace sign or a sideways point", () => {
    const idx = controller();
    idx.jumpTo(3);
    assert.equal(hold(idx, 0, 0.2, INDEX, 0.5, 0.6).length, 0);
    const hit = hold(idx, 0.2, 0.6, INDEX, 0.5, 0.6);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].type, "star");

    const peace = controller();
    peace.jumpTo(3);
    assert.equal(hold(peace, 0, 0.6, PEACE, 0.5, 0.6).length, 0);

    const side = controller();
    side.jumpTo(3);
    assert.equal(hold(side, 0, 0.6, SIDEWAYS, 0.5, 0.6).length, 0);

    const other = controller();
    other.jumpTo(3);
    const events = feed(other, 0, 0.5, () => [
      hand(place(FIST, 0.3, 0.7), "Left"),
      hand(place(INDEX, 0.7, 0.55), "Right"),
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "star");
  });

  it("drops gifts only when both open palms push down", () => {
    const gifts = controller();
    gifts.jumpTo(4);
    hold(gifts, 0, 0.15, OPEN, 0.32, 0.35);
    feed(gifts, 0, 0.15, () => [
      hand(place(OPEN, 0.32, 0.35), "Right"),
      hand(place(OPEN, 0.68, 0.35), "Left"),
    ]);
    const moved = feed(gifts, 0.15, 0.4, (t) => {
      const u = (t - 0.15) / 0.25;
      const y = 0.35 + 0.2 * u;
      return [hand(place(OPEN, 0.32, y), "Right"), hand(place(OPEN, 0.68, y), "Left")];
    });
    const landed = feed(gifts, 0.4, 0.65, () => [
      hand(place(OPEN, 0.32, 0.55), "Right"),
      hand(place(OPEN, 0.68, 0.55), "Left"),
    ]);
    assert.equal([...moved, ...landed].filter((ev) => ev.type === "gifts").length, 1);
    assert.equal(gifts.step, 5);

    const one = controller();
    one.jumpTo(4);
    feed(one, 0, 0.15, () => [hand(place(OPEN, 0.5, 0.35))]);
    feed(one, 0.15, 0.55, (t) => {
      const y = t < 0.4 ? 0.35 + ((t - 0.15) / 0.25) * 0.2 : 0.55;
      return [hand(place(OPEN, 0.5, Math.min(y, 0.55)))];
    });
    assert.equal(one.step, 4);

    const shy = controller();
    shy.jumpTo(4);
    feed(shy, 0, 0.7, (t) => {
      const y = t < 0.2 ? 0.4 : t < 0.45 ? 0.4 + ((t - 0.2) / 0.25) * 0.08 : 0.48;
      return [hand(place(OPEN, 0.32, y), "Right"), hand(place(OPEN, 0.68, y), "Left")];
    });
    assert.equal(shy.step, 4);

    const mixed = controller();
    mixed.jumpTo(4);
    feed(mixed, 0, 0.7, (t) => {
      const y = t < 0.2 ? 0.35 : t < 0.45 ? 0.35 + ((t - 0.2) / 0.25) * 0.2 : 0.55;
      return [hand(place(OPEN, 0.32, y), "Right"), hand(place(FIST, 0.68, y), "Left")];
    });
    assert.equal(mixed.step, 4);
  });

  it("forms the reindeer on a finger heart or a peace sign", () => {
    const heart = controller();
    heart.jumpTo(5);
    assert.equal(hold(heart, 0, 0.2, HEART, 0.5, 0.7).length, 0);
    const hit = hold(heart, 0.2, 0.6, HEART, 0.5, 0.7);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].type, "reindeer");
    assert.equal(heart.step, 6);

    const uncrossed = controller();
    uncrossed.jumpTo(5);
    assert.equal(hold(uncrossed, 0, 0.6, CLAW, 0.5, 0.7).length, 0);

    const peace = controller();
    peace.jumpTo(5);
    const fallback = hold(peace, 0, 0.45, PEACE, 0.5, 0.6);
    assert.equal(fallback.length, 1);
    assert.equal(fallback[0].type, "reindeer");
  });

  it("starts snow on a fist that opens, not a short fist or a late open", () => {
    const snow = controller();
    snow.jumpTo(6);
    hold(snow, 0, 0.3, FIST, 0.5, 0.6);
    const burst = hold(snow, 0.3, 0.5, OPEN, 0.5, 0.6);
    assert.equal(burst.length, 1);
    assert.equal(burst[0].type, "snow");
    assert.equal(snow.step, 7);

    const short = controller();
    short.jumpTo(6);
    hold(short, 0, 0.1, FIST, 0.5, 0.6);
    assert.equal(hold(short, 0.1, 0.4, OPEN, 0.5, 0.6).length, 0);

    const late = controller();
    late.jumpTo(6);
    hold(late, 0, 0.3, FIST, 0.5, 0.6);
    hold(late, 0.3, 1.05, HALF, 0.5, 0.6);
    assert.equal(hold(late, 1.05, 1.3, OPEN, 0.5, 0.6).length, 0);
  });

  it("flies the sleigh on a sideways swipe in either direction", () => {
    const right = controller();
    right.jumpTo(7);
    hold(right, 0, 0.12, OPEN, 0.15, 0.5);
    slide(right, 0.12, 0.32, OPEN, { x: 0.15, y: 0.5 }, { x: 0.62, y: 0.52 });
    const flew = hold(right, 0.32, 0.55, OPEN, 0.62, 0.52);
    assert.equal(flew.length, 1);
    assert.equal(flew[0].type, "sleigh");
    assert.equal(right.phase, "free");

    const left = controller();
    left.jumpTo(7);
    hold(left, 0, 0.12, OPEN, 0.85, 0.5);
    slide(left, 0.12, 0.32, OPEN, { x: 0.85, y: 0.5 }, { x: 0.35, y: 0.5 });
    const back = hold(left, 0.32, 0.55, OPEN, 0.35, 0.5);
    assert.equal(back.length, 1);

    const shy = controller();
    shy.jumpTo(7);
    hold(shy, 0, 0.12, OPEN, 0.3, 0.5);
    slide(shy, 0.12, 0.32, OPEN, { x: 0.3, y: 0.5 }, { x: 0.58, y: 0.5 });
    assert.equal(hold(shy, 0.32, 0.55, OPEN, 0.58, 0.5).length, 0);

    const closed = controller();
    closed.jumpTo(7);
    hold(closed, 0, 0.12, FIST, 0.15, 0.5);
    slide(closed, 0.12, 0.32, FIST, { x: 0.15, y: 0.5 }, { x: 0.7, y: 0.5 });
    assert.equal(hold(closed, 0.32, 0.55, FIST, 0.7, 0.5).length, 0);

    const diagonal = controller();
    diagonal.jumpTo(7);
    hold(diagonal, 0, 0.12, OPEN, 0.2, 0.75);
    slide(diagonal, 0.12, 0.32, OPEN, { x: 0.2, y: 0.75 }, { x: 0.65, y: 0.3 });
    assert.equal(hold(diagonal, 0.32, 0.55, OPEN, 0.65, 0.3).length, 0);
  });

  it("enforces the 0.6s cooldown between different gestures", () => {
    const seq = controller();
    hold(seq, 0, 0.15, OPEN, 0.5, 0.8);
    slide(seq, 0.15, 0.35, OPEN, { x: 0.5, y: 0.8 }, { x: 0.5, y: 0.58 });
    const tree = hold(seq, 0.35, 0.5, OPEN, 0.5, 0.58);
    assert.equal(tree.length, 1);
    const tooSoon = hold(seq, 0.5, 0.85, PINCH, 0.5, 0.58);
    assert.equal(tooSoon.length, 0);
    const later = hold(seq, 1.15, 1.45, PINCH, 0.5, 0.58);
    assert.equal(later.length, 1);
    assert.equal(later[0].type, "ornament");
  });

  it("plays every gesture in order and then accepts them in any order", () => {
    const seq = controller();
    hold(seq, 0, 0.12, OPEN, 0.5, 0.82);
    slide(seq, 0.12, 0.32, OPEN, { x: 0.5, y: 0.82 }, { x: 0.5, y: 0.6 });
    assert.equal(hold(seq, 0.32, 0.5, OPEN, 0.5, 0.6)[0].type, "tree");

    const pinch = hold(seq, 1.2, 1.5, PINCH, 0.5, 0.6);
    assert.equal(pinch[0].type, "ornament");
    const star = hold(seq, 2.2, 2.6, INDEX, 0.5, 0.55);
    assert.equal(star[0].type, "star");
    assert.equal(seq.step, 4);

    feed(seq, 3.3, 3.45, () => [
      hand(place(OPEN, 0.32, 0.34), "Right"),
      hand(place(OPEN, 0.7, 0.34), "Left"),
    ]);
    feed(seq, 3.45, 3.7, (t) => {
      const y = 0.34 + ((t - 3.45) / 0.25) * 0.2;
      return [hand(place(OPEN, 0.32, y), "Right"), hand(place(OPEN, 0.7, y), "Left")];
    });
    const gifts = feed(seq, 3.7, 3.95, () => [
      hand(place(OPEN, 0.32, 0.56), "Right"),
      hand(place(OPEN, 0.7, 0.56), "Left"),
    ]);
    assert.equal(gifts.at(-1).type, "gifts");

    const deer = hold(seq, 4.7, 5.15, PEACE, 0.5, 0.6);
    assert.equal(deer[0].type, "reindeer");
    hold(seq, 5.8, 6.1, FIST, 0.5, 0.6);
    const snow = hold(seq, 6.1, 6.3, OPEN, 0.5, 0.6);
    assert.equal(snow[0].type, "snow");

    hold(seq, 7.0, 7.12, OPEN, 0.15, 0.5);
    slide(seq, 7.12, 7.32, OPEN, { x: 0.15, y: 0.5 }, { x: 0.62, y: 0.5 });
    const sleigh = hold(seq, 7.32, 7.55, OPEN, 0.62, 0.5);
    assert.equal(sleigh[0].type, "sleigh");
    assert.equal(seq.phase, "free");

    const again = hold(seq, 8.3, 8.6, PINCH, 0.5, 0.55);
    assert.equal(again[0].type, "ornament");
    hold(seq, 9.3, 9.45, OPEN, 0.5, 0.8);
    slide(seq, 9.45, 9.65, OPEN, { x: 0.5, y: 0.8 }, { x: 0.5, y: 0.58 });
    const regrow = hold(seq, 9.65, 9.9, OPEN, 0.5, 0.58);
    assert.equal(regrow[0].type, "tree");
  });

  it("jumps, resets, and names the current gesture", () => {
    const seq = controller();
    seq.jumpTo(5);
    assert.equal(seq.step, 5);
    assert.equal(seq.ornamentCount, 8);
    assert.equal(hintText(seq), "Finger heart");
    seq.jumpTo(2);
    assert.equal(seq.ornamentCount, 0);
    assert.equal(hintText(seq), "Pinch");
    seq.ornamentCount = 3;
    assert.equal(hintText(seq), "Index up");
    seq.jumpTo(1);
    assert.equal(hintText(seq), "Raise an open palm");
    seq.phase = "free";
    assert.equal(hintText(seq), "");
    seq.reset();
    assert.equal(seq.step, 1);
    assert.equal(seq.phase, "sequence");
  });

  it("rejects a forced gesture that the step is not listening for", () => {
    const seq = controller();
    assert.equal(seq.acknowledge("ornament", 1), null);
    const ev = seq.acknowledge("tree", 1);
    assert.equal(ev.type, "tree");
    assert.equal(seq.acknowledge("ornament", 1.2), null);
    assert.equal(seq.acknowledge("ornament", 1.7).type, "ornament");
  });

  it("smooths away a one-frame pinch spike but still sees a real pinch", () => {
    const noisy = createGestureController({ smoothFrames: 4 });
    noisy.jumpTo(2);
    const events = feed(noisy, 0, 0.5, (t) => {
      const pose = t > 0.2 && t < 0.26 ? PINCH : OPEN;
      return [hand(place(pose, 0.5, 0.6))];
    });
    assert.equal(events.length, 0);

    const real = createGestureController({ smoothFrames: 4 });
    real.jumpTo(2);
    const hit = feed(real, 0, 0.45, () => [hand(place(PINCH, 0.5, 0.6))]);
    assert.equal(hit.length, 1);
  });
});
