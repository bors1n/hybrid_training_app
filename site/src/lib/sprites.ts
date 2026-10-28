import type { Shape, Sprite } from './pixelArt.ts';

/**
 * Спортсмены для полосы на главной: бегун, лыжник (классический ход) и велосипедист.
 * Позы считаются из «скелета»: углы суставов или положение стопы, колено и локоть находятся по длинам костей.
 * Ближние к зрителю рука и нога светлые, дальние — серые: так видно, какая нога впереди.
 * Все смотрят и движутся вправо: козырёк, нос и носки лыж — вперёд.
 */

/** Цвета — из дизайн-системы. */
export const WHITE = '#F3F5F8';
export const SKY = '#8FD0FF';
export const BLUE = '#3091D8';
export const COBALT = '#7C9BFF';
export const GREY = '#9AA4B2';
export const DIM = '#586170';
export const NIGHT = '#15181E';

export const FRAMES = 8;

interface P {
  x: number;
  y: number;
}

const rad = (d: number): number => (d * Math.PI) / 180;
/** Точка на расстоянии `len` от `p`; угол — от вертикали вниз, плюс — вперёд (вправо). */
const down = (p: P, angle: number, len: number): P => ({ x: p.x + len * Math.sin(rad(angle)), y: p.y + len * Math.cos(rad(angle)) });
/** То же вверх: угол от вертикали вверх, плюс — вперёд. */
const up = (p: P, angle: number, len: number): P => ({ x: p.x + len * Math.sin(rad(angle)), y: p.y - len * Math.cos(rad(angle)) });
const add = (p: P, dx: number, dy: number): P => ({ x: p.x + dx, y: p.y + dy });
/** Угол отрезка a→b от вертикали вниз, плюс — вперёд. */
const angleOf = (a: P, b: P): number => (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
const pt = (p: P): [number, number] => [Math.round(p.x), Math.round(p.y)];
const seg = (color: string, t: number, ...pts: P[]): Shape => ({ color, t, line: pts.flatMap(pt) });
const dot = (color: string, p: P): Shape => ({ color, line: pt(p) });

/** Средний сустав (колено, локоть) между `a` и `b` по длинам костей; сгиб — вперёд или вниз. */
function joint(a: P, b: P, l1: number, l2: number, prefer: 'forward' | 'down'): P {
  const d = Math.min(Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const base = Math.atan2(b.y - a.y, b.x - a.x);
  const spread = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const c1 = { x: a.x + l1 * Math.cos(base + spread), y: a.y + l1 * Math.sin(base + spread) };
  const c2 = { x: a.x + l1 * Math.cos(base - spread), y: a.y + l1 * Math.sin(base - spread) };
  if (prefer === 'forward') return c1.x >= c2.x ? c1 : c2;
  return c1.y >= c2.y ? c1 : c2;
}

/** Голова 5×5 с глазом и носом (нос торчит вперёд) и головным убором. */
function head(center: P, hat: 'cap' | 'beanie' | 'helmet'): Shape[] {
  const hx = Math.round(center.x) - 2;
  const hy = Math.round(center.y) - 2;
  const shapes: Shape[] = [{ color: WHITE, disc: [hx + 2.5, hy + 2.5, 2.7] }, dot(WHITE, { x: hx + 5, y: hy + 3 })];
  if (hat === 'cap') {
    // Кепка с длинным козырьком вперёд — главный знак направления.
    shapes.push(seg(BLUE, 1, { x: hx + 1, y: hy }, { x: hx + 3, y: hy }), seg(BLUE, 1, { x: hx, y: hy + 1 }, { x: hx + 6, y: hy + 1 }));
  } else if (hat === 'beanie') {
    shapes.push(
      seg(BLUE, 1, { x: hx + 1, y: hy - 1 }, { x: hx + 3, y: hy - 1 }),
      seg(BLUE, 1, { x: hx, y: hy }, { x: hx + 4, y: hy }),
      seg(BLUE, 1, { x: hx, y: hy + 1 }, { x: hx + 4, y: hy + 1 }),
      dot(SKY, { x: hx, y: hy - 2 }), // помпон сзади
    );
  } else {
    // Шлем вытянут назад, козырёк вперёд.
    shapes.push(
      seg(BLUE, 1, { x: hx, y: hy - 1 }, { x: hx + 3, y: hy - 1 }),
      seg(BLUE, 1, { x: hx - 2, y: hy }, { x: hx + 4, y: hy }),
      seg(BLUE, 1, { x: hx - 1, y: hy + 1 }, { x: hx + 5, y: hy + 1 }),
    );
  }
  shapes.push(dot(NIGHT, { x: hx + 3, y: hy + 2 }));
  return shapes;
}

/* ---------- Бегун: 8 кадров цикла (касание → опора → толчок → мах), вторая нога — со сдвигом на полцикла ---------- */

/** Угол бедра от вертикали и сгиб колена по кадрам цикла. */
const RUN_THIGH = [30, 15, 0, -20, -35, -20, 15, 40];
const RUN_KNEE = [15, 40, 35, 20, 30, 95, 110, 60];
const RUN = { w: 30, h: 32, thigh: 7, shin: 7, foot: 3, torso: 10, lean: 12 };

function runLeg(hip: P, k: number): { knee: P; ankle: P; toe: P } {
  const thigh = RUN_THIGH[k % FRAMES]!;
  const knee = down(hip, thigh, RUN.thigh);
  const shin = thigh - RUN_KNEE[k % FRAMES]!;
  const ankle = down(knee, shin, RUN.shin);
  // Стопа перпендикулярна голени и смотрит вперёд.
  return { knee, ankle, toe: { x: ankle.x + RUN.foot * Math.cos(rad(shin)), y: ankle.y - RUN.foot * Math.sin(rad(shin)) } };
}

function runnerFrame(i: number): Shape[] {
  const ground = RUN.h - 2;
  // Бедро ставим так, чтобы нижняя точка стоп касалась земли: отсюда естественное «подпрыгивание».
  const probe = [runLeg({ x: 0, y: 0 }, i), runLeg({ x: 0, y: 0 }, i + 4)];
  const lowest = Math.max(...probe.flatMap((l) => [l.ankle.y, l.toe.y]));
  const hip = { x: 13, y: ground - lowest };
  const near = runLeg(hip, i);
  const far = runLeg(hip, i + 4);
  const shoulder = up(hip, RUN.lean, RUN.torso);
  const arm = (k: number): [P, P] => {
    const swing = -0.9 * RUN_THIGH[k % FRAMES]!; // рука идёт навстречу своей ноге
    const elbow = down(shoulder, swing, 5);
    return [elbow, down(elbow, swing + 95, 4)];
  };
  const [farElbow, farHand] = arm(i + 4);
  const [nearElbow, nearHand] = arm(i);
  return [
    seg(GREY, 2, shoulder, farElbow, farHand),
    seg(GREY, 3, hip, far.knee),
    seg(GREY, 2, far.knee, far.ankle),
    seg(DIM, 2, far.ankle, far.toe),
    seg(SKY, 4, up(hip, RUN.lean, 2), shoulder),
    seg(COBALT, 4, hip, up(hip, RUN.lean, 1)),
    ...head(up(shoulder, 15, 3.5), 'cap'),
    seg(WHITE, 3, hip, near.knee),
    seg(COBALT, 3, hip, down(hip, RUN_THIGH[i]!, 2)),
    seg(WHITE, 2, near.knee, near.ankle),
    seg(BLUE, 2, near.ankle, near.toe),
    seg(WHITE, 2, shoulder, nearElbow, nearHand),
  ];
}

export const RUNNER: Sprite = { w: RUN.w, h: RUN.h, frames: Array.from({ length: FRAMES }, (_, i) => runnerFrame(i)) };

/* ---------- Лыжник: классический попеременный ход. Лыжи всегда на снегу, палка ставится позади руки ---------- */

/** Положение стопы относительно бедра по кадрам: нога выносится вперёд и отталкивается назад. */
const SKI_FOOT = [8, 6, 3, -1, -6, -3, 2, 6];
const SKI_BOB = [0, 0.5, 1, 0.5, 0, 0.5, 1, 0.5];
const SKI = { w: 48, h: 32, thigh: 8, shin: 7, torso: 10, lean: 28, pole: 17 };

function skierFrame(i: number): Shape[] {
  const ground = SKI.h - 2;
  const hip = { x: 21, y: ground - 13 + SKI_BOB[i]! };
  const shoulder = up(hip, SKI.lean, SKI.torso);

  const leg = (k: number) => {
    const ankle = { x: hip.x + SKI_FOOT[k % FRAMES]!, y: ground - 1 };
    return { ankle, knee: joint(hip, ankle, SKI.thigh, SKI.shin, 'forward') };
  };
  const side = (k: number) => {
    const l = leg(k);
    // Рука идёт навстречу своей ноге; палка вынесенной вперёд руки воткнута в снег позади кисти.
    const swing = -1.3 * angleOf(hip, l.ankle);
    const elbow = down(shoulder, swing, 5);
    const hand = down(elbow, swing + 25, 5);
    let tip = down(hand, -58, SKI.pole);
    if (swing > 5 || tip.y > ground) {
      const dy = ground - hand.y;
      tip = { x: hand.x - Math.sqrt(Math.max(0, SKI.pole ** 2 - dy * dy)), y: ground };
    }
    const toHand = Math.hypot(hand.x - tip.x, hand.y - tip.y) || 1;
    const basket = { x: tip.x + ((hand.x - tip.x) * 2) / toHand, y: tip.y + ((hand.y - tip.y) * 2) / toHand };
    const ski = (color: string): Shape[] => [
      seg(color, 1, add(l.ankle, -12, 1), add(l.ankle, 11, 1)),
      seg(color, 1, add(l.ankle, 12, 0), add(l.ankle, 13, -1)), // носок загнут вверх
    ];
    return { ...l, elbow, hand, tip, basket, ski };
  };
  const near = side(i);
  const far = side(i + 4);
  const pole = (s: typeof near, color: string): Shape[] => [
    seg(color, 1, add(s.hand, 0, -1), s.tip),
    seg(color, 1, add(s.basket, -1, 0), add(s.basket, 1, 0)),
  ];

  return [
    ...pole(far, GREY),
    ...far.ski(GREY),
    seg(DIM, 3, hip, far.knee),
    seg(DIM, 2, far.knee, far.ankle),
    seg(DIM, 2, far.ankle, add(far.ankle, 2, 0)),
    seg(GREY, 2, shoulder, far.elbow, far.hand),
    seg(COBALT, 4, up(hip, SKI.lean, 1), shoulder),
    ...head(up(shoulder, 30, 3.5), 'beanie'),
    ...near.ski(WHITE),
    seg(BLUE, 3, hip, near.knee),
    seg(BLUE, 2, near.knee, near.ankle),
    seg(WHITE, 2, near.ankle, add(near.ankle, 2, 0)),
    seg(SKY, 2, shoulder, near.elbow, near.hand),
    ...pole(near, WHITE),
    dot(WHITE, near.hand),
  ];
}

export const SKIER: Sprite = { w: SKI.w, h: SKI.h, frames: Array.from({ length: FRAMES }, (_, i) => skierFrame(i)) };

/* ---------- Велосипедист: педали проходят круг за 8 кадров, колено считается от положения педали ---------- */

const BIKE = { w: 46, h: 32, wheel: 7, crank: 3.5, thigh: 9, shin: 8 };

function cyclistFrame(i: number): Shape[] {
  const axleY = BIKE.h - 1 - BIKE.wheel;
  const rear = { x: 9, y: axleY };
  const front = { x: 37, y: axleY };
  const bb = { x: 20, y: axleY + 1 };
  const seatTop = { x: 17, y: 14 };
  const headTop = { x: 31, y: 13 };
  const headBot = { x: 32, y: 16 };
  const hip = { x: 17, y: 12 };
  const shoulder = up(hip, 62, 11);
  const handle = { x: 35, y: 12 };

  const wheel = (c: P): Shape[] => {
    const a = rad(i * 22.5);
    const spoke = (phi: number): Shape =>
      seg(DIM, 1, add(c, -(BIKE.wheel - 1) * Math.cos(phi), -(BIKE.wheel - 1) * Math.sin(phi)), add(c, (BIKE.wheel - 1) * Math.cos(phi), (BIKE.wheel - 1) * Math.sin(phi)));
    return [spoke(a), spoke(a + Math.PI / 2), { color: BLUE, circle: [c.x, c.y, BIKE.wheel] }, dot(WHITE, c)];
  };
  // Педали крутятся по часовой стрелке (едем вправо).
  const pedalSide = (k: number) => {
    const theta = rad(k * 45);
    const pedal = { x: bb.x + BIKE.crank * Math.cos(theta), y: bb.y + BIKE.crank * Math.sin(theta) };
    const ankle = add(pedal, -0.5, -1);
    return { pedal, ankle, knee: joint(hip, ankle, BIKE.thigh, BIKE.shin, 'forward') };
  };
  const near = pedalSide(i);
  const far = pedalSide(i + 4);
  const elbow = joint(shoulder, handle, 5, 5, 'down');

  return [
    ...wheel(rear),
    ...wheel(front),
    seg(DIM, 3, hip, far.knee),
    seg(DIM, 2, far.knee, far.ankle),
    seg(DIM, 1, bb, far.pedal),
    seg(SKY, 1, bb, rear, seatTop),
    seg(SKY, 2, bb, seatTop),
    seg(SKY, 2, seatTop, headTop),
    seg(SKY, 2, bb, headBot),
    seg(SKY, 1, headTop, headBot, front),
    seg(GREY, 1, headTop, { x: 34, y: 11 }, handle, add(handle, 0, 2)),
    seg(DIM, 2, { x: 15, y: 13 }, { x: 18, y: 13 }),
    { color: GREY, circle: [bb.x, bb.y, 2] },
    seg(COBALT, 4, up(hip, 62, 1), shoulder),
    seg(BLUE, 3, hip, down(hip, angleOf(hip, near.knee), 2)),
    ...head(up(shoulder, 55, 3.3), 'helmet'),
    seg(WHITE, 3, hip, near.knee),
    seg(WHITE, 2, near.knee, near.ankle),
    seg(BLUE, 2, near.ankle, add(near.ankle, 2, 0)),
    seg(GREY, 1, bb, near.pedal),
    seg(WHITE, 2, shoulder, elbow, handle),
  ];
}

export const CYCLIST: Sprite = { w: BIKE.w, h: BIKE.h, frames: Array.from({ length: FRAMES }, (_, i) => cyclistFrame(i)) };
