// Builds "Dino Run": a 15 second runner cartoon. An orange dinosaur runs, jumps and ducks, eats an old blue one
// and grows, then runs into a wall. The camera pulls back: the wall is the first letter of a huge "OGraf".
//   node build.mjs
import { call, apply, fresh, scene, settled, add } from './studio.mjs';
import * as art from './art.mjs';
import { SOUNDS, wav } from './sound.mjs';

const REQUEST =
  'A 15 second animation without interaction in the spirit of an endless runner: an orange dinosaur runs to the right, dodging and jumping obstacles, eats another dinosaur to get bigger, and in the end hits a wall. The wall is a huge "OGraf" text, seen when the camera zooms out. Then the animation stops.';

// ---------------------------------------------------------------- numbers
const W = 1920;
const H = 1080;
const FPS = 50;
const END = 15 * FPS; // the on-air step: everything has stopped
const OUT = 15;
const LAST = END + OUT;
const GY = 864; // the ground line
const A = 8; // one art pixel on screen, at the small dinosaur's size

// How far the world has scrolled at each frame. Straight lines between these points.
const V1 = 14;
const V2 = 22;
const RUN1 = 25;
const EAT = 250;
const RUN2 = 350;
const HIT = 560;
const SCROLL = [
  [0, 0],
  [RUN1, 0],
  [EAT, (EAT - RUN1) * V1],
  [RUN2, (EAT - RUN1) * V1],
  [HIT, (EAT - RUN1) * V1 + (HIT - RUN2) * V2],
  [LAST, (EAT - RUN1) * V1 + (HIT - RUN2) * V2],
];
const scroll = (frame) => {
  for (let i = 1; i < SCROLL.length; i++) {
    const [f0, s0] = SCROLL[i - 1];
    const [f1, s1] = SCROLL[i];
    if (frame <= f1) return s0 + ((s1 - s0) * (frame - f0)) / (f1 - f0);
  }
  return SCROLL.at(-1)[1];
};
const BREAKS = SCROLL.map(([frame]) => frame);

// The camera pull-back at the end: the point P0 of the close view goes to P1, and sizes shrink by ZOOM.
const Z0 = 622;
const Z1 = 722;
const ZOOM = 1 / 7;
const BLOCK = 50; // one block of the big word in the wide view
const WORD = art.wordBlocks('OGraf');
const WALL_X = 676; // where the wall's face stands in the close view at the hit
const P0 = [WALL_X, GY];
const P1 = [(W - WORD.width * BLOCK) / 2, 800];
const ZOOM_EASE = 'cubic-in-out';

// ---------------------------------------------------------------- layer bookkeeping
const assets = []; // { name, data }
const layers = []; // in paint order
const picture = (name, grid, scale) => {
  assets.push({ name, data: grid.png(scale).toString('base64') });
  return { asset: name, width: grid.width * scale, height: grid.height * scale };
};
const uri = (grid, scale) => `data:image/png;base64,${grid.png(scale).toString('base64')}`;
function layer(name, kind, element, box, options = {}) {
  const record = { name, kind, element, box, tracks: {}, ...options };
  layers.push(record);
  return record;
}
/** Adds keys [frame, value, easing] to one property of a layer. A later key at the same frame wins. */
function keys(record, property, list) {
  const track = (record.tracks[property] ??= new Map());
  for (const [frame, value, easing = 'linear'] of list) track.set(Math.round(frame), { frame: Math.round(frame), value, easing });
}
const sorted = (track) => [...track.values()].sort((a, b) => a.frame - b.frame);
/** Drops keys that sit between two keys of the same value. */
function tidy(list) {
  return list.filter((key, index) => {
    if (index === 0 || index === list.length - 1) return true;
    return !(list[index - 1].value === key.value && list[index + 1].value === key.value);
  });
}

/** Fades a layer in at the start, out after the end, or both. Multiplies nothing: use on layers that are simply there. */
const fadeIn = (record) => keys(record, 'opacity', [[0, 0], [10, 1]]);
const fadeOut = (record) => keys(record, 'opacity', [[END, 1], [LAST, 0]]);

/** The pull-back, for a layer that is part of the world: its place and size at Z0 are scaled to the wide view. */
function pullBack(record, at = (property) => valueAt(record, property, Z0)) {
  const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(at);
  keys(record, 'x', [[Z0, x], [Z1, P1[0] + (x - P0[0]) * ZOOM, ZOOM_EASE]]);
  keys(record, 'y', [[Z0, y], [Z1, P1[1] + (y - P0[1]) * ZOOM, ZOOM_EASE]]);
  keys(record, 'width', [[Z0, width], [Z1, width * ZOOM, ZOOM_EASE]]);
  keys(record, 'height', [[Z0, height], [Z1, height * ZOOM, ZOOM_EASE]]);
}
/** A far layer only rides up with the horizon. */
function rideUp(record) {
  const y = valueAt(record, 'y', Z0);
  keys(record, 'y', [[Z0, y], [Z1, y + (P1[1] - P0[1]), ZOOM_EASE]]);
}
const INDEX = { x: 0, y: 1, width: 2, height: 3 };
/** The value a track has at a frame, reading straight lines between keys. Only used where that is exact. */
function valueAt(record, property, frame) {
  const track = record.tracks[property];
  if (!track) return property === 'opacity' ? 1 : property === 'rotation' ? 0 : record.box[INDEX[property]];
  const list = sorted(track);
  if (frame <= list[0].frame) return list[0].value;
  if (frame >= list.at(-1).frame) return list.at(-1).value;
  const next = list.findIndex((key) => key.frame >= frame);
  const a = list[next - 1];
  const b = list[next];
  if (b.frame === frame) return b.value;
  if (a.value !== b.value && b.easing !== 'linear') throw new Error(`${record.name}.${property}: frame ${frame} is inside an eased move.`);
  return a.value + ((b.value - a.value) * (frame - a.frame)) / (b.frame - a.frame);
}

