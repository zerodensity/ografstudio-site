/**
 * The Race telemetry example: the last lap of the 2020 Italian Grand Prix at Monza, redrawn from
 * public telemetry. Pierre Gasly holds off Carlos Sainz by 0.415 s.
 *
 * Nothing here is footage. `race-telemetry-snapshot.json` holds every car's position and instruments
 * about nine times a second (race-telemetry-snapshot.mjs says where it comes from), and three files
 * turn it into a graphic:
 *
 * - race-telemetry-story.mjs works out what happened: the gap, the running order, the captions.
 * - race-telemetry-art.mjs lays the graphic out and draws what never changes as pictures
 *   (race-telemetry-pictures.mjs saves them).
 * - This file places the layers and makes them move, in two ways:
 *
 *   Clips. Each moving layer has a one-shot clip as long as the replay, which starts when the graphic
 *   is on air and holds its last frame: the cars on the map, the rev rings, the pedals, the rolling
 *   numbers, the charts being drawn, the captions and the finish.
 *
 *   Alarms. Text that changes now and then (the tower, the sector times, the captions) is set by rules
 *   on a hidden timer, the race clock, which a rule starts at the same moment as the clips.
 *
 * There is no function in it. One ran ten times a second to write the numbers, and each run needs a
 * new worker: on a busy machine one failed to start now and then, and a function that fails once
 * stays failed, so the numbers froze while the cars drove on. Clips and rules run with the picture.
 *
 * The replay is clips and not a lifecycle step, because Stop has to wait for a running step to
 * finish. On clips the graphic can be taken off air or given new data at any moment. To see the lap
 * again, take it off air and play it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { drivers, carAt, keyFrames } from './race-telemetry-data.mjs';
import { A, B, CAPTION_SPANS, END, FLAG, LAP_CLOCK, MOVERS, ORDER_CHANGES, START, gapAt, instruments, script, tenths } from './race-telemetry-story.mjs';
import { CAPTION, COLOUR, COLUMN, DIGITS, GAP_CHART, GREEN, MARKER, PANEL, READOUT, RED, RESULT, SIDE, TEXT, TOWER, TRACE, WINNER, flagSvg, gapPlot, map, rowY } from './race-telemetry-art.mjs';

const here = new URL('.', import.meta.url);
const read = (file) => readFileSync(new URL(file, here), 'utf8');

const FPS = 50;
const CLIP = Math.round((END - START) * FPS);
/** The clip frame of a moment of the race. */
const F = (t) => Math.max(0, Math.min(CLIP, Math.round((t - START) * FPS)));
/** The lifecycle: on air after IN frames, off air OUT frames after Stop. */
const IN = 40;
const OUT = 25;

const UI = 'Inter, Arial, sans-serif';
const DISPLAY = 'Oswald, Arial Narrow, sans-serif';
const MONO = 'JetBrains Mono, Consolas, monospace';
/** The layers that hide part of another, and the ones they hide: the charts' covers and the rev rings' centres. */
const COVERS = ['Trace cover', 'Gap cover', 'Revs a centre', 'Revs b centre'];
const COVERED = ['Trace', 'Gap chart', 'Revs a', 'Revs b'];

// ---------------------------------------------------------------------------------------------
// Small builders for operations.

const add = (kind, name, box, element, opacity = 1) => ({
  type: 'add_layer',
  kind,
  name,
  transform: { x: box[0], y: box[1], width: box[2], height: box[3], opacity },
  element,
});
const rect = (name, box, fill, radius = 0, opacity = 1, stroke = {}) =>
  add('rectangle', name, box, { fill, borderRadius: radius, strokeColor: stroke.color ?? '#000000', strokeWidth: stroke.width ?? 0 }, opacity);
const ellipse = (name, box, fill, stroke = {}, opacity = 1) =>
  add('ellipse', name, box, { fill, strokeColor: stroke.color ?? '#000000', strokeWidth: stroke.width ?? 0 }, opacity);
