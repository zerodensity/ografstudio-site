/**
 * Reads race-telemetry-snapshot.json and answers the questions the Race telemetry example asks of it:
 * where a car is at a moment, what its instruments read, and how far behind another car it is.
 *
 * Times are seconds from the moment the winner started the last lap. Positions are the timing feed's
 * tenths of a metre until `mapper()` turns them into canvas pixels.
 */
import { readFileSync } from 'node:fs';

export const snapshot = JSON.parse(readFileSync(new URL('race-telemetry-snapshot.json', import.meta.url), 'utf8'));
export const drivers = snapshot.drivers;
export const driver = (code) => {
  const found = drivers.find((item) => item.code === code);
  if (!found) throw new Error(`No driver ${code}.`);
  return found;
};

const outline = snapshot.circuit.outline;
/** Distance along the closed outline to each of its points, and once round. */
const along = [0];
for (let i = 1; i <= outline.length; i++) {
  const a = outline[i - 1];
  const b = outline[i % outline.length];
  along.push(along[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
}
export const LAP_LENGTH = along.at(-1) / 10; // metres

/** The point a fraction of the way round the lap, counted from the line. */
export function outlinePoint(fraction) {
  const wanted = (((fraction % 1) + 1) % 1) * along.at(-1);
  let low = 0;
  let high = outline.length;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (along[mid] <= wanted) low = mid;
    else high = mid;
  }
  const a = outline[low];
  const b = outline[(low + 1) % outline.length];
  const t = (wanted - along[low]) / (along[low + 1] - along[low] || 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** After the flag a car lifts: it sheds this much speed each second, down to a cruise. */
const COAST = { slowing: 7, cruise: 45 }; // m/s², m/s

/**
 * What a car is doing at a moment. Between samples the numbers are blended; after its flag the car
 * coasts on round the outline, and `flagged` says so.
 */
export function carAt(car, t) {
  const s = car.samples;
  const last = s.t.length - 1;
  if (t >= s.t[last]) {
    const elapsed = t - s.t[last];
    const speed = s.speed[last] / 3.6;
    const slowingFor = Math.min(elapsed, Math.max(0, (speed - COAST.cruise) / COAST.slowing));
    const travelled = speed * slowingFor - (COAST.slowing * slowingFor ** 2) / 2 + COAST.cruise * (elapsed - slowingFor);
    const lap = s.lap[last] + travelled / LAP_LENGTH;
    const [x, y] = outlinePoint(lap);
    return {
      x,
      y,
      lap,
      speed: (speed - COAST.slowing * slowingFor) * 3.6,
      gear: s.gear[last],
      throttle: 0,
      brake: 0,
      rpm: s.rpm[last] * 0.8,
      drs: 0,
      flagged: true,
    };
  }
  let low = 0;
  let high = last;
  if (t <= s.t[0]) high = 1;
  else
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (s.t[mid] <= t) low = mid;
      else high = mid;
    }
  const k = Math.max(0, Math.min(1, (t - s.t[low]) / (s.t[high] - s.t[low] || 1)));
  const mix = (channel) => channel[low] + (channel[high] - channel[low]) * k;
  return {
    x: mix(s.x),
    y: mix(s.y),
    lap: mix(s.lap),
    speed: mix(s.speed),
    // Gears, brake and DRS are switches: the nearer sample wins.
    gear: s.gear[k < 0.5 ? low : high],
    throttle: mix(s.throttle),
    brake: s.brake[k < 0.5 ? low : high],
    rpm: mix(s.rpm),
    drs: s.drs[k < 0.5 ? low : high],
    flagged: false,
  };
}

/** When a car reached a point of the race, given as a lap count such as 52.25. */
export function timeAtLap(car, lap) {
  const s = car.samples;
  if (lap <= s.lap[0]) return s.t[0];
  let low = 0;
  let high = s.t.length - 1;
  if (lap >= s.lap[high]) return null;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (s.lap[mid] <= lap) low = mid;
    else high = mid;
  }
  return s.t[low] + ((lap - s.lap[low]) / (s.lap[high] - s.lap[low] || 1)) * (s.t[high] - s.t[low]);
}

/** Seconds a car is behind another at a moment: how long ago the other passed where it is now. */
export function gapBehind(behind, ahead, t) {
  const here = carAt(behind, t);
  const passed = here.flagged ? null : timeAtLap(ahead, here.lap);
  // Past the flag there is nothing left to measure: the gap is the one at the line.
  return passed === null ? behind.finish - ahead.finish : t - passed;
}

/**
 * Turns track positions into canvas pixels: the outline is turned by `rotation` degrees (the way
 * circuit maps are usually drawn, unless another angle fits the space better) and fitted inside `box`
 * ([x, y, width, height]), keeping its shape.
 */
export function mapper(box, rotation = snapshot.circuit.rotation) {
  const angle = (rotation * Math.PI) / 180;
  const turn = ([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), -(x * Math.sin(angle) + y * Math.cos(angle))];
  const turned = outline.map(turn);
  const xs = turned.map((point) => point[0]);
  const ys = turned.map((point) => point[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(box[2] / (maxX - minX), box[3] / (maxY - minY));
  const left = box[0] + (box[2] - (maxX - minX) * scale) / 2;
  const top = box[1] + (box[3] - (maxY - minY) * scale) / 2;
  const place = (point) => {
    const [x, y] = turn(point);
    return [left + (x - minX) * scale, top + (y - minY) * scale];
  };
  return { place, scale, outline: outline.map(place) };
}

/**
 * Picks the keys a track needs. `points` holds a value list for every frame; the keys kept are the
 * frames from which straight moves between them stay within `tolerance` of every frame in between.
 */
export function keyFrames(points, tolerance) {
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop();
    let worst = 0;
    let worstAt = -1;
    for (let i = from + 1; i < to; i++) {
      const k = (i - from) / (to - from);
      let off = 0;
      for (let c = 0; c < points[i].length; c++) {
        off = Math.max(off, Math.abs(points[i][c] - (points[from][c] + (points[to][c] - points[from][c]) * k)));
      }
      if (off > worst) {
        worst = off;
        worstAt = i;
      }
    }
    if (worst > tolerance) {
      keep.add(worstAt);
      stack.push([from, worstAt], [worstAt, to]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}