// ---------------------------------------------------------------- what an operator can change
const NIGHT = 'night';
const DAY = 'day';
const DESERT = 'desert';
const CITY = 'city';
const field = (fieldType, key, label, description, defaultValue, extra = {}) => ({ type: 'add_data_field', fieldType, key, label, description, defaultValue, exposeToOgraf: true, ...extra });
const FIELDS = [
  field('select', 'timeOfDay', 'Time of day', 'Night or day: the sky, the light on the land and the colour of the big word.', NIGHT, {
    options: [
      { value: NIGHT, label: 'Night' },
      { value: DAY, label: 'Day' },
    ],
  }),
  field('select', 'landscape', 'Landscape', 'What the run goes through: the desert or a city.', DESERT, {
    options: [
      { value: DESERT, label: 'Desert' },
      { value: CITY, label: 'City' },
    ],
  }),
  field('color', 'runnerColor', 'Viking dinosaur colour', 'The dinosaur that runs.', art.COLOURS.O),
  field('color', 'oldColor', 'Old dinosaur colour', 'The old dinosaur with the cane.', art.COLOURS.U),
  field('color', 'flyerColor', 'Pterodactyl colour', 'The pterodactyl in the sky.', art.COLOURS.Q),
];
/** A value that follows the time of day. */
const byTime = (property, night, day) => ({ fieldKey: 'timeOfDay', targetProperty: property, valueMap: { [NIGHT]: night, [DAY]: day } });
const both = (make) => ({ night: make(NIGHT), day: make(DAY) });
/** A picture drawn twice, for night and for day. The layer holds the night one; the setting swaps it. */
const timed = ({ night, day }, scale = A) => ({ night: uri(night, scale), day: uri(day, scale), width: night.width * scale, height: night.height * scale });
const timedLayer = (name, sources, box, options = {}) =>
  layer(name, 'image', { fit: 'fill', src: sources.night }, box, { ...options, bindings: [byTime('src', sources.night, sources.day)] });
/** Layers of one landscape. The city's start hidden and a rule shows them; the same setting hides the desert's. */
const inLandscape = (which) =>
  which === CITY
    ? { hidden: true, rule: { field: 'landscape', value: CITY, visible: true, name: 'Show in the city' } }
    : { rule: { field: 'landscape', value: CITY, visible: false, name: 'Hide in the city' } };
/** A shape that takes one of the colour settings, under the picture of an animal. */
const colourShape = (name, pose, box, fieldKey) =>
  layer(name, 'path', { d: pose.d, viewBoxWidth: pose.width, viewBoxHeight: pose.height, fill: pose.main, strokeWidth: 0 }, box, { bindings: [{ fieldKey, targetProperty: 'fill' }] });

// ---------------------------------------------------------------- the sky
const gradient = (stops) => ({ type: 'linear', angle: 180, stops: stops.map(([offset, color]) => ({ offset, color, opacity: 1 })) });
const SKY = { night: ['#060920', '#111A49', '#2C4490'], day: ['#2F8FE8', '#7CC3F7', '#D9F1FF'] };
const sky = layer('Sky', 'rectangle', { fill: gradient([[0, SKY.night[0]], [0.55, SKY.night[1]], [1, SKY.night[2]]]), strokeWidth: 0 }, [0, 0, W, H], {
  bindings: SKY.night.map((colour, index) => byTime(`fill.stops[${index}].color`, colour, SKY.day[index])),
});
const starsPicture = picture('stars', art.starfield(240, 70, 11), A);
const stars = layer('Stars', 'image', { fit: 'fill' }, [0, 0, starsPicture.width, starsPicture.height], {
  picture: starsPicture,
  rule: { field: 'timeOfDay', value: DAY, visible: false, name: 'Hide by day' },
});
const cloudsPicture = picture('clouds', art.clouds(340, 34, 17), A);
const clouds = layer('Clouds', 'image', { fit: 'fill' }, [0, 56, cloudsPicture.width, cloudsPicture.height], {
  picture: cloudsPicture,
  hidden: true,
  rule: { field: 'timeOfDay', value: DAY, visible: true, name: 'Show by day' },
});
keys(clouds, 'x', [[0, 0], ...BREAKS.slice(1, 5).map((frame) => [frame, -0.04 * scroll(frame)])]);
const moonSources = timed({ night: art.MOON, day: art.SUN });
const moon = timedLayer('Moon and sun', moonSources, [1500, 96, moonSources.width, moonSources.height]);
for (const record of [sky, stars, clouds, moon]) {
  fadeIn(record);
  fadeOut(record);
}

// ---------------------------------------------------------------- the meteor
// As the camera pulls back, a meteor comes into the sky from the top left and grows as it nears: the end of
// the dinosaurs' time is on its way. It is still coming when everything stops.
const METEOR_FROM = Z0;
{
  const pictures = [picture('meteor-1', art.meteor(false), A), picture('meteor-2', art.meteor(true), A)];
  /** The picture's box when the rock is at `rock` on screen and the picture is drawn at `scale`. */
  const boxAt = (rock, scale) => {
    const width = pictures[0].width * scale;
    const height = pictures[0].height * scale;
    return [rock[0] - art.METEOR_HEAD[0] * width, rock[1] - art.METEOR_HEAD[1] * height, width, height];
  };
  const far = boxAt([170, -24], 0.24);
  const near = boxAt([760, 300], 1);
  pictures.forEach((image, index) => {
    const record = layer(`Meteor ${index + 1}`, 'image', { fit: 'fill' }, far, { picture: image });
    // It speeds up as it comes, in a straight line: every channel uses the same easing.
    ['x', 'y', 'width', 'height'].forEach((property, channel) => keys(record, property, [[METEOR_FROM, far[channel]], [END, near[channel], 'quad-in']]));
    // Its fire flickers between two pictures.
    const opacity = [[0, 0], [METEOR_FROM - 1, 0]];
    let on = index === 0;
    if (on) opacity.push([METEOR_FROM, 1]);
    for (let frame = METEOR_FROM + 4, beat = 1; frame < END - 3; frame += 4, beat++) {
      on = beat % 2 === index;
      opacity.push(on ? [frame, 0] : [frame, 1], on ? [frame + 1, 1, 'expo-in-out'] : [frame + 1, 0, 'expo-in']);
    }
    opacity.push([END, on ? 1 : 0], [LAST, 0]);
    keys(record, 'opacity', opacity);
  });
}