const image = (name, box, src, opacity = 1) => add('image', name, box, { src, fit: 'fill' }, opacity);
const type = (content, style = {}) => ({
  content,
  fontFamily: style.font ?? UI,
  fontSize: style.size ?? 16,
  minFontSize: Math.max(1, Math.round((style.size ?? 16) * 0.6)),
  fontWeight: style.weight ?? 600,
  color: style.color ?? TEXT,
  textAlign: style.align ?? 'left',
  verticalAlign: style.valign ?? 'middle',
  // A fixed size: shrink-to-fit measures every text layer on every frame that something moves.
  autoFit: 'fixed',
  overflowPolicy: 'visible',
  letterSpacing: style.ls ?? 0,
  ...(style.line ? { lineHeight: style.line / (style.size ?? 16) } : {}),
  ...(style.upper ? { textTransform: 'uppercase' } : {}),
});
const text = (name, box, content, style = {}, opacity = 1) => add('text', name, box, type(content, style), opacity);
/** A count-up timer: text that the runtime writes itself, on every frame. */
const timer = (name, box, style, clock, opacity = 1) =>
  add('clock', name, box, { ...type('', style), clock: { mode: 'count-up', source: 'automatic', format: 'm:ss.SSS', endBehavior: 'stop', autoStart: false, pauseWhenOffAir: true, ...clock } }, opacity);
