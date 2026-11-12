/**
 * The Race telemetry example's layout, and everything in it that never changes, as pages for
 * race-telemetry-pictures.mjs to draw once into pictures: the backdrop with the circuit and every
 * fixed label, the two charts, the car markers, the winner's card and the result.
 *
 * Pictures instead of layers for two reasons. The runtime works on every layer on every frame, moving
 * or not, so 60 layers play far more smoothly than 130. And a browser redraws a vector picture each
 * time something passes over it, where a drawn picture is only copied. Being pages, they can also use
 * the template's own fonts, which a vector picture inside a graphic can't.
 */
import { readFileSync } from 'node:fs';
import { snapshot, drivers, carAt, timeAtLap, mapper } from './race-telemetry-data.mjs';
import { A, B, DRS_B, MOVERS, OFFICIAL_GAPS, ORDER_CHANGES, gapAt, instruments, lastLap } from './race-telemetry-story.mjs';

export const INK = '#060a12';
export const PANEL = '#0b1220';
export const EDGE = '#1a2640';
export const TEXT = '#f3f6fc';
export const SOFT = '#93a4c0';
export const QUIET = '#5f7090';
export const GREEN = '#22d489';
export const RED = '#ff4050';
/** The two leaders' colours: their teams' own. */
export const COLOUR = { a: '#ffffff', b: '#ff8700' };
export const RACE_CREDIT = 'Unofficial data replay. Timing and telemetry: TracingInsights.com. Not affiliated with Formula 1, the FIA or any team.';

// Everything below is in canvas pixels, on 1920 x 1080.
export const TOWER = { x: 40, y: 128, w: 312, h: 884, rows: 184, pitch: 51, rowH: 45, chip: [54, 120] };
export const MAP = { x: 376, y: 128, w: 1040, h: 648 };
export const TRACE = { x: 376, y: 792, w: 1040, h: 220, chart: [396, 834, 1000, 162] };
export const SIDE = { x: 1440, y: 128, w: 440, h: 884 };
export const COLUMN = { a: 1456, b: 1668, w: 196 };
export const GAP_CHART = [1456, 704, 408, 60];
/** The clear corner of the map panel, above the last straight: captions, the winner and the result go here. */
export const CORNER = { x: MAP.x + 486, y: MAP.y + 62, w: 536 };
export const CAPTION = { x: CORNER.x, y: CORNER.y, w: CORNER.w, h: 104 };
export const WINNER = { x: CORNER.x, y: CORNER.y + 120, w: CORNER.w, h: 214 };
export const RESULT = { x: CORNER.x, y: CORNER.y, w: CORNER.w, h: 348, pitch: 47 };
/**
 * The rolling numbers. Each digit is a strip: a blank, then 0 to 9, one cell each, moved up and down so
 * that one cell shows through a window as tall as a cell. `advance` is how far apart digits sit, which
 * for JetBrains Mono is six tenths of the type size.
 */
export const DIGITS = {
  speed: { size: 52, w: 32, h: 66, advance: 31.2 },
  gear: { size: 28, w: 44, h: 44, advance: 44 },
  gap: { size: 84, w: 52, h: 100, advance: 50.4 },
};
/** Where each rolling number's window is, and its first digit. */
export const READOUT = {
  speed: (x) => ({ window: [x + 10, 338, 176, DIGITS.speed.h], left: x + 98 - 1.5 * DIGITS.speed.advance }),
  gear: (x) => ({ window: [x + 76, 444, 44, DIGITS.gear.h], left: x + 76 }),
  gap: { window: [SIDE.x + 12, 598, 5 * DIGITS.gap.advance + 4, DIGITS.gap.h], left: SIDE.x + 12 },
};
/** A car's marker: the picture's size and where in it the car itself sits. */
export const MARKER = { leader: { w: 150, h: 110, cx: 55, cy: 55 }, other: { w: 60, h: 40, cx: 10, cy: 20 } };
export const rowY = (place) => TOWER.rows + place * TOWER.pitch;

/** The circuit, turned to fill the map panel. */
export const map = mapper([MAP.x + 44, MAP.y + 70, MAP.w - 88, MAP.h - 104], 90);