// ---------------------------------------------------------------- strips that repeat as the world scrolls
const TILE = 260; // art pixels
const TILE_W = TILE * A;
const MARGIN = 100;
function plane(name, grids, factor, top, options = {}) {
  const sources = timed(grids);
  const records = [0, 1].map((k) => {
    const record = timedLayer(`${name} ${'AB'[k]}`, sources, [0, top, sources.width, sources.height], options);
    const place = (frame) => {
      const raw = k * TILE_W - factor * scroll(frame) + TILE_W + MARGIN;
      return (((raw % (2 * TILE_W)) + 2 * TILE_W) % (2 * TILE_W)) - TILE_W - MARGIN;
    };
    const x = [[0, place(0)]];
    const opacity = [[0, 0], [10, 1]];
    for (let frame = 0; frame < HIT; frame++) {
      const here = place(frame);
      const there = place(frame + 1);
      if (there > here + TILE_W) {
        // The strip has left on the left: it jumps to the right while it is unseen.
        x.push([frame, here], [frame + 1, there]);
        opacity.push([frame - 1, 1], [frame, 0], [frame + 1, 0], [frame + 2, 1]);
      } else if (BREAKS.includes(frame + 1)) x.push([frame + 1, there]);
    }
    x.push([HIT, place(HIT)]);
    keys(record, 'x', x);
    keys(record, 'opacity', opacity);
    return record;
  });
  return records;
}
const MESA = { night: ['#172159', '#22307A'], day: ['#C7835A', '#E2A377'] };
const DUNE = { night: ['#0D1338', '#1C2762'], day: ['#DCAC64', '#F1CC8C'] };
const FAR_CITY = {
  night: { face: '#141C52', roof: '#1F2A6E', windows: ['#F7D774', '#F7D774', '#9FE8FF'], lit: 0.14 },
  day: { face: '#93ADD0', roof: '#A9C0DE', windows: ['#7691B8'], lit: 0.45 },
};
const NEAR_CITY = {
  night: { face: '#0A0F31', roof: '#161D4D', windows: ['#FFE08A', '#FFE08A', '#7FE3FF', '#FFB36B'], lit: 0.3 },
  day: { face: '#5F789E', roof: '#7089AE', windows: ['#CFE6FF', '#B8D4F2'], lit: 0.55 },
};
const mesas = plane('Mesas', both((time) => art.mesas(TILE, 40, 5, ...MESA[time])), 0.1, GY - 40 * A + 24, inLandscape(DESERT));
const cityFar = plane('City far', both((time) => art.skyline(TILE, 46, 31, { ...FAR_CITY[time], widths: [7, 16], heights: [14, 42] })), 0.1, GY - 46 * A + 24, inLandscape(CITY));
const dunes = plane('Dunes', both((time) => art.dunes(TILE, 22, 9, ...DUNE[time])), 0.3, GY - 22 * A + 16, inLandscape(DESERT));
const cityNear = plane('City near', both((time) => art.skyline(TILE, 36, 47, { ...NEAR_CITY[time], widths: [12, 26], heights: [10, 32] })), 0.3, GY - 36 * A + 16, inLandscape(CITY));

// The ground is one long box. It is drawn at its wide-view size times seven, so the pull-back can shrink it.
const groundWide = [-240, P1[1], W + 480, 320];
const groundClose = [P0[0] + (groundWide[0] - P1[0]) / ZOOM, GY, groundWide[2] / ZOOM, groundWide[3] / ZOOM];
const GROUND = { night: ['#93A6F5', '#2A3172', '#1C2157', '#0E1236'], day: ['#FFF3C4', '#E0B56C', '#CF9F55', '#A97B3D'] };
const ROAD = { night: ['#9AA0B8', '#23263D', '#1A1C30', '#0C0D18'], day: ['#F2F4F7', '#6B7183', '#5A6072', '#3F4352'] };
/** A floor: a bright line along the top, then three tones going down. */
const floor = (name, colours, options) =>
  layer(name, 'rectangle', { fill: gradient([[0, colours.night[0]], [0.0036, colours.night[0]], [0.0036, colours.night[1]], [0.12, colours.night[2]], [1, colours.night[3]]]), strokeWidth: 0 }, groundClose, {
    ...options,
    bindings: [0, 0, 1, 2, 3].map((colour, stop) => byTime(`fill.stops[${stop}].color`, colours.night[colour], colours.day[colour])),
  });
const ground = floor('Ground', GROUND, inLandscape(DESERT));
const road = floor('Road', ROAD, inLandscape(CITY));
const PEBBLE = { night: ['#4A55A8', '#171B4A'], day: ['#F4DBA4', '#A8793D'] };
const MARKS = { night: ['#7C84A6', '#0E0F1C'], day: ['#EEF1F5', '#474B5A'] };
const pebbles = plane('Pebbles', both((time) => art.pebbles(TILE, 24, 21, ...PEBBLE[time])), 1, GY + A, inLandscape(DESERT));
const roadMarks = plane('Road marks', both((time) => art.roadMarks(TILE, 24, 23, ...MARKS[time])), 1, GY + A, inLandscape(CITY));

// ---------------------------------------------------------------- the pterodactyl
// It flies along in the sky above the run. It reaches the wall a moment before the runner: its beak goes in
// and sticks, and it flaps hard and wriggles, going nowhere. From then on it is part of the wall, also in
// the pull-back. Its layers lie under the big word, so the part of the beak inside the wall is hidden.
const FLYER_SCALE = 8;
const FLAP = 9; // frames for each beat of its wings in flight
const PANIC = 4; // and when it is stuck
const FLYER_Y = 70;
const BEAK_TIP = 44 * FLYER_SCALE; // from the left of its box to the tip of the beak
const BEAK_ROW = 15 * FLYER_SCALE; // and down to the beak
const BEAK_IN = 56; // how far the beak goes into the wall
const CRUISE_X = 764; // where it flies on screen just before the wall comes
const wallAt = (frame) => scroll(HIT) + WALL_X - scroll(frame); // the wall's face on screen
const STUCK = HIT - (CRUISE_X + BEAK_TIP - WALL_X) / V2; // the frame the beak touches the wall
if (!Number.isInteger(STUCK) || STUCK % 45 !== 0) throw new Error(`The pterodactyl should meet the wall on a whole frame at the top of its bob, not at ${STUCK}.`);
const flyer = [art.PTERO_A, art.PTERO_B].map((pose, index) => {
  const image = picture(`pterodactyl-${index + 1}`, pose.detail, FLYER_SCALE * 2);
  const box = [700, FLYER_Y, pose.width * FLYER_SCALE, pose.height * FLYER_SCALE];
  return [colourShape(`Pterodactyl ${index + 1} colour`, pose, box, 'flyerColor'), layer(`Pterodactyl ${index + 1}`, 'image', { fit: 'fill' }, box, { picture: image })];
});
{
  const held = (frame) => wallAt(frame) + BEAK_IN - BEAK_TIP; // its box when the beak is in the wall
  const x = [
    [0, 700],
    [200, 830, 'sine-in-out'],
    [400, 720, 'sine-in-out'],
    [STUCK - 60, CRUISE_X, 'sine-in-out'],
    [STUCK, CRUISE_X],
    [STUCK + 2, held(STUCK + 2)],
    [HIT, held(HIT)],
    // It shudders with the wall when the runner hits it.
    [HIT + 1, held(HIT) + 14],
    [HIT + 3, held(HIT) - 9],
    [HIT + 5, held(HIT) + 5],
    [HIT + 8, held(HIT)],
  ];
  const y = [];
  for (let frame = 0, beat = 0; frame <= STUCK; frame += 45, beat++) y.push([frame, FLYER_Y + (beat % 2 ? 22 : 0), 'sine-in-out']);
  // Stuck, it swings about its beak.
  const turn = [[STUCK, 0]];
  for (let frame = STUCK + 2, beat = 0; frame <= END; frame += PANIC, beat++) turn.push([frame, beat % 2 ? 5 : -8, 'sine-in-out']);
  flyer.forEach((parts, index) => {
    const opacity = [[0, 0]];
    if (index === 0) opacity.push([10, 1]);
    let on = index === 0;
    for (let frame = 12 + FLAP, beat = 1; frame < END - 4; frame += frame >= STUCK ? PANIC : FLAP, beat++) {
      on = beat % 2 === index;
      opacity.push(on ? [frame, 0] : [frame, 1], on ? [frame + 1, 1, 'expo-in-out'] : [frame + 1, 0, 'expo-in']);
    }
    opacity.push([END, on ? 1 : 0], [LAST, 0]);
    for (const record of parts) {
      keys(record, 'x', x);
      keys(record, 'y', y);
      keys(record, 'rotation', turn);
      keys(record, 'transformOriginX', [[0, BEAK_TIP / record.box[2]]]);
      keys(record, 'transformOriginY', [[0, BEAK_ROW / record.box[3]]]);
      keys(record, 'opacity', opacity);
      pullBack(record);
    }
  });
}

