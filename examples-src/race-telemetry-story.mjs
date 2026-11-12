/**
 * What happened on the last lap, worked out from the telemetry: the two cars fighting for the win,
 * the gap between them, the running order, and every piece of text that changes and when.
 *
 * race-telemetry-art.mjs draws from this and race-telemetry.mjs animates from it, so both tell the
 * same story.
 */
import { snapshot, drivers, driver, carAt, gapBehind } from './race-telemetry-data.mjs';

/** The replay opens this many seconds before the last lap begins. RACE_FROM starts it later, to check a moment quickly. */
export const START = Number(process.env.RACE_FROM ?? -6);
/** It ends once the first six have taken the flag and the result has been up for a moment. */
export const END = 97;

/** The winner and the car chasing him. */
export const A = driver('GAS');
export const B = driver('SAI');
export const lastLap = (car) => car.laps.find((item) => item.lap === snapshot.laps);
export const previousLap = (car) => car.laps.find((item) => item.lap === snapshot.laps - 1);
/** The moment the winner takes the flag. */
export const FLAG = A.finish;

/**
 * A car's instruments at a moment. The telemetry ends at the flag, so from there on they hold what
 * they read as the car crossed the line.
 */
export const instruments = (car, t) => carAt(car, Math.min(t, car.finish - 0.001));

/** The gap between the two leaders at the timing lines, as the official times give it: [when the second car crossed, gap]. */
export const OFFICIAL_GAPS = [
  [previousLap(B).s2End, previousLap(B).s2End - previousLap(A).s2End],
  [previousLap(B).end, previousLap(B).end - previousLap(A).end],
  [lastLap(B).s1End, lastLap(B).s1End - lastLap(A).s1End],
  [lastLap(B).s2End, lastLap(B).s2End - lastLap(A).s2End],
  [B.finish, B.official.behind],
];
const measuredGap = (t) => gapBehind(B, A, Math.min(t, B.finish - 0.001));
const gapErrors = OFFICIAL_GAPS.map(([at, gap]) => [at, gap - measuredGap(at)]);
/**
 * The live gap: measured from the two cars' positions, then nudged so that it reads the official gap
 * each time the second car crosses a timing line.
 */
function liveGap(t) {
  let nudge = gapErrors[0][1];
  for (let i = 1; i < gapErrors.length; i++) {
    if (t < gapErrors[i - 1][0]) break;
    const k = Math.min(1, (t - gapErrors[i - 1][0]) / (gapErrors[i][0] - gapErrors[i - 1][0]));
    nudge = gapErrors[i - 1][1] + (gapErrors[i][1] - gapErrors[i - 1][1]) * k;
  }
  return measuredGap(t) + nudge;
}
/** The gap in seconds, smoothed over half a second so the readout doesn't flicker with every position sample. */
export function gapAt(t) {
  if (t >= B.finish) return B.official.behind;
  let sum = 0;
  let count = 0;
  for (let offset = -0.25; offset <= 0.2501; offset += 0.05) {
    if (t + offset >= B.finish) continue;
    sum += liveGap(t + offset);
    count += 1;
  }
  return sum / count;
}

/** When DRS is open on a car, as [from, to] spans. */
export function drsSpans(car) {
  const spans = [];
  let open = null;
  for (let i = 0; i < car.samples.t.length; i++) {
    if (car.samples.drs[i] && open === null) open = car.samples.t[i];
    if (!car.samples.drs[i] && open !== null) {
      spans.push([open, car.samples.t[i]]);
      open = null;
    }
  }
  return spans;
}
/** The chasing car's DRS on the last lap. */
export const DRS_B = drsSpans(B).filter(([, to]) => to > 0);

/** The running order at a moment: flagged cars by their finish, the rest by how far they have gone. */
export function orderAt(t) {
  return [...drivers].sort((x, y) => {
    const fx = t >= x.finish;
    const fy = t >= y.finish;
    if (fx && fy) return x.finish - y.finish;
    if (fx !== fy) return fx ? -1 : 1;
    return carAt(y, t).lap - carAt(x, t).lap;
  });
}
/** Every moment of the replay at which the running order changes, with the new order. */
export const ORDER_CHANGES = (() => {
  const changes = [[START, orderAt(START)]];
  for (let t = START + 0.1; t <= END; t += 0.1) {
    const order = orderAt(t);
    if (order.some((car, i) => car !== changes.at(-1)[1][i])) changes.push([Number(t.toFixed(1)), order]);
  }
  return changes;
})();
/** The cars that change place during the replay: their tower rows are the ones that move. */
export const MOVERS = drivers.filter((car) => ORDER_CHANGES.some(([, order]) => order.indexOf(car) !== ORDER_CHANGES[0][1].indexOf(car)));