/** A window: an unseen box that clips the layers given to it, which is how one digit of a strip shows. */
const SEE_THROUGH = { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#000000', opacity: 0 }, { offset: 1, color: '#000000', opacity: 0 }] };
const windowBox = (name, box) => rect(name, box, SEE_THROUGH);
/** One of the pictures race-telemetry-pictures.mjs saved. */
const picture = (name) => {
  const file = new URL(`race-telemetry-pictures/${name}.webp`, here);
  if (!existsSync(file)) throw new Error(`No picture "${name}": run node examples-src/race-telemetry-pictures.mjs first.`);
  return `data:image/webp;base64,${readFileSync(file).toString('base64')}`;
};
// A percent sign first: left alone it starts a broken escape and the package can't be exported.
const svgData = (svg) => `data:image/svg+xml,${svg.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}`;

/** A lifecycle track: [frame, value, easing of the move that arrives here]. */
const track = (layerName, property, keys) => {
  const byFrame = new Map(keys.map(([frame, value, easing = 'cubic-out']) => [frame, { frame, value, easing }]));
  return { type: 'set_property_track', layerName, property, keys: [...byFrame.values()].sort((a, b) => a.frame - b.frame) };
};
/**
 * Fades a layer up as the graphic comes on air, `delay` frames in, and down again as it leaves.
 * A cover has to be solid whenever what it hides can be seen, or the hidden part shows through both
 * fades. So a 'cover' is up first and down last, and what lies 'under' one is up last and down first.
 */
const appear = (layerName, delay = 0, kind = 'plain') =>
  track(
    layerName,
    'opacity',
    {
      plain: [[0, 0], [delay, 0], [Math.min(IN, delay + 16), 1], [IN, 1], [IN + OUT, 0, 'cubic-in']],
      cover: [[0, 0], [8, 1], [IN, 1], [IN + 12, 1], [IN + OUT, 0, 'cubic-in']],
      under: [[0, 0], [Math.max(10, delay), 0], [Math.min(IN, Math.max(10, delay) + 16), 1], [IN, 1], [IN + 8, 0, 'cubic-in'], [IN + OUT, 0]],
    }[kind],
  );

/** The replay's clip on a layer, and the tracks inside it. Frames count from the moment the graphic is on air. */
const clip = (layerName) => ({
  type: 'set_layer_loop',
  layerName,
  name: 'Last lap',
  // On air, not on a custom action: a clip started by an action goes back to the layer's resting
  // pose when it ends, and this one has to hold the result.
  activation: { type: 'lifecycle' },
  durationFrames: CLIP,
  phaseOffsetFrames: 0,
  // Once, then it holds its last frame until the graphic is taken off air.
  repeatCount: 1,
});
const clipTrack = (layerName, property, keys) => {
  const byFrame = new Map(keys.map(([frame, value, easing = 'linear']) => [frame, { frame, value: Number(value.toFixed(4)), easing }]));
  return { type: 'set_loop_property_track', layerName, property, keys: [...byFrame.values()].sort((a, b) => a.frame - b.frame) };
};
/** Samples something on every frame of the replay and keeps only the keys that straight moves between them need. */
function sampled(valueAt, tolerance) {
  const points = [];
  for (let f = 0; f <= CLIP; f++) points.push(valueAt(START + f / FPS));
  return keyFrames(points, tolerance).map((f) => [f, points[f]]);
}
/** Keys for a switch: it holds, and changes over two frames each time it flips. */
function switched(valueAt) {
  const keys = [[0, valueAt(START)]];
  let last = valueAt(START);
  for (let f = 1; f <= CLIP; f++) {
    const now = valueAt(START + f / FPS);
    if (now !== last) keys.push([Math.max(0, f - 2), last], [f, now]);
    last = now;
  }
  keys.push([CLIP, last]);
  return keys;
}
/** Opacity keys for something that is up during each [from, to] span of the race. */
const shown = (spans) => {
  const keys = [[0, 0]];
  for (const [from, to] of spans) {
    if (to <= START) continue;
    keys.push([F(from), 0], [F(from) + 10, 1, 'cubic-out']);
    if (to < END) keys.push([F(to), 1], [F(to) + 14, 0, 'cubic-in']);
  }
  keys.push([CLIP, keys.at(-1)[1]]);
  return keys;
};

// ---------------------------------------------------------------------------------------------
// The rolling numbers.

/** Which cell of a digit strip shows a character: the blank first, then 0 to 9. */
const cellOf = (character) => (character === ' ' ? 0 : Number(character) + 1);
/**
 * One rolling number. `at` gives its text at a moment, always the same length; `places` says which
 * characters are digits (the rest, such as a decimal point, are in the backdrop). It makes a window and
 * a strip for each digit, and the keys that roll each strip to its next digit over two frames.
 */
function rolling(name, style, strip, { window, left }, at, places, every = 1) {
  // The runtime looks through every key of every track on each frame, so a number that needn't change
  // ten times a second changes less often: `every` is how many tenths it holds.
  const values = tenths(at).map((value, i, all) => all[i - (i % every)]);
  const y = (cell) => window[1] - cell * style.h;
  const layers = [windowBox(`${name} window`, window)];
  const clips = [];
  for (const place of places) {
    const layerName = `${name} digit ${place}`;
    const cells = values.map((value) => cellOf(value[place]));
    layers.push(image(layerName, [left + place * style.advance - (style.w - style.advance) / 2, y(cells[0]), style.w, style.h * 11], picture(strip)));
    // The numbers change every tenth of a second, which is five frames.
    const keys = [[0, y(cells[0])]];
    for (let i = 1; i < cells.length; i++) {
      if (cells[i] === cells[i - 1]) continue;
      const frame = Math.min(CLIP, Math.round((i / 10) * FPS));
      keys.push([frame - 2, y(cells[i - 1])], [frame, y(cells[i])]);
    }
    keys.push([CLIP, y(cells.at(-1))]);
    clips.push([layerName, keys]);
  }
  return { layers, clips, window: `${name} window`, digits: clips.map(([layerName]) => layerName) };
}

// ---------------------------------------------------------------------------------------------

const fontAsset = (name, family, weight, file, license) => ({
  type: 'add_asset',
  name,
  mimeType: 'font/woff2',
  fontFamily: family,
  fontWeight: weight,
  fontStyle: 'normal',
  packagePath: `assets/fonts/${file}.woff2`,
  licenseName: 'SIL Open Font License 1.1',
  licenseUrl: license,
  licenseText: read(`fonts/${file}-OFL.txt`),
  data: readFileSync(new URL(`fonts/${file}.woff2`, here)).toString('base64'),
});
const FONTS = [
  fontAsset('Inter', 'Inter', '100 900', 'inter', 'https://github.com/rsms/inter/blob/master/LICENSE.txt'),
  fontAsset('Oswald', 'Oswald', '200 700', 'oswald', 'https://github.com/google/fonts/blob/6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec/ofl/oswald/OFL.txt'),
  fontAsset('JetBrains Mono', 'JetBrains Mono', '100 800', 'jetbrains-mono', 'https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt'),
];

export async function raceTelemetry({ apply, scene, addField, bind }) {
  const { opening, events } = script();
  const INTERNAL = { exposeToOgraf: false };

  await apply(
    [
      { type: 'set_composition', frameRate: FPS, updateTransitionFrames: 0 },
      ...FONTS,
      addField('text', 'title', 'Title', 'The name of the race, at the top left.', 'Italian Grand Prix'),
      addField('boolean', 'captions', 'Captions', 'A box over the map that says what is happening: DRS, the sector times, the flag.', true),
      ...Object.entries(opening).map(([key, value]) => addField('text', key, key.replace(/_/g, ' '), 'Set by the race clock\'s alarm rules.', value, INTERNAL)),
      addField('integer', 'clock_from', 'Lap clock from', 'What the lap clock counts up from, in milliseconds. The alarm at the line sets it to zero.', LAP_CLOCK.opening, INTERNAL),
    ],
    'Fonts and fields',
  );
  {
    const { composition } = await scene();
    const step = composition.keyframes.find((keyframe) => keyframe.role === 'step');
    const order = composition.keyframes.map((keyframe) => keyframe.id);
    const transitions = [...composition.transitions].sort((x, y) => order.indexOf(x.fromKeyframeId) - order.indexOf(y.fromKeyframeId));
    if (transitions.length !== 2) throw new Error(`Expected an In and an Out, found ${transitions.length} transitions.`);
    await apply(
      [
        { type: 'rename_lifecycle_keyframe', keyframeId: step.id, name: 'On air' },
        ...transitions.map((transition, i) => ({ type: 'set_transition', transitionId: transition.id, durationFrames: [IN, OUT][i], easing: 'linear' })),
      ],
      'In and Out',
    );
  }

  /** Layers that fade up with the graphic, with the frame each starts on. Unseen layers belong to the replay, and a window is never seen. */
  const rising = [];
  const rise = (delay, ...operations) => {
    for (const operation of operations) {
      if (operation.transform.opacity === 0 || operation.name.endsWith(' window')) continue;
      const kind = COVERS.includes(operation.name) ? 'cover' : COVERED.includes(operation.name) ? 'under' : 'plain';
      rising.push([operation.name, delay, kind]);
    }
    return operations;
  };
  const at = (car, t) => map.place([carAt(car, t).x, carAt(car, t).y]);
  const markerBox = (car, t) => {
    const { w, h, cx, cy } = car === A || car === B ? MARKER.leader : MARKER.other;
    const [x, y] = at(car, t);
    return [x - cx, y - cy, w, h];
  };
  const firstOrder = ORDER_CHANGES[0][1];
  const [cx, cy, cw, ch] = TRACE.chart;

  // The rolling numbers: each leader's speed and gear, and the gap between them.
  const speedText = (car) => (t) => String(Math.round(instruments(car, t).speed)).padStart(3, ' ');
  const numbers = {
    'Speed a': rolling('Speed a', DIGITS.speed, 'digits-speed', READOUT.speed(COLUMN.a), speedText(A), [0, 1, 2]),
    'Gear a': rolling('Gear a', DIGITS.gear, 'digits-gear-a', READOUT.gear(COLUMN.a), (t) => String(instruments(A, t).gear), [0]),
    'Speed b': rolling('Speed b', DIGITS.speed, 'digits-speed', READOUT.speed(COLUMN.b), speedText(B), [0, 1, 2]),
    'Gear b': rolling('Gear b', DIGITS.gear, 'digits-gear-b', READOUT.gear(COLUMN.b), (t) => String(instruments(B, t).gear), [0]),
    // 0.415: the point is in the backdrop, and the digits either side of it roll.
    Gap: rolling('Gap', DIGITS.gap, 'digits-gap', READOUT.gap, (t) => gapAt(t).toFixed(3), [0, 2, 3, 4], 2),
  };

  // Bottom to top. The backdrop holds the panels, the circuit and every label that never changes.
  const ground = [
    ...rise(0, image('Backdrop', [0, 0, 1920, 1080], picture('backdrop'))),
    ...rise(
      4,
      text('Title', [40, 24, 1000, 60], 'Italian Grand Prix', { font: DISPLAY, size: 46, weight: 600, ls: 1, upper: true }),
      text('Lap', [1482, 46, 170, 54], opening.lap, { font: DISPLAY, size: 40, weight: 600 }),
      // The leader's lap time: it runs up to the line, the alarm there sends it back to zero, and it stops at the flag.
      timer('Lap clock', [1600, 44, 280, 58], { font: MONO, size: 42, weight: 800, align: 'right' }, { initialValueMs: LAP_CLOCK.opening, limitMs: LAP_CLOCK.stops }),
    ),
    // The tower: the rows of the cars that change place, and the gaps.
    ...rise(
      8,
      ...MOVERS.map((car) => image(`${car.code} row`, [TOWER.x + TOWER.chip[0], rowY(firstOrder.indexOf(car)), TOWER.chip[1], TOWER.rowH], picture(`row-${car.code.toLowerCase()}`))),
      text('Gaps', [TOWER.x + 150, rowY(0) - 3, TOWER.w - 168, TOWER.pitch * drivers.length], opening.tower, { font: MONO, size: 18, weight: 500, color: '#c9d4e8', align: 'right', line: TOWER.pitch, valign: 'top' }),
    ),
    // The speed trace, under a cover that slides off it as the lap goes by.
    ...rise(
      12,
      image('Trace', [cx, cy, cw, ch], picture('trace')),
      rect('Trace cover', [cx, cy - 2, cw + 4, ch + 4], PANEL),
      // The guides lie over the cover, so the chart has its lines and corner names before any of it is drawn.
      image('Trace guides', [cx, cy, cw, ch], picture('trace-guides')),
      rect('Trace head', [cx - 1, cy, 2, ch - 20], '#dfe7f7'),
    ),
  ];

  // The cars, the two leaders last so they stay on top.
  const others = drivers.filter((car) => car !== A && car !== B);
  const cars = rise(16, ...[...others].reverse().map((car) => image(`${car.code} car`, markerBox(car, START), picture(`car-${car.code.toLowerCase()}`))), ...[B, A].map((car) => image(`${car.code} car`, markerBox(car, START), picture(`car-${car.code.toLowerCase()}`))));

  // The two leaders' instruments.
  const column = (key, x) => [
    // The rev ring: a conic gradient whose coloured part ends at two stops the clip moves together.
    ellipse(`Revs ${key}`, [x + 10, 296, 176, 176], {
      type: 'conic',
      angle: 225,
      stops: [
        { offset: 0, color: COLOUR[key], opacity: 1 },
        { offset: 0.3, color: COLOUR[key], opacity: 1 },
        { offset: 0.3, color: '#1b2740', opacity: 1 },
        { offset: 0.75, color: '#1b2740', opacity: 1 },
        { offset: 0.75, color: '#000000', opacity: 0 },
        { offset: 1, color: '#000000', opacity: 0 },
      ],
    }),
    ellipse(`Revs ${key} centre`, [x + 24, 310, 148, 148], PANEL),
    ...numbers[`Speed ${key}`].layers,
    ...numbers[`Gear ${key}`].layers,
    rect(`Throttle ${key}`, [x + 74, 514, 122, 10], GREEN, 5),
    rect(`Brake ${key}`, [x + 74, 540, 122, 10], RED, 5, 0),
    // The DRS light, on: a green wash over the unlit one in the backdrop.
    rect(`DRS ${key} on`, [x + 138, 190, 58, 26], { type: 'linear', angle: 90, stops: [{ offset: 0, color: GREEN, opacity: 0.45 }, { offset: 1, color: GREEN, opacity: 0.45 }] }, 13, 0, { color: GREEN, width: 2 }),
  ];
  const duel = rise(
    20,
    ...column('a', COLUMN.a),
    ...column('b', COLUMN.b),
    text('Trend', [SIDE.x + SIDE.w - 220, 582, 200, 20], opening.trend, { size: 13, weight: 800, ls: 3, align: 'right' }),
    ...numbers.Gap.layers,
    image('Gap chart', GAP_CHART, picture('gap')),
    rect('Gap cover', [GAP_CHART[0], GAP_CHART[1] - 2, GAP_CHART[2] + 8, GAP_CHART[3] + 4], PANEL),
    image('Gap guides', GAP_CHART, picture('gap-guides')),
    ellipse('Gap dot', [GAP_CHART[0] - 5, GAP_CHART[1] + gapPlot.y(gapAt(0)) - 5, 10, 10], COLOUR.b, { color: PANEL, width: 2 }),
    text('Sectors a', [SIDE.x + 56, 814, 100, 90], opening.sectors_a, { font: MONO, size: 16, weight: 600, color: COLOUR.a, line: 29, valign: 'top', align: 'right' }),
    text('Sectors b', [SIDE.x + 168, 814, 100, 90], opening.sectors_b, { font: MONO, size: 16, weight: 600, color: COLOUR.b, line: 29, valign: 'top', align: 'right' }),
    text('Sectors gain', [SIDE.x + 276, 814, 144, 90], opening.sectors_gain, { font: MONO, size: 14, weight: 600, color: GREEN, line: 29, valign: 'top', align: 'right' }),
    text('Top a', [COLUMN.a, 944, 150, 50], opening.top_a, { font: MONO, size: 36, weight: 800, color: COLOUR.a }),
    text('Top b', [COLUMN.b, 944, 150, 50], opening.top_b, { font: MONO, size: 36, weight: 800, color: COLOUR.b }),
  );

  // What comes and goes, all unseen until the replay shows it: the captions, the flag, the winner and the result.
  const finish = [
    image('Flag', [-1920, 110, 1920, 12], svgData(flagSvg())),
    rect(
      'Caption plate',
      [CAPTION.x, CAPTION.y, CAPTION.w, CAPTION.h],
      {
        type: 'linear',
        angle: 180,
        stops: [
          { offset: 0, color: '#1a2947', opacity: 0.97 },
          { offset: 1, color: '#0d1628', opacity: 0.97 },
        ],
      },
      14,
      0,
      { color: '#2a3a5c', width: 1 },
    ),
    text('Caption', [CAPTION.x + 16, CAPTION.y + 8, CAPTION.w - 32, 58], opening.banner, { font: DISPLAY, size: 42, weight: 600, ls: 2, align: 'center' }, 0),
    text('Caption sub', [CAPTION.x + 16, CAPTION.y + 62, CAPTION.w - 32, 30], opening.banner_sub, { size: 16, weight: 500, color: '#c9d4e8', align: 'center' }, 0),
    image('Winner', [WINNER.x, WINNER.y, WINNER.w, WINNER.h], picture('winner'), 0),
    image('Result', [RESULT.x, RESULT.y, RESULT.w, RESULT.h], picture('result'), 0),
    // The race clock: never seen. It counts from the moment the graphic is on air, and its alarms set the text.
    // It shows whole minutes only, so that its own text changes twice in the replay and not on every frame.
    timer('Race clock', [0, 1040, 200, 30], { font: MONO, size: 14 }, { initialValueMs: 0, format: 'm' }, 0),
  ];

  await apply(ground, 'Backdrop, header, tower and speed trace');
  await apply(cars, 'Cars');
  await apply(duel, 'The duel');
  await apply(finish, 'Captions, flag, winner, result and the race clock');

  // Each strip of digits goes inside its window, which clips it.
  {
    const { composition } = await scene();
    const layerId = (name) => composition.layers.find((layer) => layer.name === name).id;
    await apply(
      Object.values(numbers).flatMap((number) => [
        { type: 'set_layer_layout', layerName: number.window, clipChildren: true },
        ...number.digits.map((layerName) => ({ type: 'set_layer_layout', layerName, parentId: layerId(number.window) })),
      ]),
      'Digits into their windows',
    );
  }

  // Fields onto layers.
  const content = (fieldKey) => ({ fieldKey, targetProperty: 'content' });
  // The Captions switch: a factor on the opacity the clip gives the caption.
  const switchedBy = { fieldKey: 'captions', targetProperty: 'layer.opacity', valueMap: { true: 1, false: 0 } };
  await apply(
    [
      bind('Title', [content('title')]),
      bind('Lap', [content('lap')]),
      bind('Lap clock', [{ fieldKey: 'clock_from', targetProperty: 'clock.initialValueMs' }]),
      bind('Gaps', [content('tower')]),
      ...['a', 'b'].flatMap((key) => [bind(`Sectors ${key}`, [content(`sectors_${key}`)]), bind(`Top ${key}`, [content(`top_${key}`)])]),
      bind('Sectors gain', [content('sectors_gain')]),
      bind('Trend', [content('trend'), { fieldKey: 'trend', targetProperty: 'color', valueMap: { CLOSING: COLOUR.b, OPENING: COLOUR.a, STEADY: '#93a4c0', FINAL: GREEN } }]),
      bind('Caption plate', [switchedBy]),
      bind('Caption', [content('banner'), switchedBy]),
      bind('Caption sub', [content('banner_sub'), switchedBy]),
    ],
    'Bindings',
  );

  // On air and off: everything that is there from the start fades up, the backdrop first.
  await apply(
    rising.map(([name, delay, kind]) => appear(name, delay, kind)),
    'Fades',
  );

  // The replay. Each entry below is one layer's clip and its tracks.
  const clips = [];
  const moving = (layerName, tracks) => clips.push([clip(layerName), ...Object.entries(tracks).map(([property, keys]) => clipTrack(layerName, property, keys))]);
  for (const car of drivers) {
    const leader = car === A || car === B;
    const { cx: mx, cy: my } = leader ? MARKER.leader : MARKER.other;
    const keys = sampled((t) => at(car, t), leader ? 0.4 : 0.6);
    moving(`${car.code} car`, { x: keys.map(([f, [x]]) => [f, x - mx]), y: keys.map(([f, [, y]]) => [f, y - my]) });
  }
  // Rows slide to their new place when the order changes.
  for (const car of MOVERS) {
    const keys = [[0, rowY(firstOrder.indexOf(car))]];
    for (const [when, order] of ORDER_CHANGES.slice(1)) {
      const y = rowY(order.indexOf(car));
      if (y !== keys.at(-1)[1]) keys.push([F(when), keys.at(-1)[1]], [F(when) + 18, y, 'cubic-in-out']);
    }
    moving(`${car.code} row`, { y: [...keys, [CLIP, keys.at(-1)[1]]] });
  }
  for (const [car, key] of [
    [A, 'a'],
    [B, 'b'],
  ]) {
    const revs = sampled((t) => [Math.min(0.75, (instruments(car, t).rpm / 12500) * 0.75)], 0.004).map(([f, [value]]) => [f, value]);
    moving(`Revs ${key}`, { 'fill.stops[1].offset': revs, 'fill.stops[2].offset': revs });
    moving(`Throttle ${key}`, { width: sampled((t) => [Math.max(0.5, (t >= car.finish ? 0 : instruments(car, t).throttle / 100) * 122)], 1.2).map(([f, [value]]) => [f, value]) });
    moving(`Brake ${key}`, { opacity: switched((t) => (t >= car.finish ? 0 : instruments(car, t).brake)) });
    const drs = switched((t) => (t >= car.finish ? 0 : instruments(car, t).drs));
    if (drs.some(([, value]) => value)) moving(`DRS ${key} on`, { opacity: drs });
  }
  for (const number of Object.values(numbers)) for (const [layerName, keys] of number.clips) moving(layerName, { y: keys });

  // The charts are drawn by sliding a cover off them. A line follows the trace's edge and a dot rides the gap.
  const lapSpan = B.finish;
  const drawn = (t) => Math.max(0, Math.min(1, t / lapSpan));
  const sweep = (x, w, extra) => ({
    x: [[0, x + drawn(START) * w], [F(0), x + drawn(Math.max(0, START)) * w], [F(lapSpan), x + w], [CLIP, x + w]],
    width: [[0, w * (1 - drawn(START)) + extra], [F(0), w * (1 - drawn(Math.max(0, START))) + extra], [F(lapSpan), 0.5], [CLIP, 0.5]],
  });
  moving('Trace cover', sweep(cx, cw, 4));
  moving('Trace head', { x: sweep(cx - 1, cw, 0).x });
  moving('Gap cover', sweep(GAP_CHART[0], GAP_CHART[2], 8));
  const dot = sampled((t) => [GAP_CHART[0] + gapPlot.x(t) - 5, GAP_CHART[1] + gapPlot.y(gapAt(Math.max(0, t))) - 5], 0.4);
  moving('Gap dot', { x: dot.map(([f, [x]]) => [f, x]), y: dot.map(([f, [, y]]) => [f, y]) });

  // Captions, then the finish: the flag, the winner once the second car is home, the result once six are.
  for (const name of ['Caption plate', 'Caption', 'Caption sub']) moving(name, { opacity: shown(CAPTION_SPANS) });
  moving('Flag', { x: [[0, -1920], [F(FLAG), -1920], [F(FLAG) + 30, 0, 'cubic-out'], [CLIP, 0]] });
  const sixth = drivers[5].finish;
  moving('Winner', { opacity: shown([[B.finish + 0.5, sixth + 0.2]]) });
  moving('Result', { opacity: shown([[sixth + 0.7, Infinity]]) });

  for (let i = 0; i < clips.length; i += 6) await apply(clips.slice(i, i + 6).flat(), `Clips ${i / 6 + 1}`);

  // The rules. The race clock starts with the clips, and its alarms set the text as the lap goes by.
  const { composition } = await scene();
  const layerId = (name) => composition.layers.find((layer) => layer.name === name).id;
  const fieldId = (key) => composition.dataFields.find((item) => item.key === key).id;
  const set = (key, value) => ({ type: 'set-data', fieldId: fieldId(key), mode: 'set', value });
  const clock = (name, verb) => ({ type: 'custom-action', actionId: `clock:${encodeURIComponent(layerId(name))}:${verb}` });
  const alarms = events.map(([when, changed], i) => ({
    id: `alarm-${String(i + 1).padStart(3, '0')}`,
    name: `${when.toFixed(1)} s: ${Object.keys(changed).join(', ').replace(/_/g, ' ')}`,
    enabled: true,
    trigger: 'timer-alarm',
    timerAlarm: { sourceLayerId: layerId('Race clock'), thresholdMs: Math.round((when - START) * 1000), direction: 'up' },
    actions: [
      ...Object.entries(changed).map(([key, value]) => set(key, value)),
      // At the line the lap clock starts again from zero.
      ...(when === 0 ? [set('clock_from', 0)] : []),
    ],
  }));
  if (START < 0 && !events.some(([when]) => when === 0)) throw new Error('Nothing changes at the line, so nothing would restart the lap clock there.');
  await apply(
    [
      {
        type: 'set_layer_visual_rules',
        layerName: 'Backdrop',
        rules: [
          // Play rules run when the graphic has arrived on air, which is also when the clips start.
          { id: 'start', name: 'Start the clocks on air', enabled: true, trigger: 'play', actions: [clock('Race clock', 'restart'), clock('Lap clock', 'restart')] },
          ...alarms,
          // Once it has left, everything goes back to the opening moment, ready to be played again.
          {
            id: 'reset',
            name: 'Back to the opening once off air',
            enabled: true,
            trigger: 'stop',
            delayFrames: OUT + 5,
            actions: [...Object.entries(opening).map(([key, value]) => set(key, value)), set('clock_from', LAP_CLOCK.opening), clock('Race clock', 'reset'), clock('Lap clock', 'reset')],
          },
        ],
      },
    ],
    'Rules',
  );
  const keys = clips.flat().reduce((sum, operation) => sum + (operation.keys?.length ?? 0), 0);
  console.log(`race-telemetry: ${composition.layers.length} layers, ${clips.length} clips, ${keys} clip keys, ${alarms.length} alarms, captions at ${CAPTION_SPANS.map(([from]) => from.toFixed(1)).join(', ')}`);
}