// ---------------------------------------------------------------- the big word, standing in the world
const blockPath = (() => {
  // Runs along rows and along columns, so no hairline can show between two blocks.
  const has = new Set(WORD.blocks.map(([x, y]) => `${x},${y}`));
  const parts = [];
  for (let y = 0; y < WORD.height; y++)
    for (let x = 0; x < WORD.width; x++) {
      if (!has.has(`${x},${y}`)) continue;
      if (!has.has(`${x - 1},${y}`)) {
        let end = x;
        while (has.has(`${end + 1},${y}`)) end++;
        parts.push(`M${x},${y} h${end - x + 1} v1 h${-(end - x + 1)} Z`);
      }
      if (!has.has(`${x},${y - 1}`)) {
        let end = y;
        while (has.has(`${x},${end + 1}`)) end++;
        if (end > y) parts.push(`M${x},${y} h1 v${end - y + 1} h-1 Z`);
      }
    }
  return parts.join(' ');
})();
const wordClose = (dx, dy) => [P0[0] + dx / ZOOM, GY - (WORD.height * BLOCK) / ZOOM + dy / ZOOM, (WORD.width * BLOCK) / ZOOM, (WORD.height * BLOCK) / ZOOM];
const wordElement = (fill) => ({ d: blockPath, viewBoxWidth: WORD.width, viewBoxHeight: WORD.height, fill, strokeWidth: 0 });
const DEPTH = 9; // how far the letters' side shows, in wide-view pixels
// White letters with a blue side by night; blue letters by day, when white would be lost against the sky.
const wordSide = layer('OGraf side', 'path', wordElement('#2352C3'), wordClose(DEPTH, -DEPTH), { bindings: [byTime('fill', '#2352C3', '#12266B')] });
const wordFace = layer('OGraf', 'path', wordElement('#F5F7FF'), wordClose(0, 0), { bindings: [byTime('fill', '#F5F7FF', '#2352C3')] });
const WALL_WORLD = scroll(HIT) + WALL_X; // the wall's place in the scrolling world
for (const [record, dx] of [[wordSide, DEPTH / ZOOM], [wordFace, 0]]) {
  const at = (frame) => WALL_WORLD + dx - scroll(frame);
  // A shudder when the dinosaur hits it.
  keys(record, 'x', [[0, at(0)], ...BREAKS.slice(1, 5).map((frame) => [frame, at(frame)]), [HIT + 1, at(HIT) + 14], [HIT + 3, at(HIT) - 9], [HIT + 5, at(HIT) + 5], [HIT + 8, at(HIT)]]);
  pullBack(record);
  fadeOut(record);
}

// ---------------------------------------------------------------- things that stand in the world
/** A picture that stands still in the world and so slides left on screen. `speed` is its own flight to the left. */
function prop(name, image, worldX, top, { speed = 0, from = 0 } = {}) {
  const record = layer(name, 'image', { fit: 'fill' }, [W + 200, top, image.width, image.height], { picture: image });
  const at = (frame) => worldX - scroll(frame) - speed * Math.max(0, frame - from);
  let first = 0;
  while (first < HIT && at(first + 1) > W + 40) first++;
  let last = first;
  while (last < HIT && at(last) + image.width > -40) last++;
  const frames = [first, ...BREAKS.filter((frame) => frame > first && frame < last), last];
  keys(record, 'x', frames.map((frame) => [frame, at(frame)]));
  record.at = at;
  record.first = first;
  record.last = last;
  return record;
}
/** The world place that puts a picture's middle at screen x `screenX` at `frame`. */
const worldFor = (frame, screenX, width) => scroll(frame) + screenX - width / 2;
const onGround = (image) => GY - image.height + A; // the drawn line under a picture sinks into the ground line

const rockPicture = picture('rock', art.ROCK, A);
const rockTallPicture = picture('rock-tall', art.ROCK_TALL, A);
const lavaPicture = picture('lava', art.LAVA, A);
const OLD_POSES = [art.OLD_A, art.OLD_B];
const oldPictures = OLD_POSES.map((pose, index) => picture(`old-dino-${index + 1}`, pose.detail, A));
const hatPicture = picture('cowboy-hat', art.HAT, A);
const shoutPicture = picture('shout', art.SHOUT, A);
const flyPictures = [picture('fly-up', art.FLY_A, A), picture('fly-down', art.FLY_B, A)];

const FOOT1 = 396; // the small dinosaur's feet, on screen
const FOOT2 = 436; // after the pounce, and for the big one

const JUMP_ROCK = 85; // the frame the rock passes under the small dinosaur
const DUCK = 150; // the dragonfly passes over it
const SMASH = [395]; // the big dinosaur just runs through this rock
const JUMP_LAVA = 460; // and jumps the lava
const KICK_X = 560;
const lava = prop('Lava', lavaPicture, worldFor(JUMP_LAVA, FOOT2, lavaPicture.width), GY);
const rock1 = prop('Rock 1', rockPicture, worldFor(JUMP_ROCK, FOOT1, rockPicture.width), onGround(rockPicture));
keys(rock1, 'opacity', [[0, 0], [10, 1]]); // it is in view from the start
const rock2 = prop('Rock 2', rockPicture, worldFor(SMASH[0], KICK_X, rockPicture.width), onGround(rockPicture));
keys(rock2, 'opacity', [[SMASH[0], 1], [SMASH[0] + 1, 0]]);