const here = new URL('.', import.meta.url);
const font = (file) => readFileSync(new URL(`fonts/${file}.woff2`, here)).toString('base64');
const FACES = [
  ['Inter', '100 900', 'inter'],
  ['Oswald', '200 700', 'oswald'],
  ['JetBrains Mono', '100 800', 'jetbrains-mono'],
];
const STYLE = `
  ${FACES.map(([family, weight, file]) => `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${font(file)}) format('woff2'); }`).join('\n')}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: transparent; overflow: hidden; }
  .t { position: absolute; white-space: pre; font-family: Inter, Arial, sans-serif; color: ${TEXT}; }
  .label { font-size: 13px; font-weight: 600; letter-spacing: 3px; color: ${SOFT}; }
  .display { font-family: Oswald, 'Arial Narrow', sans-serif; }
  .mono { font-family: 'JetBrains Mono', Consolas, monospace; }
  .box { position: absolute; }
`;
/** A line of text in a box, centred on its height the way Studio centres a text layer. */
const words = (box, content, css = '', className = '') =>
  `<div class='t ${className}' style='left:${box[0]}px;top:${box[1]}px;width:${box[2]}px;height:${box[3]}px;line-height:${box[3]}px;${css}'>${content}</div>`;
const label = (box, content, css = '') => words(box, content, css, 'label');
const page = (width, height, body, background = 'transparent') =>
  `<!doctype html><html><head><meta charset='utf-8'><style>${STYLE} body { width:${width}px; height:${height}px; background:${background}; }</style></head><body>${body}</body></html>`;

/** Blue for slow through green and yellow to red for flat out. */
function speedColour(speed) {
  const stops = [
    [60, [61, 125, 255]],
    [150, [37, 201, 192]],
    [230, [155, 229, 100]],
    [300, [255, 210, 62]],
    [350, [255, 90, 60]],
  ];
  const v = Math.max(60, Math.min(350, speed));
  const i = Math.max(1, stops.findIndex(([at]) => at >= v));
  const [from, to] = [stops[i - 1], stops[i]];
  const k = (v - from[0]) / (to[0] - from[0]);
  return `rgb(${from[1].map((c, j) => Math.round(c + (to[1][j] - c) * k)).join(',')})`;
}