/**
 * A car's gap to the leader as the tower shows it. It changes each time the car crosses a timing
 * line, to the official difference there, as on a timing screen.
 */
function towerGaps(car) {
  if (car === A) return [[-Infinity, 'LEADER']];
  const points = [];
  for (const lap of [previousLap, lastLap]) {
    for (const key of ['s1End', 's2End', 'end']) {
      const own = lap(car)[key];
      const leader = lap(A)[key];
      if (typeof own !== 'number' || typeof leader !== 'number') continue;
      const finish = lap === lastLap && key === 'end';
      points.push([own, `+${(finish ? car.official.behind : own - leader).toFixed(3)}`]);
    }
  }
  return points.sort((x, y) => x[0] - y[0]);
}
const TOWER_GAPS = new Map(drivers.map((car) => [car, towerGaps(car)]));
const latest = (list, t) => {
  let found = list[0];
  for (const item of list) if (item[0] <= t) found = item;
  return found;
};
/** The tower's gaps column at a moment, one line a row. */
const towerAt = (t) =>
  latest(ORDER_CHANGES, t)[1]
    .map((car) => latest(TOWER_GAPS.get(car), t)[1])
    .join('\n');

/** The two leaders' sector times as they come in, and who was quicker in each. */
function sectorsAt(t) {
  const done = (car) => [lastLap(car).s1End, lastLap(car).s2End, car.finish];
  const times = (car) => [lastLap(car).s1, lastLap(car).s2, lastLap(car).s3];
  const column = (car) => times(car).map((value, i) => (t >= done(car)[i] ? value.toFixed(3) : '–')).join('\n');
  return {
    sectors_a: column(A),
    sectors_b: column(B),
    sectors_gain: times(A)
      .map((value, i) => {
        if (t < Math.max(done(A)[i], done(B)[i])) return ' ';
        const other = times(B)[i];
        return `${value < other ? A.code : B.code} −${Math.abs(value - other).toFixed(3)}`;
      })
      .join('\n'),
  };
}

const onLastLap = (car) => car.samples.t.map((_, i) => i).filter((i) => car.samples.t[i] >= 0);
/** Each leader's top speed on the last lap, and when he reached it. */
const TOP = Object.fromEntries(
  [
    ['a', A],
    ['b', B],
  ].map(([key, car]) => {
    const i = onLastLap(car).reduce((best, at) => (car.samples.speed[at] > car.samples.speed[best] ? at : best));
    return [key, { speed: car.samples.speed[i], at: car.samples.t[i] }];
  }),
);

/** The captions: when each comes up, how long it stays, and what it says. */
function captionList() {
  const [s1, s2] = [OFFICIAL_GAPS[2], OFFICIAL_GAPS[3]];
  const quicker = (key) => {
    const [x, y] = [lastLap(A)[key], lastLap(B)[key]];
    return `${x < y ? A.last : B.last} quicker by ${Math.abs(x - y).toFixed(3)} s`;
  };
  // The last corner: where the leader is slowest in the lap's final fifth.
  const finalFifth = onLastLap(A).filter((i) => A.samples.lap[i] > snapshot.laps + 0.8);
  const lastCorner = finalFifth.reduce((best, i) => (A.samples.speed[i] < A.samples.speed[best] ? i : best));
  const list = [
    { at: START + 0.5, stay: 3.6, title: 'ONE LAP TO GO', sub: `${A.last} leads ${B.last} by a second` },
    { at: 0.1, stay: 3.2, title: 'FINAL LAP', sub: `${OFFICIAL_GAPS[1][1].toFixed(3)} s between them at the line` },
    { at: Math.max(4.2, DRS_B[0]?.[0] ?? 4.2), stay: 3.4, title: 'DRS OPEN', sub: `${B.last} is within a second and opens the wing` },
    { at: TOP.b.at + 0.4, stay: 3.6, title: `${TOP.b.speed} KM/H`, sub: `${B.last} with DRS and the tow · ${A.last} ${TOP.a.speed}` },
    { at: s1[0] + 0.3, stay: 3.6, title: 'SECTOR 1', sub: `Gap ${s1[1].toFixed(3)} s · ${quicker('s1')}` },
    { at: (DRS_B[1]?.[0] ?? 50.4) + 0.3, stay: 3.4, title: 'DRS OPEN', sub: 'The last straight before the Ascari chicane' },
    { at: s2[0] + 0.3, stay: 3.6, title: 'SECTOR 2', sub: `Gap ${s2[1].toFixed(3)} s · ${quicker('s2')}` },
    { at: A.samples.t[lastCorner] - 1.6, stay: 3.4, title: 'PARABOLICA', sub: 'The last corner before the flag' },
    { at: FLAG + 0.05, stay: 4.4, title: 'CHEQUERED FLAG', sub: `${A.first} ${A.last} wins by ${B.official.behind.toFixed(3)} s` },
  ].filter((item) => item.at + item.stay > START);
  // An overtake further back gets a caption when nothing else is up.
  for (const [at, order] of ORDER_CHANGES.slice(1)) {
    const before = [...ORDER_CHANGES].reverse().find(([from]) => from < at)[1];
    const passer = order.find((car, i) => before.indexOf(car) > i);
    if (!passer || at >= passer.finish || at < 0) continue;
    const place = order.indexOf(passer);
    const clear = list.every((item) => at + 0.3 + 3.2 + 1 < item.at || at + 0.3 > item.at + item.stay + 1);
    if (clear) list.push({ at: at + 0.3, stay: 3.2, title: 'OVERTAKE', sub: `${passer.last} passes ${before[place].last} for P${place + 1}` });
  }
  return list.sort((x, y) => x.at - y.at);
}
export const CAPTIONS = captionList();
/** When each caption is up, as [from, to] spans. */
export const CAPTION_SPANS = CAPTIONS.map((item) => [item.at, item.at + item.stay]);
/** A caption's text changes half a second before it comes up, when the one before is long gone. */
const captionAt = (t) => [...CAPTIONS].reverse().find((item) => item.at - 0.5 <= t) ?? CAPTIONS[0];