// The old blue dinosaur walks slowly on its cane, the same way as everyone. The orange one catches it from behind.
const WALK = 1.5; // its own pace to the right, in pixels a frame
const STEP = 12; // frames for each step of its walk
const OLD_X = FOOT2 + 44; // where it is when it is caught
const OLD_Y = onGround(oldPictures[0]);
const oldAt = (frame) => OLD_X + scroll(EAT) - scroll(frame) - WALK * (EAT - frame);
let oldFirst = RUN1;
while (oldAt(oldFirst + 1) > W + 40) oldFirst++;
const MOUTH = [FOOT2 + 78, GY - 148]; // the orange dinosaur's open mouth when it lands
oldPictures.forEach((image, index) => {
  const box = [W + 200, OLD_Y, image.width, image.height];
  const parts = [colourShape(`Old dinosaur ${index + 1} colour`, OLD_POSES[index], box, 'oldColor'), layer(`Old dinosaur ${index + 1}`, 'image', { fit: 'fill' }, box, { picture: image })];
  for (const record of parts) {
  // It walks in, then is pulled into the mouth.
  const small = 0.15;
  keys(record, 'x', [[oldFirst, oldAt(oldFirst)], [EAT, OLD_X], [EAT + 6, MOUTH[0] - (image.width * small) / 2, 'quad-in']]);
  keys(record, 'y', [[EAT, OLD_Y], [EAT + 6, MOUTH[1] - (image.height * small) / 2, 'quad-in']]);
  keys(record, 'width', [[EAT, image.width], [EAT + 6, image.width * small, 'quad-in']]);
  keys(record, 'height', [[EAT, image.height], [EAT + 6, image.height * small, 'quad-in']]);
  const opacity = [[0, index === 0 ? 1 : 0]];
  let on = index === 0;
  for (let frame = oldFirst + STEP, beat = 1; frame < EAT - 2; frame += STEP, beat++) {
    on = beat % 2 === index;
    opacity.push(on ? [frame, 0] : [frame, 1], on ? [frame + 1, 1, 'expo-in-out'] : [frame + 1, 0, 'expo-in']);
  }
  opacity.push([EAT + 4, on ? 1 : 0], [EAT + 6, 0]);
  keys(record, 'opacity', opacity);
  }
});
// Its hat rides on its head, then pops off, turns over once and lands. It is left behind when the run goes on.
const hat = layer('Cowboy hat', 'image', { fit: 'fill' }, [W + 200, OLD_Y + art.HAT_AT[1] * A, hatPicture.width, hatPicture.height], { picture: hatPicture });
{
  const dx = art.HAT_AT[0] * A;
  const onHead = OLD_Y + art.HAT_AT[1] * A;
  const landX = OLD_X + dx + 230;
  const landY = GY - hatPicture.height + A;
  keys(hat, 'x', [[oldFirst, oldAt(oldFirst) + dx], [EAT, OLD_X + dx], [EAT + 38, landX], [RUN2, landX], [RUN2 + 50, landX - 50 * V2]]);
  keys(hat, 'y', [[EAT, onHead], [EAT + 16, onHead - 250, 'quad-out'], [EAT + 38, landY, 'quad-in'], [EAT + 42, landY - 14, 'quad-out'], [EAT + 46, landY, 'quad-in']]);
  keys(hat, 'rotation', [[EAT, 0], [EAT + 38, -360]]);
}
const shout = layer('Surprise', 'image', { fit: 'fill' }, [W + 200, 0, shoutPicture.width, shoutPicture.height], { picture: shoutPicture });
{
  const dx = (art.HAT_AT[0] + 8) * A - shoutPicture.width / 2; // above the middle of the hat
  const y = OLD_Y + art.HAT_AT[1] * A - shoutPicture.height - 10;
  const from = EAT - 34;
  keys(shout, 'x', [[oldFirst, oldAt(oldFirst) + dx], [EAT, OLD_X + dx]]);
  keys(shout, 'y', [[from, y + 26], [from + 6, y, 'back-out']]);
  keys(shout, 'opacity', [[0, 0], [from, 0], [from + 2, 1], [EAT - 2, 1], [EAT, 0]]);
}

// ---------------------------------------------------------------- the dinosaur
const DINO_SCALE = 16;
const CELL = 28 * A; // the small dinosaur's box, across
const CELL_H = art.CELL_H * A; // and down: the helmet needs room on top
const FEET = CELL_H - A; // from the top of the box down to the soles
const dinoNames = { stand: 'Dino stand', runA: 'Dino run 1', runB: 'Dino run 2', jump: 'Dino jump', duckA: 'Dino duck 1', duckB: 'Dino duck 2', lunge: 'Dino pounce', roar: 'Dino roar', chew: 'Dino chew', bonk: 'Dino dazed' };
const dust = (() => {
  const image = picture('dust', art.DUST, A);
  return layer('Dust', 'image', { fit: 'fill' }, [0, GY - image.height + 6, image.width, image.height], { picture: image });
})();
keys(dust, 'opacity', [[0, 0]]);
const dino = Object.fromEntries(
  Object.entries(dinoNames).map(([key, name]) => {
    const pose = art.DINO[key];
    const image = picture(`dino-${key}`, pose.detail, DINO_SCALE);
    const box = [FOOT1 - 12 * A, GY - FEET, CELL, CELL_H];
    return [key, [colourShape(`${name} colour`, pose, box, 'runnerColor'), layer(name, 'image', { fit: 'fill' }, box, { picture: image })]];
  }),
);

// The pose: where the feet are, how high off the ground, how big. Each entry: [frame, pose, easing].
const poses = [];
const pose = (frame, { foot = FOOT1, lift = 0, size = 1, wide = 1, tall = 1, turn = 0, right = null, sink = 0 }, easing = 'linear') => {
  const width = CELL * size * wide;
  const height = CELL_H * size * tall;
  const x = right === null ? foot - 12 * A * size * wide : right - width;
  const y = GY - FEET * size * tall - lift + sink;
  poses.push({ frame, x, y, width, height, turn, easing });
};
const jump = (start, length, height, options = {}) => {
  pose(start, options);
  pose(start + length / 2, { ...options, lift: height }, 'quad-out');
  pose(start + length, options, 'quad-in');
  return start + length;
};
const landings = [];