/** The outline with its normals, for drawing things beside the track. */
function trackGeometry() {
  const points = map.outline;
  const area = points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + (x * ny - nx * y);
  }, 0);
  // On screen y runs down, so a positive area is a clockwise lap.
  const outward = area > 0 ? 1 : -1;
  const normal = (i) => {
    const [ax, ay] = points[(i - 2 + points.length) % points.length];
    const [bx, by] = points[(i + 2) % points.length];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    return [((by - ay) / length) * outward, (-(bx - ax) / length) * outward];
  };
  const lengths = [0];
  for (let i = 1; i <= points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i % points.length];
    lengths.push(lengths[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  /** The index of the outline point a fraction of the way round. */
  const indexAt = (fraction) => {
    const wanted = (((fraction % 1) + 1) % 1) * lengths.at(-1);
    return Math.max(0, lengths.findIndex((value) => value >= wanted) - 1) % points.length;
  };
  return { points, normal, indexAt, fractionOf: (i) => lengths[i] / lengths.at(-1) };
}

/** The circuit: its line coloured by the leader's speed, the timing lines, the DRS zones and the corner names. */
function trackSvg() {
  const { points, normal, indexAt, fractionOf } = trackGeometry();
  const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const speedAt = (fraction) => carAt(A, timeAtLap(A, snapshot.laps + Math.min(0.9999, Math.max(0.0001, fraction))) ?? 0).speed;
  const heat = [];
  for (let i = 0; i < points.length; i += 2) {
    const [mid, next] = [points[(i + 1) % points.length], points[(i + 2) % points.length]];
    heat.push(`<path d='M${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)}L${mid[0].toFixed(1)} ${mid[1].toFixed(1)}L${next[0].toFixed(1)} ${next[1].toFixed(1)}' stroke='${speedColour(speedAt(fractionOf(i + 1)))}'/>`);
  }
  const beside = (i, distance) => [points[i][0] + normal(i)[0] * distance, points[i][1] + normal(i)[1] * distance];
  const across = (i, half, attrs) => {
    const [ax, ay] = beside(i, -half);
    const [bx, by] = beside(i, half);
    return `<path d='M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}' ${attrs}/>`;
  };
  const say = (x, y, text, { fill = SOFT, size = 12, anchor = 'middle', weight = 600 } = {}) =>
    `<text x='${x.toFixed(1)}' y='${(y + size * 0.36).toFixed(1)}' font-family='Inter, Arial, sans-serif' font-size='${size}' font-weight='${weight}' letter-spacing='2' fill='${fill}' text-anchor='${anchor}'>${text}</text>`;
  /** A name beside the track at an outline point: outside it when there is room in the panel, inside when not. */
  const named = (i, text, options = {}) => {
    const width = text.length * (options.size ?? 12) * 0.78 + 8;
    const fits = ([x, y], anchor) => {
      const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
      // Not under the corner where the captions and the result come up.
      const underCorner = left + width > CORNER.x - 12 && y < CORNER.y + RESULT.h + 16;
      return !underCorner && left > MAP.x + 14 && left + width < MAP.x + MAP.w - 14 && y > MAP.y + 56 && y < MAP.y + MAP.h - 50;
    };
    for (const distance of [34, -34]) {
      const [nx] = normal(i);
      const side = nx * Math.sign(distance);
      const anchor = side > 0.45 ? 'start' : side < -0.45 ? 'end' : 'middle';
      const at = beside(i, distance);
      if (fits(at, anchor)) return say(at[0], at[1], text, { ...options, anchor });
    }
    return '';
  };
  const marks = [];
  // The timing lines, where the leader crossed them, each named for the sector it starts.
  const sectorStarts = [0, carAt(A, lastLap(A).s1End).lap - snapshot.laps, carAt(A, lastLap(A).s2End).lap - snapshot.laps];
  sectorStarts.forEach((fraction, n) => {
    if (n) marks.push(across(indexAt(fraction), 17, `stroke='#c7d3ea' stroke-width='2'`));
    marks.push(named(indexAt(fraction + 0.012), `S${n + 1}`, { fill: QUIET, size: 11 }));
  });
  // The line: a short chequered bar across the track.
  const line = indexAt(0);
  for (let k = -3; k < 3; k++) {
    const [ax, ay] = beside(line, k * 5.5);
    const [bx, by] = beside(line, (k + 1) * 5.5);
    marks.push(`<path d='M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}' stroke='${k % 2 ? '#ffffff' : '#0b1220'}' stroke-width='7'/>`);
  }
  const [fx, fy] = beside(line, 40);
  marks.push(say(fx, fy, 'START / FINISH', { fill: TEXT }));
  // DRS zones: a dotted green line outside the track where the chasing car had its wing open.
  for (const [from, to] of DRS_B) {
    const [i0, i1] = [indexAt(carAt(B, from).lap), indexAt(carAt(B, to).lap)];
    const run = [];
    for (let i = i0; i !== i1; i = (i + 1) % points.length) run.push(beside(i, 21).map((v) => v.toFixed(1)).join(','));
    marks.push(`<polyline points='${run.join(' ')}' fill='none' stroke='${GREEN}' stroke-width='3' stroke-linecap='round' stroke-dasharray='2 7'/>`);
    const middle = (i0 + Math.floor(((i1 - i0 + points.length) % points.length) / 2)) % points.length;
    const [x, y] = beside(middle, 40);
    marks.push(say(x, y, 'DRS', { fill: GREEN, weight: 700 }));
  }
  // Corner names, at each corner's own marker.
  const names = { 1: 'RETTIFILO', 3: 'CURVA GRANDE', 4: 'ROGGIA', 6: 'LESMO', 8: 'ASCARI', 11: 'PARABOLICA' };
  for (const corner of snapshot.circuit.corners) {
    if (!names[corner.label]) continue;
    const [cx, cy] = map.place([corner.x, corner.y]);
    let nearest = 0;
    points.forEach(([x, y], i) => {
      if (Math.hypot(x - cx, y - cy) < Math.hypot(points[nearest][0] - cx, points[nearest][1] - cy)) nearest = i;
    });
    marks.push(named(nearest, names[corner.label]));
  }
  return (
    `<svg class='box' style='left:0;top:0' width='1920' height='1080' viewBox='0 0 1920 1080' xmlns='http://www.w3.org/2000/svg'>` +
    `<defs><filter id='soft' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='12'/></filter>` +
    `<linearGradient id='heat'><stop offset='0' stop-color='${speedColour(60)}'/><stop offset='0.31' stop-color='${speedColour(150)}'/><stop offset='0.59' stop-color='${speedColour(230)}'/><stop offset='0.83' stop-color='${speedColour(300)}'/><stop offset='1' stop-color='${speedColour(350)}'/></linearGradient></defs>` +
    `<polygon points='${path}' fill='none' stroke='#2f6bff' stroke-opacity='0.2' stroke-width='40' stroke-linejoin='round' filter='url(#soft)'/>` +
    `<polygon points='${path}' fill='none' stroke='#2b3b5c' stroke-width='27' stroke-linejoin='round'/>` +
    `<polygon points='${path}' fill='none' stroke='#141d30' stroke-width='24' stroke-linejoin='round'/>` +
    `<g fill='none' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'>${heat.join('')}</g>` +
    marks.join('') +
    // What the colours mean.
    `<rect x='${MAP.x + 22}' y='${MAP.y + MAP.h - 28}' width='150' height='6' rx='3' fill='url(#heat)'/>` +
    say(MAP.x + 184, MAP.y + MAP.h - 25, `LEADER'S SPEED, SLOW TO FLAT OUT`, { fill: QUIET, size: 11, anchor: 'start' }) +
    `</svg>`
  );
}

/** One tower row's bar and code. */
const chip = (car, x = 0, y = 0) =>
  `<div class='box' style='left:${x}px;top:${y + 9}px;width:6px;height:27px;border-radius:2px;background:${car.colour}'></div>` +
  words([x + 18, y, 100, TOWER.rowH], car.code, 'font-size:25px;font-weight:500;letter-spacing:1px', 'display');

/** The backdrop: the ground, the panels, the circuit and every label that never changes. */
function backdrop() {
  const panel = (box) => `<div class='box' style='left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;border-radius:14px;background:${PANEL};border:1px solid ${EDGE}'></div>`;
  const rule = (x, y, w) => `<div class='box' style='left:${x}px;top:${y}px;width:${w}px;height:1px;background:${EDGE}'></div>`;
  const parts = [panel(TOWER), panel(MAP), panel(TRACE), panel(SIDE)];
  // A faint grid behind the map.
  parts.push(
    `<div class='box' style='left:${MAP.x + 14}px;top:${MAP.y + 48}px;width:${MAP.w - 28}px;height:${MAP.h - 62}px;` +
      `background-image:linear-gradient(#0f1829 1px, transparent 1px),linear-gradient(90deg, #0f1829 1px, transparent 1px);background-size:52px 52px'></div>`,
  );

  // Header.
  parts.push(
    words([42, 82, 1100, 24], 'MONZA · 6 SEPTEMBER 2020 · THE LAST LAP, REPLAYED FROM PUBLIC TELEMETRY', `font-size:15px;font-weight:500;letter-spacing:1.5px;color:${SOFT}`),
    label([1484, 28, 120, 18], 'LAP'),
    label([1640, 28, 240, 18], `LEADER'S LAP`, 'text-align:right'),
  );

  // Timing tower: places, and the bar and code of every car that keeps its place.
  const order = ORDER_CHANGES[0][1];
  parts.push(label([TOWER.x + 20, TOWER.y + 15, 140, 20], 'TIMING'), label([TOWER.x + TOWER.w - 160, TOWER.y + 15, 140, 20], 'GAP', 'text-align:right'), rule(TOWER.x + 16, TOWER.y + 48, TOWER.w - 32));
  order.forEach((car, i) => {
    parts.push(
      `<div class='box' style='left:${TOWER.x + 8}px;top:${rowY(i)}px;width:${TOWER.w - 16}px;height:${TOWER.rowH}px;border-radius:6px;background:${i % 2 ? '#0e1728' : '#101b2f'}'></div>`,
      words([TOWER.x + 6, rowY(i), 38, TOWER.rowH], String(i + 1), `font-size:18px;font-weight:600;color:${QUIET};text-align:right`, 'mono'),
    );
    if (!MOVERS.includes(car)) parts.push(chip(car, TOWER.x + TOWER.chip[0], rowY(i)));
  });

  // Map.
  parts.push(label([MAP.x + 20, MAP.y + 15, 300, 20], 'TRACK MAP'), label([MAP.x + MAP.w - 520, MAP.y + 15, 500, 20], 'MONZA · 5.793 KM · AIR 28 °C · TRACK 36 °C', 'text-align:right'), trackSvg());

  // Speed trace.
  parts.push(
    label([TRACE.x + 20, TRACE.y + 13, 300, 20], 'SPEED · LAST LAP'),
    label([TRACE.x + TRACE.w - 320, TRACE.y + 13, 300, 20], `<span style='color:${COLOUR.a}'>● ${A.code}</span>   <span style='color:${COLOUR.b}'>● ${B.code}</span>`, 'text-align:right;font-weight:700;letter-spacing:2px'),
  );

  // The two leaders.
  parts.push(label([SIDE.x + 20, SIDE.y + 15, 400, 20], 'THE FIGHT FOR THE WIN'));
  for (const [car, key] of [
    [A, 'a'],
    [B, 'b'],
  ]) {
    const x = COLUMN[key];
    const tyres = `${lastLap(car).compound[0]}${lastLap(car).compound.slice(1).toLowerCase()}s, ${lastLap(car).tyreLaps} laps old`;
    parts.push(
      words([x, 170, 136, 66], car.code, `font-size:54px;font-weight:600;letter-spacing:1px;color:${COLOUR[key]}`, 'display'),
      // The DRS light, off.
      `<div class='box' style='left:${x + 138}px;top:190px;width:58px;height:26px;border-radius:13px;border:1px solid #2a3a58'></div>`,
      words([x + 138, 190, 58, 26], 'DRS', 'font-size:12px;font-weight:800;letter-spacing:2px;text-align:center;color:#dfe7f7'),
      words([x, 240, COLUMN.w, 20], `${car.first} ${car.last}`, 'font-size:14px;font-weight:700'),
      words([x, 261, COLUMN.w, 20], `${car.team} · ${tyres}`, `font-size:12.5px;font-weight:500;color:${SOFT}`),
      label([x + 10, 402, 176, 20], 'KM/H', 'letter-spacing:2px;text-align:center'),
      // The gear's box, in the gap at the foot of the rev ring.
      `<div class='box' style='left:${x + 76}px;top:444px;width:44px;height:44px;border-radius:9px;background:#101a2d;border:1px solid #24324f'></div>`,
      label([x, 509, 72, 20], 'THROTTLE', `font-size:10px;letter-spacing:1.5px;color:${QUIET}`),
      label([x, 535, 72, 20], 'BRAKE', `font-size:10px;letter-spacing:1.5px;color:${QUIET}`),
      `<div class='box' style='left:${x + 74}px;top:514px;width:122px;height:10px;border-radius:5px;background:#17223a'></div>`,
      `<div class='box' style='left:${x + 74}px;top:540px;width:122px;height:10px;border-radius:5px;background:#17223a'></div>`,
    );
  }
  parts.push(
    rule(SIDE.x + 16, 566, SIDE.w - 32),
    label([SIDE.x + 20, 582, 200, 20], 'GAP'),
    // The gap's decimal point never moves, so it is here and only the digits round it roll.
    words([READOUT.gap.left + DIGITS.gap.advance, READOUT.gap.window[1], DIGITS.gap.advance, DIGITS.gap.h], '.', `font-size:${DIGITS.gap.size}px;font-weight:800;text-align:center`, 'mono'),
    words([SIDE.x + 356, 650, 64, 30], 'sec', `font-size:19px;font-weight:600;color:${SOFT}`),
    rule(SIDE.x + 16, 776, SIDE.w - 32),
    label([SIDE.x + 20, 788, 300, 20], `SECTORS · LAP ${snapshot.laps}`),
    ...['S1', 'S2', 'S3'].map((name, i) => words([SIDE.x + 20, 814 + i * 29, 40, 29], name, `font-size:16px;font-weight:600;color:${QUIET}`, 'mono')),
    rule(SIDE.x + 16, 908, SIDE.w - 32),
    label([SIDE.x + 20, 920, 300, 20], 'TOP SPEED'),
  );

  // Footer.
  parts.push(
    words([40, 1028, 1400, 24], RACE_CREDIT, `font-size:13px;font-weight:500;color:${QUIET}`),
    words([1480, 1028, 400, 24], 'MADE WITH OGRAF STUDIO', `font-size:13px;font-weight:600;letter-spacing:2px;color:${QUIET};text-align:right`),
  );
  return page(1920, 1080, parts.join(''), `linear-gradient(160deg, #0a1120 0%, ${INK} 55%, #04070d 100%)`);
}

/** Where the speed trace puts a moment and a speed, inside its own box. Both charts run from the start of the last lap to the second car's flag. */
export const tracePlot = (() => {
  const [, , w, h] = TRACE.chart;
  return { x: (t) => (Math.max(0, Math.min(B.finish, t)) / B.finish) * w, y: (speed) => h - 22 - ((speed - 40) / (360 - 40)) * (h - 30) };
})();
/**
 * The trace's guides: a line every 100 km/h and the corners' names. They are a picture of their own,
 * laid over the cover that hides the trace, so they show from the start.
 */
function traceGuides() {
  const [, , w, h] = TRACE.chart;
  const grid = [100, 200, 300].map((speed) => `<path d='M0 ${tracePlot.y(speed).toFixed(1)}H${w}' stroke='#17223a' stroke-dasharray='3 6'/>`);
  // The slowest moments are the corners: name them along the foot of the chart.
  const corners = [
    [13, 'RETTIFILO'],
    [32, 'ROGGIA'],
    [43, 'LESMO'],
    [62, 'ASCARI'],
    [77, 'PARABOLICA'],
  ].map(([near, name]) => {
    let slowest = near;
    for (let t = near - 5; t <= near + 5; t += 0.1) if (carAt(A, t).speed < carAt(A, slowest).speed) slowest = t;
    return `<text x='${tracePlot.x(slowest).toFixed(1)}' y='${h - 3}' font-family='Inter, Arial, sans-serif' font-size='11' font-weight='600' letter-spacing='2' fill='${QUIET}' text-anchor='middle'>${name}</text>`;
  });
  return page(w, h, `<svg width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' xmlns='http://www.w3.org/2000/svg'>${grid.join('')}${corners.join('')}</svg>`);
}
/** Both leaders' speed against time over the last lap. */
function trace() {
  const [, , w, h] = TRACE.chart;
  const line = (car) => {
    const run = [];
    for (let t = 0; t <= Math.min(B.finish, car.finish); t += 0.1) run.push(`${tracePlot.x(t).toFixed(1)},${tracePlot.y(instruments(car, t).speed).toFixed(1)}`);
    return run.join(' ');
  };
  return page(
    w,
    h,
    `<svg width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' xmlns='http://www.w3.org/2000/svg'>` +
      `<polyline points='${line(B)}' fill='none' stroke='${COLOUR.b}' stroke-width='2.5' stroke-linejoin='round'/>` +
      `<polyline points='${line(A)}' fill='none' stroke='${COLOUR.a}' stroke-width='2.5' stroke-linejoin='round'/></svg>`,
  );
}

/** Where the gap chart puts a moment and a gap, inside its own box. */
export const gapPlot = (() => {
  const [, , w, h] = GAP_CHART;
  return { x: (t) => (Math.max(0, Math.min(B.finish, t)) / B.finish) * w, y: (gap) => h - 6 - ((Math.max(0.2, Math.min(1.2, gap)) - 0.2) / 1.0) * (h - 12) };
})();
/** The gap chart's guides, over its cover like the trace's: a line at half a second and at one. */
function gapGuides() {
  const [, , w, h] = GAP_CHART;
  return page(
    w,
    h,
    `<svg class='box' style='left:0;top:0' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' xmlns='http://www.w3.org/2000/svg'>` +
      `<path d='M0 ${gapPlot.y(1).toFixed(1)}H${w}M0 ${gapPlot.y(0.5).toFixed(1)}H${w}' stroke='#1c2942' stroke-dasharray='3 6'/></svg>`,
  );
}
/** The gap over the last lap, with a ring at each timing line. */
function gap() {
  const [, , w, h] = GAP_CHART;
  const run = [];
  for (let t = 0; t <= B.finish; t += 0.2) run.push(`${gapPlot.x(t).toFixed(1)},${gapPlot.y(gapAt(t)).toFixed(1)}`);
  const rings = OFFICIAL_GAPS.slice(2).map(([at, value]) => `<circle cx='${gapPlot.x(at).toFixed(1)}' cy='${gapPlot.y(value).toFixed(1)}' r='3.5' fill='${PANEL}' stroke='${COLOUR.b}' stroke-width='2'/>`);
  return page(
    w,
    h,
    `<svg width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' xmlns='http://www.w3.org/2000/svg'>` +
      `<defs><linearGradient id='under' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${COLOUR.b}' stop-opacity='0.35'/><stop offset='1' stop-color='${COLOUR.b}' stop-opacity='0'/></linearGradient></defs>` +
      `<polygon points='0,${h} ${run.join(' ')} ${w},${h}' fill='url(#under)'/>` +
      `<polyline points='${run.join(' ')}' fill='none' stroke='${COLOUR.b}' stroke-width='2.5' stroke-linejoin='round'/>${rings.join('')}</svg>`,
  );
}

const card = (w, h, body) =>
  page(w, h, `<div class='box' style='left:0;top:0;width:${w}px;height:${h}px;border-radius:14px;background:linear-gradient(180deg, rgba(26,41,71,0.97), rgba(13,22,40,0.97));border:1px solid #2a3a5c'></div>${body}`);

/** The winner's card. */
function winner() {
  const { w, h } = WINNER;
  return card(
    w,
    h,
    label([0, 16, w, 22], 'WINNER', 'text-align:center;letter-spacing:8px') +
      words([0, 40, w, 96], `${A.first} ${A.last}`.toUpperCase(), 'font-size:70px;font-weight:600;letter-spacing:2px;text-align:center', 'display') +
      words([0, 142, w, 30], `${A.team} · started ${A.official.grid}th`, 'font-size:19px;font-weight:500;text-align:center;color:#c9d4e8') +
      words([0, 170, w, 30], `wins by ${B.official.behind.toFixed(3)} s`, `font-size:19px;font-weight:700;text-align:center;color:${GREEN}`),
  );
}

/** The first six, with the official times. */
function result() {
  const { w, h, pitch } = RESULT;
  const rows = drivers.slice(0, 6).map((car, i) => {
    const y = 62 + i * pitch;
    return (
      (i ? `<div class='box' style='left:22px;top:${y}px;width:${w - 44}px;height:1px;background:#22314f'></div>` : '') +
      words([20, y, 34, pitch], String(i + 1), `font-size:20px;font-weight:700;color:${QUIET};text-align:right`, 'mono') +
      `<div class='box' style='left:68px;top:${y + 12}px;width:5px;height:${pitch - 24}px;border-radius:2px;background:${car.colour}'></div>` +
      words([86, y, 240, pitch], car.last.toUpperCase(), 'font-size:27px;font-weight:500;letter-spacing:1px', 'display') +
      words([w - 244, y, 220, pitch], car.official.time, 'font-size:19px;font-weight:600;color:#c9d4e8;text-align:right', 'mono')
    );
  });
  return card(w, h, words([24, 12, w - 48, 44], `RESULT · ${snapshot.laps} LAPS`, 'font-size:27px;font-weight:600;letter-spacing:2px', 'display') + rows.join(''));
}

/** A car's marker on the map: its dot with its code beside it, and a glow for the two leaders. */
function marker(car) {
  const leader = car === A || car === B;
  const { w, h, cx, cy } = leader ? MARKER.leader : MARKER.other;
  if (leader) {
    const colour = car === A ? COLOUR.a : COLOUR.b;
    return page(
      w,
      h,
      `<div class='box' style='left:${cx - 36}px;top:${cy - 36}px;width:72px;height:72px;border-radius:50%;background:radial-gradient(closest-side, ${colour}8c 0%, ${colour}2e 35%, ${colour}00 100%)'></div>` +
        `<div class='box' style='left:${cx - 9}px;top:${cy - 9}px;width:18px;height:18px;border-radius:50%;background:${colour};border:3px solid ${INK}'></div>` +
        words([cx + 13, car === A ? cy - 31 : cy + 7, 70, 24], car.code, `font-size:19px;font-weight:600;letter-spacing:1px;color:${colour};text-shadow:0 0 6px ${INK}, 0 0 2px ${INK}`, 'display'),
    );
  }
  // Odd places carry the code above the dot and even ones below, so cars running together stay readable.
  return page(
    w,
    h,
    `<div class='box' style='left:${cx - 6}px;top:${cy - 6}px;width:12px;height:12px;border-radius:50%;background:${car.colour};border:2px solid ${INK}'></div>` +
      words([cx + 9, car.position % 2 ? cy - 19 : cy + 4, 40, 15], car.code, `font-size:11px;font-weight:700;color:#b6c3da;text-shadow:0 0 4px ${INK}, 0 0 2px ${INK}`, 'mono'),
  );
}

/** A strip of digits for a rolling number: a blank cell, then 0 to 9. */
function digits({ size, w, h }, colour) {
  const cells = ['', ...'0123456789'].map((digit, i) => words([0, i * h, w, h], digit, `font-size:${size}px;font-weight:800;text-align:center;color:${colour}`, 'mono'));
  return page(w, h * 11, cells.join(''));
}

/** A strip of chequers, for the flag. It stays a vector: it is tiny and nothing passes over it. */
export const flagSvg = () =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1920 12'><defs><pattern id='c' width='12' height='12' patternUnits='userSpaceOnUse'>` +
  `<rect width='12' height='12' fill='#0b1220'/><rect width='6' height='6' fill='#ffffff'/><rect x='6' y='6' width='6' height='6' fill='#ffffff'/></pattern></defs>` +
  `<rect width='1920' height='12' fill='url(#c)'/></svg>`;

/**
 * Every picture to draw: its file name, its size in canvas pixels, how many picture pixels to draw
 * for each of those, and the page that draws it.
 */
export function pictures() {
  return [
    { name: 'backdrop', width: 1920, height: 1080, scale: 1.5, html: backdrop(), opaque: true },
    { name: 'trace', width: TRACE.chart[2], height: TRACE.chart[3], scale: 2, html: trace() },
    { name: 'trace-guides', width: TRACE.chart[2], height: TRACE.chart[3], scale: 2, html: traceGuides() },
    { name: 'gap', width: GAP_CHART[2], height: GAP_CHART[3], scale: 2, html: gap() },
    { name: 'gap-guides', width: GAP_CHART[2], height: GAP_CHART[3], scale: 2, html: gapGuides() },
    { name: 'digits-speed', width: DIGITS.speed.w, height: DIGITS.speed.h * 11, scale: 2, html: digits(DIGITS.speed, TEXT) },
    { name: 'digits-gear-a', width: DIGITS.gear.w, height: DIGITS.gear.h * 11, scale: 2, html: digits(DIGITS.gear, COLOUR.a) },
    { name: 'digits-gear-b', width: DIGITS.gear.w, height: DIGITS.gear.h * 11, scale: 2, html: digits(DIGITS.gear, COLOUR.b) },
    { name: 'digits-gap', width: DIGITS.gap.w, height: DIGITS.gap.h * 11, scale: 2, html: digits(DIGITS.gap, TEXT) },
    { name: 'winner', width: WINNER.w, height: WINNER.h, scale: 2, html: winner() },
    { name: 'result', width: RESULT.w, height: RESULT.h, scale: 2, html: result() },
    ...drivers.map((car) => {
      const { w, h } = car === A || car === B ? MARKER.leader : MARKER.other;
      return { name: `car-${car.code.toLowerCase()}`, width: w, height: h, scale: 2, html: marker(car) };
    }),
    ...MOVERS.map((car) => ({ name: `row-${car.code.toLowerCase()}`, width: TOWER.chip[1], height: TOWER.rowH, scale: 2, html: page(TOWER.chip[1], TOWER.rowH, chip(car)) })),
  ];
}