/** Which way the gap is going, looked at twice a second. It has to hold for a second before the word changes. */
const TRENDS = (() => {
  const raw = (t) => {
    const moved = gapAt(t) - gapAt(t - 2);
    return moved < -0.04 ? 'CLOSING' : moved > 0.04 ? 'OPENING' : 'STEADY';
  };
  const list = [[START, raw(START)]];
  let pending = null;
  for (let t = START + 0.5; t < B.finish; t += 0.5) {
    const now = raw(t);
    if (now === list.at(-1)[1]) pending = null;
    else if (pending === now) {
      list.push([t, now]);
      pending = null;
    } else pending = now;
  }
  // Once the second car has taken the flag the gap is the result.
  list.push([B.finish, 'FINAL']);
  return list;
})();

/** Every piece of text that changes during the replay, at a moment. */
function textAt(t) {
  const caption = captionAt(t);
  return {
    lap: t >= FLAG ? 'FINISH' : `${t < 0 ? snapshot.laps - 1 : snapshot.laps}/${snapshot.laps}`,
    tower: towerAt(t),
    ...sectorsAt(t),
    banner: caption.title,
    banner_sub: caption.sub,
    trend: latest(TRENDS, t)[1],
    top_a: t >= TOP.a.at ? String(TOP.a.speed) : '–',
    top_b: t >= TOP.b.at ? String(TOP.b.speed) : '–',
  };
}
/**
 * The text as a script: what every field says as the replay opens, and then each moment something
 * changes, with only the fields that change: [seconds of the race, { field: text }].
 */
export function script() {
  const moments = new Set([0, FLAG, B.finish, TOP.a.at, TOP.b.at]);
  for (const [at] of ORDER_CHANGES) moments.add(at);
  for (const list of TOWER_GAPS.values()) for (const [at] of list) moments.add(at);
  for (const car of [A, B]) for (const at of [lastLap(car).s1End, lastLap(car).s2End, car.finish]) moments.add(at);
  for (const item of CAPTIONS) moments.add(item.at - 0.5);
  for (const [at] of TRENDS) moments.add(at);
  const opening = textAt(START);
  const events = [];
  let shown = opening;
  for (const at of [...moments].filter((moment) => moment > START && moment <= END).sort((x, y) => x - y)) {
    const now = textAt(at);
    const changed = Object.fromEntries(Object.entries(now).filter(([key, value]) => value !== shown[key]));
    if (Object.keys(changed).length) events.push([Number(at.toFixed(3)), changed]);
    shown = now;
  }
  return { opening, events };
}

/** A value at every tenth of a second of the replay, which is how often the rolling numbers change. */
export function tenths(valueAt) {
  const list = [];
  for (let i = 0; i <= Math.round((END - START) * 10); i++) list.push(valueAt(START + i / 10));
  return list;
}
/** The lap clock: what it reads as the replay opens, in milliseconds, and where it stops. */
export const LAP_CLOCK = {
  opening: Math.round((START < 0 ? previousLap(A).time + START : START) * 1000),
  stops: Math.round(FLAG * 1000),
};