pose(0, {});
landings.push(jump(JUMP_ROCK - 15, 30, 170)); // the rock
// The pounce on the old dinosaur.
pose(EAT - 18, {});
pose(EAT - 9, { foot: (FOOT1 + FOOT2) / 2, lift: 96 }, 'quad-out');
pose(EAT, { foot: FOOT2 }, 'quad-in');
landings.push(EAT);
// A gulp, then growing in three pushes.
const GULP = EAT + 36;
pose(GULP, { foot: FOOT2 });
pose(GULP + 4, { foot: FOOT2, wide: 1.1, tall: 0.88 }, 'quad-out');
pose(GULP + 9, { foot: FOOT2 }, 'back-out');
const GROW = [[48, 1], [51, 1.45], [56, 1.45], [59, 1.2], [63, 1.2], [66, 1.8], [71, 1.8], [74, 1.55], [78, 1.55], [82, 2]].map(([after, size]) => [EAT + after, size]);
GROW.forEach(([frame, size], index) => pose(frame, { foot: FOOT2, size }, index % 2 === 1 ? 'quad-out' : 'linear'));
const BIG = { foot: FOOT2, size: 2 };
// A roar: a small shake.
const ROAR = EAT + 84;
[[2, 0], [4, -10], [6, 8], [8, -6], [10, 4], [12, 0]].forEach(([after, shift]) => pose(ROAR + after, { ...BIG, foot: FOOT2 + shift }));
landings.push(jump(JUMP_LAVA - 20, 40, 270, BIG)); // the lava
// The wall.
pose(HIT, BIG);
pose(HIT + 3, { ...BIG, wide: 0.7, tall: 1.18, right: WALL_X + 12 }, 'quad-out');
pose(HIT + 13, { ...BIG, right: WALL_X - 44 }, 'quad-out');
pose(HIT + 18, { ...BIG, right: WALL_X - 44 });
const DOWN = { ...BIG, right: WALL_X - 96, sink: FEET * 2 - CELL_H - 118, turn: -90 }; // on its back, the box middle 118 above the ground
pose(HIT + 44, DOWN, 'bounce-out');
poses.sort((a, b) => a.frame - b.frame);

// Which picture shows when.
const show = []; // [frame, key]
const cycle = (from, to, pair, every) => {
  for (let frame = from, index = 0; frame < to; frame += every, index++) show.push([frame, pair[index % 2]]);
};
const RUN = ['runA', 'runB'];
show.push([0, 'stand']);
cycle(RUN1, JUMP_ROCK - 15, RUN, 5);
show.push([JUMP_ROCK - 15, 'jump']);
cycle(JUMP_ROCK + 15, DUCK - 22, RUN, 5);
cycle(DUCK - 22, DUCK + 22, ['duckA', 'duckB'], 5);
cycle(DUCK + 22, EAT - 18, RUN, 5);
show.push([EAT - 18, 'lunge'], [EAT + 5, 'chew']);
cycle(EAT + 11, GULP, ['stand', 'chew'], 6);
show.push([GULP + 2, 'stand'], [ROAR, 'roar']);
cycle(RUN2, JUMP_LAVA - 20, RUN, 6);
show.push([JUMP_LAVA - 20, 'jump']);
cycle(JUMP_LAVA + 20, HIT, RUN, 6);
show.push([HIT, 'bonk']);
show.sort((a, b) => a[0] - b[0]);

for (const [key, parts] of Object.entries(dino)) for (const record of parts) {
  keys(record, 'x', poses.map((entry) => [entry.frame, entry.x, entry.easing]));
  keys(record, 'y', poses.map((entry) => [entry.frame, entry.y, entry.easing]));
  keys(record, 'width', poses.map((entry) => [entry.frame, entry.width, entry.easing]));
  keys(record, 'height', poses.map((entry) => [entry.frame, entry.height, entry.easing]));
  keys(record, 'rotation', poses.map((entry) => [entry.frame, entry.turn, entry.easing]));
  pullBack(record);
  // Inside one frame the new picture snaps in at the middle and the old one goes at the end, so the body never thins out.
  const opacity = [[0, 0]];
  show.forEach(([frame, shown], index) => {
    const before = index > 0 ? show[index - 1][1] : null;
    if (shown === key && before !== key) opacity.push(...(frame === 0 ? [[10, 1]] : [[frame, 0], [frame + 1, 1, 'expo-in-out']]));
    if (before === key && shown !== key) opacity.push([frame, 1], [frame + 1, 0, 'expo-in']);
  });
  if (show.at(-1)[1] === key) opacity.push([END, 1], [LAST, 0]);
  keys(record, 'opacity', opacity);
}

// Dust where it lands.
{
  const x = [];
  const opacity = [[0, 0]];
  const width = [];
  for (const frame of landings) {
    const big = frame > RUN2;
    const size = big ? 2 : 1;
    const speed = frame === EAT ? 0 : big ? V2 : V1;
    const start = (frame > EAT - 1 ? FOOT2 : FOOT1) - 70 * size;
    x.push([frame - 1, start], [frame + 14, start - speed * 15 - 20 * size]);
    width.push([frame - 1, dust.box[2] * size * 0.7], [frame + 14, dust.box[2] * size * 1.3]);
    opacity.push([frame - 1, 0], [frame, 0.85], [frame + 14, 0]);
  }
  keys(dust, 'x', x);
  keys(dust, 'width', width);
  keys(dust, 'opacity', opacity);
}

// ---------------------------------------------------------------- dragonflies
const FLY_SPEED = 6;
const FLY_EVERY = 4;
function dragonfly(name, passFrame, screenX, top, gone = null) {
  const records = flyPictures.map((image, index) => {
    const from = passFrame - 120;
    const worldX = scroll(passFrame) + screenX - image.width / 2 + FLY_SPEED * (passFrame - from);
    const record = prop(`${name} ${index + 1}`, image, worldX, top, { speed: FLY_SPEED, from });
    // prop() only knows the scroll breaks; the flight starts at `from`, so pin that frame too.
    if (from > record.first) keys(record, 'x', [[from, record.at(from)]]);
    return record;
  });
  const [first, last] = [Math.min(...records.map((r) => r.first)), gone ?? Math.max(...records.map((r) => r.last))];
  records.forEach((record, index) => {
    const opacity = [[0, index === 0 ? 1 : 0]];
    for (let frame = first + FLY_EVERY, beat = 1; frame < last; frame += FLY_EVERY, beat++) {
      const on = beat % 2 === index;
      opacity.push(on ? [frame, 0] : [frame, 1], on ? [frame + 1, 1, 'expo-in-out'] : [frame + 1, 0, 'expo-in']);
    }
    if (gone !== null) opacity.push([gone, valueAtList(opacity, gone)], [gone + 1, 0]);
    keys(record, 'opacity', opacity);
  });
  return records;
}
function valueAtList(list, frame) {
  const before = list.filter(([f]) => f <= frame).sort((a, b) => a[0] - b[0]).at(-1);
  return before ? before[1] : 1;
}
dragonfly('Dragonfly', DUCK, FOOT1 + 20, GY - 258);

// ---------------------------------------------------------------- broken rock, the hit, the stars
const shardPictures = [picture('shard-1', art.SHARD_A, 12), picture('shard-2', art.SHARD_B, 12), picture('shard-3', art.SHARD_C, 12)];
shardPictures.forEach((image, index) => {
  const record = layer(`Shard ${index + 1}`, 'image', { fit: 'fill' }, [-200, 0, image.width, image.height], { picture: image });
  const opacity = [[0, 0]];
  const x = [];
  const y = [];
  const turn = [];
  for (const frame of SMASH) {
    const reach = [-260, -420, -150][index];
    const up = [330, 250, 420][index];
    const startX = KICK_X - 20 + index * 24;
    const startY = GY - 90;
    const length = [34, 30, 40][index];
    x.push([frame - 1, startX], [frame, startX], [frame + length, startX + reach]);
    y.push([frame - 1, startY], [frame, startY], [frame + length / 2, startY - up, 'quad-out'], [frame + length, GY - 10, 'quad-in']);
    turn.push([frame - 1, 0], [frame, 0], [frame + length, [-420, 500, -300][index]]);
    opacity.push([frame - 1, 0], [frame, 1], [frame + length - 4, 1], [frame + length, 0]);
  }
  keys(record, 'x', x);
  keys(record, 'y', y);
  keys(record, 'rotation', turn);
  keys(record, 'opacity', opacity);
});

const burstPicture = picture('burst', art.BURST, 16);
const burst = layer('Hit flash', 'image', { fit: 'fill' }, [WALL_X - 120, GY - 420, burstPicture.width, burstPicture.height], { picture: burstPicture });
{
  const centre = [WALL_X - 6, GY - 300];
  const size = (frame, scale, easing) => [
    ['x', frame, centre[0] - (burstPicture.width * scale) / 2, easing],
    ['y', frame, centre[1] - (burstPicture.height * scale) / 2, easing],
    ['width', frame, burstPicture.width * scale, easing],
    ['height', frame, burstPicture.height * scale, easing],
  ];
  for (const [property, frame, value, easing] of [...size(HIT - 1, 0.3), ...size(HIT + 3, 1.25, 'quad-out'), ...size(HIT + 12, 1.5)]) keys(burst, property, [[frame, value, easing]]);
  keys(burst, 'opacity', [[0, 0], [HIT - 1, 0], [HIT, 1], [HIT + 5, 1], [HIT + 12, 0]]);
  keys(burst, 'rotation', [[HIT - 1, 0], [HIT + 12, 40]]);
}

const starPicture = picture('star', art.STAR, 12);
const STARS_FROM = HIT + 36;
const STARS_TO = Z0 + 14;
const dazed = [0, 1, 2].map((index) => {
  const record = layer(`Dizzy star ${index + 1}`, 'image', { fit: 'fill' }, [0, 0, starPicture.width, starPicture.height], { picture: starPicture });
  record.phase = (index * Math.PI * 2) / 3;
  return record;
});

// ---------------------------------------------------------------- the opening words
const signPicture = picture('no-signal', art.NO_SIGNAL, 6);
const sign = layer('No signal', 'image', { fit: 'fill' }, [72, 64, signPicture.width, signPicture.height], { picture: signPicture });
keys(sign, 'opacity', [[0, 0], [4, 0], [5, 1], [12, 1], [13, 0], [16, 0], [17, 1], [RUN1 - 3, 1], [RUN1 - 2, 0]]);

// ---------------------------------------------------------------- the pull-back for the rest
for (const record of [ground, road]) {
  pullBack(record);
  fadeIn(record);
  fadeOut(record);
}
for (const record of [...mesas, ...dunes, ...cityFar, ...cityNear]) {
  rideUp(record);
  keys(record, 'opacity', [[END, valueAtList([...record.tracks.opacity.values()].map((k) => [k.frame, k.value]), END)], [LAST, 0]]);
}
for (const record of [...pebbles, ...roadMarks]) {
  pullBack(record);
  keys(record, 'opacity', [[Z0, valueAtList([...record.tracks.opacity.values()].map((k) => [k.frame, k.value]), Z0)], [Z0 + 40, 0]]);
}
// The stars circle the head of the fallen dinosaur. They are placed from the dinosaur's final box.
{
  const box = ['x', 'y', 'width', 'height'].map((property) => valueAt(dino.bonk[1], property, Z0));
  const middle = [box[0] + box[2] / 2, box[1] + box[3] / 2];
  // The head sits up and to the right of the box middle; lying on its back that is up and to the left.
  const head = [middle[0] - 6 * DINO_SCALE, middle[1] - 5 * DINO_SCALE];
  const orbit = [head[0], head[1] - 150];
  for (const record of dazed) {
    const x = [];
    const y = [];
    for (let frame = STARS_FROM; frame <= STARS_TO; frame += 3) {
      const angle = record.phase + ((frame - STARS_FROM) / 40) * Math.PI * 2;
      x.push([frame, orbit[0] + Math.cos(angle) * 120 - starPicture.width / 2]);
      y.push([frame, orbit[1] + Math.sin(angle) * 30 - starPicture.height / 2]);
    }
    keys(record, 'x', x);
    keys(record, 'y', y);
    keys(record, 'opacity', [[0, 0], [STARS_FROM, 0], [STARS_FROM + 4, 1], [STARS_TO - 8, 1], [STARS_TO, 0]]);
  }
}

// ---------------------------------------------------------------- send it to Studio
await fresh(REQUEST);
const blank = await scene();
const [toStep, toEnd] = blank.composition.transitions;
const prepared = await apply(
  [
    {
      type: 'set_project_metadata',
      id: 'dino-run',
      name: 'Dino Run',
      description: 'A 15 second runner cartoon: an orange dinosaur with a Viking helmet and a V on its side runs, jumps and ducks, eats an old blue dinosaur with a C, a cane and a cowboy hat, grows, then runs into a wall that turns out to be a huge OGraf. A pterodactyl with an X flies along, hits the wall too and is stuck there by its beak, flapping. In the pull-back a meteor comes into the sky. Time of day, landscape and the animals\' colours are settings, and it has sound effects.',
      supportsRealTime: true,
      supportsNonRealTime: false, // it has sound, and sound cues play in real time only
    },
    { type: 'set_composition', name: 'Dino Run', width: W, height: H, frameRate: FPS, updateTransitionFrames: 0 },
    { type: 'set_transition', transitionId: toStep.id, durationFrames: END },
    { type: 'set_transition', transitionId: toEnd.id, durationFrames: OUT },
    ...FIELDS,
    ...assets.map(({ name, data }) => ({ type: 'add_asset', name, mimeType: 'image/png', data })),
    ...Object.entries(SOUNDS).map(([name, samples]) => ({ type: 'add_asset', name: `sound-${name}`, mimeType: 'audio/wav', data: wav(samples).toString('base64') })),
  ],
  'Set up a 15 second timeline and bring in the pictures',
);
const assetIds = Object.fromEntries(prepared.results.filter((result) => result.type === 'add_asset').map((result) => [result.name, result.id]));

await apply(
  layers.map((record) =>
    add(record.kind, record.name, record.box, record.picture ? { ...record.element, src: `asset:${assetIds[record.picture.asset]}` } : record.element),
  ),
  'Lay out the world, the dinosaur and everything it meets',
);

const trackOps = layers.flatMap((record) =>
  Object.entries(record.tracks).map(([property, track]) => ({
    type: 'set_property_track',
    layerName: record.name,
    property,
    keys: tidy(sorted(track)).map(({ frame, value, easing }) => ({ frame, value: Math.round(value * 1000) / 1000, easing })),
  })),
);
for (let i = 0; i < trackOps.length; i += 60) await apply(trackOps.slice(i, i + 60), 'Animate the run, the growth, the crash and the pull-back');

// The settings: what follows them, what starts hidden, and the rules that show or hide a landscape.
const made = await scene();
const settingOps = layers.flatMap((record) => [
  ...(record.bindings?.length ? [{ type: 'set_layer_bindings', layerName: record.name, bindings: record.bindings }] : []),
  ...(record.hidden ? [{ type: 'set_layer_flags', layerName: record.name, isVisible: false }] : []),
  ...(record.rule
    ? [
        {
          type: 'set_layer_visual_rules',
          layerName: record.name,
          rules: [
            {
              id: `${record.rule.field}-${record.rule.value}`,
              name: record.rule.name,
              enabled: true,
              trigger: 'data',
              fieldId: made.field(record.rule.field).id,
              sourcePath: [],
              operator: 'equals',
              value: record.rule.value,
              actions: [{ type: 'visibility', visible: record.rule.visible, transitionFrames: 0 }],
            },
          ],
        },
      ]
    : []),
  // A changed setting shows at once, with no fade.
  { type: 'set_layer_layout', layerName: record.name, updateTransition: { style: 'none' } },
]);
for (let i = 0; i < settingOps.length; i += 25) await apply(settingOps.slice(i, i + 25), 'Tie the settings to the sky, the land and the animals');

// The sounds, each at its frame of the timeline.
const SOUND_EVENTS = [
  ['jump', JUMP_ROCK - 15],
  ['land', JUMP_ROCK + 15, { volume: 0.5 }],
  ['duck', DUCK - 22],
  ['alarm', EAT - 34],
  ['jump', EAT - 18, { speed: 1.15 }],
  ['chomp', EAT],
  ...[EAT + 17, EAT + 29].map((frame) => ['munch', frame]),
  ['gulp', GULP],
  ['grow', EAT + 48],
  ['grow', EAT + 63, { speed: 1.19 }],
  ['grow', EAT + 78, { speed: 1.41 }],
  ['roar', ROAR],
  ...SMASH.map((frame) => ['smash', frame]),
  ['jump', JUMP_LAVA - 20, { speed: 0.7 }],
  ['land', JUMP_LAVA + 20, { speed: 0.7, volume: 1 }],
  ['knock', STUCK],
  ['crash', HIT],
  ['thud', HIT + 28],
  ['dizzy', STARS_FROM + 2],
  ['whoosh', Z0],
  ['rumble', END - 96],
  ['reveal', Z1 - 30],
];
const SOUND_NAMES = { jump: 'Jump', duck: 'Duck', land: 'Landing', alarm: 'Surprise', chomp: 'Bite', munch: 'Chew', gulp: 'Gulp', grow: 'Grow', roar: 'Roar', smash: 'Rock breaks', knock: 'Beak in the wall', crash: 'Hits the wall', thud: 'Falls over', dizzy: 'Dizzy', whoosh: 'Pull-back', rumble: 'Meteor', reveal: 'The word' };
await apply(
  SOUND_EVENTS.map(([sound, frame, { speed = 1, volume = 0.8 } = {}]) => ({
    type: 'add_media_cue',
    cue: {
      name: `${SOUND_NAMES[sound]} at ${(frame / FPS).toFixed(1)} s`,
      sources: [{ id: sound, name: SOUND_NAMES[sound], kind: 'clip', mediaType: 'audio', src: `asset:${assetIds[`sound-${sound}`]}` }],
      activeSourceId: sound,
      trigger: { type: 'timeline', startFrame: frame },
      trimStartMs: 0,
      trimEndMs: null,
      durationFrames: null,
      loop: false,
      speed,
      volume,
      muted: false,
      retrigger: 'restart',
      transition: { type: 'cut', durationFrames: 0, audio: 'cut', onFailure: 'keep-current' },
      visual: { targetLayerId: null, fit: 'cover', positionX: 0.5, positionY: 0.5 },
    },
  })),
  'Put the sound effects on the timeline',
);

await apply(
  layers.map((record) => ({
    type: 'set_layer_semantics',
    layerName: record.name,
    patch: { role: record.name === 'OGraf' ? 'logo' : ['Sky', 'Stars', 'Clouds', 'Moon and sun', 'Ground', 'Road'].includes(record.name) || /^(Mesas|Dunes|Pebbles|City|Road marks)/.test(record.name) ? 'background' : 'decorative', tags: ['qa:allow-offcanvas'] },
  })),
  'Say what each layer is',
);

const done = await settled();
const check = await call('ograf_validate_project', { detail: 'summary' });
console.log('revision', done.revision, 'layers', layers.length, 'tracks', trackOps.length, 'keys', trackOps.reduce((sum, op) => sum + op.keys.length, 0));
console.log(JSON.stringify(check).slice(0, 600));
