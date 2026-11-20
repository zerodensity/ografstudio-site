// All the pictures of the dino run, drawn here as pixel art. Original drawings, made for this template.
//   node art.mjs sheet     writes sheet.png, a contact sheet to look at
import { writeFileSync } from 'node:fs';
import { Grid, fromRows, seeded } from './png.mjs';

export const INK = '#1A0B14';
export const COLOURS = {
  // The orange dinosaur
  O: '#FF8A1F', // body
  D: '#D4590B', // shade
  C: '#FFE1AD', // belly
  S: '#C2410C', // back spikes
  W: '#FFFFFF', // eye, teeth
  P: '#1B0F08', // pupil
  K: INK, // drawn lines
  R: '#B3202E', // mouth
  // The fur of the pterodactyl's trapper hat
  F: '#F7EED8',
  // The pterodactyl: its body, and its wing skin (drawn lighter)
  Q: '#E5484D',
  q: '#B5373B',
  // The orange dinosaur's helmet
  Z: '#C6CFDF',
  z: '#7A859D',
  I: '#FFF4D6',
  // The old blue dinosaur, its cane and its hat
  U: '#4C8DF6',
  u: '#2B5FC2',
  e: '#D4E6FF',
  N: '#B07A3C',
  H: '#8A5A2B',
  h: '#4A2C10',
  i: '#C08A4A',
  // Rocks
  A: '#AEB6E6',
  a: '#7C86C8',
  b: '#525CA3',
  // Lava
  L: '#FF4D6D',
  l: '#FFB13D',
  y: '#FFE98A',
  // Dragonfly
  T: '#2EE6C5',
  t: '#17A58E',
  w: '#D9FFF8',
  v: '#9FE9DD',
  // Effects
  Y: '#FFE14D',
  o: '#FFB000',
  M: '#F4F1FF',
  m: '#C9C6E8',
};

const CELL = 28;

/**
 * Splits a drawn animal in two, so its main colour can be a setting: a shape that takes the colour, and a
 * picture of everything else to lay on top. Cells of the `main` colour are left clear in the picture; cells
 * of a colour in `tints` become a see-through wash over the shape (darker or lighter shading).
 */
export function colourable(raw, main, tints = {}) {
  const full = raw.clone().outline(INK);
  const detail = full.clone();
  const cells = new Set();
  for (let y = 0; y < raw.height; y++)
    for (let x = 0; x < raw.width; x++) {
      const colour = raw.get(x, y);
      if (!colour) continue;
      cells.add(`${x},${y}`);
      if (colour === main) detail.set(x, y, null);
      else if (tints[colour]) detail.set(x, y, tints[colour]);
    }
  // The shape, as runs along each row. Each run reaches a little into the row below, so no hairline shows.
  const parts = [];
  for (let y = 0; y < raw.height; y++)
    for (let x = 0; x < raw.width; x++) {
      if (!cells.has(`${x},${y}`) || cells.has(`${x - 1},${y}`)) continue;
      let end = x;
      while (cells.has(`${end + 1},${y}`)) end++;
      parts.push(`M${x},${y} h${end - x + 1} v1.04 h${-(end - x + 1)} Z`);
    }
  return { full, detail, d: parts.join(' '), width: raw.width, height: raw.height, main };
}
const DARKER = '#00000040';
const MUCH_DARKER = '#00000066';
const LIGHTER = '#FFFFFF59';
const rows = (text) => {
  const lines = text.split('\n').filter((line) => line.length > 0);
  for (const line of lines) if (line.length > CELL) throw new Error(`Row too long (${line.length}): ${line}`);
  return lines;
};
const pad = (lines, height = CELL) => {
  const out = lines.map((line) => line.padEnd(CELL, '.'));
  while (out.length < height) out.push('.'.repeat(CELL));
  return out;
};

// ---- The orange dinosaur, in parts: head (rows 0-10), body (rows 11-20), legs (rows 21-27) ----
const HEAD = rows(`
............................
............................
..............OOOOOOOOO.....
.............OOOOOOOOOOO....
.............OOOOOWWOOOOO...
.............OOOOOWPOOOOOO..
.............OOOOOOOOOOOOO..
.............OOOOOOOOOOOOO..
.............OOOOOOKKKKKKK..
.............OOOOOOOOOOOO...
............SOOOOOOOOO......
`);
const HEAD_OPEN = rows(`
............................
..............OOOOOOOOO.....
.............OOOOOOOOOOO....
.............OOOOOWWOOOOO...
.............OOOOOWPOOOOOO..
.............OOOOOOOOOOOOO..
.............OOOOOOWOWOWOW..
.............OOOOORRRRRRR...
.............OOOOORRRRRR....
.............OOOOOOWOWOWO...
............SOOOOOOOOOOOO...
`);
const HEAD_CHEW = rows(`
............................
............................
..............OOOOOOOOO.....
.............OOOOOOOOOOO....
.............OOOOOKKOOOOO...
.............OOOOOOOOOOOOO..
.............OOOOOOOOOOOOO..
.............OOOOOOKKKKKKK..
.............OOOOOORRRRRR...
.............OOOOOOOOOOOOO..
............SOOOOOOOOOOO....
`);
const HEAD_BONK = rows(`
............................
............................
..............OOOOOOOOO.....
.............OOOOOOOOOOO....
.............OOOOKOKOOOOO...
.............OOOOOKOOOOOOO..
.............OOOOKOKOOOOOO..
.............OOOOOOOOOOOOO..
.............OOOOOOOKKKKOO..
.............OOOOOOOKRRKO...
............SOOOOOOOOO......
`);
const BODY = rows(`
...........OOOOOOOCC........
..........SWOOOWOOCCC.......
.O.......OOWOOOWOOCCC.......
.OO.....SOOOWOWOOOCCC.OO....
.OOO...OOOOOWOWOOOCCCOO.....
..OOOOOOOOOOOWOOOOCCC.......
...OOOOOOOOOOOOOOOCC........
....DOOOOOOOOOOOOOCC........
......DDOOOOOOOOOOC.........
........DOOOOOOOOO..........
`);
const LEGS_STAND = rows(`
........OOOO...OOOO.........
........OOO....OOO..........
........OOO....OOO..........
........OO.....OO...........
........OOOO...OOOO.........
`);
const LEGS_RUN_A = rows(`
........OOOO...OOOO.........
.......OOO.....OOO..........
......OOO......OOO..........
.....OOO.......OO...........
.....OO........OOOO.........
`);
const LEGS_RUN_B = rows(`
........OOOO...OOOO.........
........OOO.....OOO.........
........OOO......OOOO.......
........OO........OOO.......
........OOOO................
`);
const LEGS_JUMP = rows(`
........OOOO...OOOO.........
.......OOOO...OOOO..........
.......OOOOO..OOOOO.........
`);

// A tall domed helmet with a ridge and two horns. It sits right on top of the head, so every frame gets six
// more rows of room above.
const TOP = 6;
export const CELL_H = CELL + TOP;
const blank = (count) => new Array(count).fill('.'.repeat(CELL));
const HELMET = rows(`
..........I......ZzZ......I.
..........II....ZZzZZ....II.
..........III..ZZZzZZZ..III.
...........IIIZZZZzZZZZIII..
............IIZZZZzZZZZII...
.............zzzzzzzzzzz....
`);
const DUCK_HELMET = rows(`
................I....ZzZ..I.
................II..ZZzZZ.I.
................IIIZZZzZZZI.
.................IIZZZzZZZI.
..................zzzzzzzzz.
`);
const withHelmet = (lines, helmet, headTop) => {
  const grid = fromRows(pad([...blank(TOP), ...lines], CELL_H), COLOURS);
  grid.draw(fromRows(helmet, COLOURS), 0, TOP + headTop - helmet.length);
  return colourable(grid, COLOURS.O, { [COLOURS.D]: DARKER, [COLOURS.S]: MUCH_DARKER });
};
const dinoFrame = (head, legs, headTop = 2) => withHelmet([...head, ...BODY, ...legs], HELMET, headTop);

// ---- The duck: the whole animal low to the ground ----
const DUCK_TOP = rows(`
............................
............................
............................
............................
............................
............................
............................
............................
............................
............................
............................
............................
............................
.O..........................
.OO.......S...S.............
..OOO...OWOOOWOOO..OOOOOOO..
...OOOOOOWOOOWOOOOOOOOWWOOO.
....OOOOOOWOWOOOOOOOOOWPOOO.
.....OOOOOWOWOOCCCOOOOOOOOO.
......DOOOOWOOCCCCOOOKKKKKK.
........DOOOOOCCCC.OOOOOOO..
`);
const DUCK_LEGS_A = rows(`
........OOOO..OOOO..........
.......OOO....OOO...........
......OOO.....OO............
......OO......OOOO..........
`);
const DUCK_LEGS_B = rows(`
........OOOO..OOOO..........
........OOO....OOO..........
........OO......OOOO........
........OOOO................
`);
const duckFrame = (legs) => withHelmet([...DUCK_TOP, ...legs], DUCK_HELMET, 15);

export const DINO = {
  stand: dinoFrame(HEAD, LEGS_STAND),
  runA: dinoFrame(HEAD, LEGS_RUN_A),
  runB: dinoFrame(HEAD, LEGS_RUN_B),
  jump: dinoFrame(HEAD, LEGS_JUMP),
  duckA: duckFrame(DUCK_LEGS_A),
  duckB: duckFrame(DUCK_LEGS_B),
  lunge: dinoFrame(HEAD_OPEN, LEGS_JUMP, 1),
  roar: dinoFrame(HEAD_OPEN, LEGS_STAND, 1),
  chew: dinoFrame(HEAD_CHEW, LEGS_STAND),
  bonk: dinoFrame(HEAD_BONK, LEGS_STAND),
};

// ---- Everything else ----
/** Rows of text to a grid with one empty cell all round, where the drawn line goes. */
const margin = (text, colours = COLOURS) => {
  const lines = text.split('\n').filter((line) => line.length > 0);
  const width = Math.max(...lines.map((line) => line.length)) + 2;
  const grid = new Grid(width, lines.length + 2);
  grid.draw(fromRows(lines, colours), 1, 1);
  return grid;
};
const picture = (text, colours = COLOURS) => margin(text, colours).outline(INK);
const oldDinosaur = (text) => colourable(margin(text), COLOURS.U, { [COLOURS.u]: DARKER });

/**
 * The old blue dinosaur: hunched, white brows and beard, a C on its side, walking on a cane. It faces right,
 * the way everyone is going. Two steps of its walk. Its hat is a picture of its own.
 */
const OLD_TOP = `
......UUUUU.........
....UUUUUUUUUUUUUU..
...UUUUUUUUUUUUUUUU.
..UUUUWWWUUUUWWUUUU.
..UUUWUUUUUUUKKUUUUU
.UUUUWUUUUUUUUUUUUUU
.UUUUWUUUUUUUUKKKKKK
.UUUUUWWWUeeeUUUUUU.
UUUUUUUUUUeeeWWWW...
`;
export const OLD_A = oldDinosaur(
  OLD_TOP +
    `UUUUUUUUUUeee.WW.NN.
UUuUUUUUUUeeUUUUUN..
Uuu.UUUUUUee.....N..
uu...UUUUUUe.....N..
u....uUUUUU......N..
.....UUU.UUU.....N..
.....UU..UU......N..
.....UU..UU......N..
.....UUU.UUU.....N..
`,
);
export const OLD_B = oldDinosaur(
  OLD_TOP +
    `UUUUUUUUUUeee.WW..NN
UUuUUUUUUUeeUUUUUUN.
Uuu.UUUUUUee......N.
uu...UUUUUUe......N.
u....uUUUUU.......N.
......UUUUU.......N.
......UU.UU.......N.
.....UU...UU......N.
.....UUU..UUU.......
`,
);
/** Where the hat sits on the old dinosaur, in art pixels from the corner of its picture. */
export const HAT_AT = [8, -5];
export const HAT = picture(`
....HH..HH....
...HiHHHHHH...
...HHHHHHHH...
...hhhhhhhh...
H.HHHHHHHHHH.H
HHiHHHHHHHHHHH
.HHHHHHHHHHHH.
`);

// ---- The pterodactyl ----
// Drawn from shapes, not typed rows: a long pointed beak, a crest sweeping back from the head, a small body with
// trailing legs, and one great wing whose skin runs from the wing finger down to the hip. A large X on the wing.
// It is drawn twice: wing up, and wing down (the same wing turned over, in front of the body).
const X_MARK = ['W.....W', '.W...W.', '..W.W..', '...W...', '..W.W..', '.W...W.', 'W.....W'];
function pterodactyl(wingUp) {
  const grid = new Grid(46, 34);
  const at = ([x, y]) => [x + 1, y + 1]; // one empty cell all round, for the drawn line
  const turn = ([x, y]) => (wingUp ? [x, y] : [x, 33 - y]);
  const cell = (point, colour) => {
    const [x, y] = at(turn(point));
    grid.set(Math.floor(x), Math.floor(y), colour);
  };
  const main = COLOURS.Q;
  const skin = COLOURS.q;
  const wing = () => {
    const shoulder = turn([20, 15.5]);
    const wrist = turn([17, 5]);
    const tip = turn([2, 2.5]);
    grid.polygon([shoulder, wrist, tip, turn([7, 8.5]), turn([10, 13]), turn([13, 17.5])].map(at), skin);
    grid.line(at(shoulder), at(wrist), main, 1.8); // the arm
    grid.line(at(wrist), at(tip), main, 1.5); // the long wing finger
    cell([18.5, 3.5], COLOURS.C); // the small claws at the wrist
    X_MARK.forEach((row, j) => [...row].forEach((mark, i) => mark === 'W' && cell([10.5 + i, 6.5 + j], COLOURS.W)));
  };
  const body = () => {
    grid.polygon([[10, 18.2], [14.5, 17.4], [14.5, 19.6]].map(at), main); // a short tail
    grid.line(at([15, 20]), at([9.5, 22.5]), main, 1.4); // legs, trailing behind
    grid.line(at([17, 20.5]), at([12, 24]), main, 1.4);
    grid.ellipse(20.5, 19, 6, 3.2, main);
  };
  const head = () => {
    grid.line(at([24, 17]), at([28, 13.5]), main, 2.8); // the neck
    grid.ellipse(30.5, 14.2, 3.2, 2.7, main);
    grid.polygon([[26.5, 11.6], [30.5, 11.2], [21.5, 6.5]].map(at), main); // the crest
    grid.polygon([[31.5, 11.4], [43, 14], [31.5, 16]].map(at), COLOURS.C); // the beak
    grid.set(31, 13, COLOURS.W);
    grid.set(32, 13, COLOURS.P);
    // A trapper hat: a leather crown, a fur band over the brow, and an ear flap with a fur edge and a strap.
    grid.fill(28, 8, 5, 1, COLOURS.H);
    grid.fill(27, 9, 7, 3, COLOURS.H);
    grid.fill(28, 9, 2, 1, COLOURS.i);
    grid.fill(27, 11, 7, 1, COLOURS.h);
    grid.fill(25, 12, 4, 8, COLOURS.H);
    grid.fill(25, 12, 1, 8, COLOURS.h);
    grid.fill(29, 12, 6, 1, COLOURS.F);
    grid.fill(29, 13, 1, 7, COLOURS.F);
    grid.fill(25, 20, 5, 1, COLOURS.F);
    grid.fill(27, 21, 1, 2, COLOURS.h);
  };
  for (const part of wingUp ? [wing, body, head] : [body, wing, head]) part();
  return colourable(grid, main, { [skin]: DARKER });
}
export const PTERO_A = pterodactyl(true);
export const PTERO_B = pterodactyl(false);

export const SHOUT = picture(`
YY
YY
YY
YY
YY
..
YY
`);

export const ROCK = picture(`
....AAAA....
..AAAAAAaa..
.AAAAAAaaaa.
AAAAAAaaaaab
AAAAAaaaaabb
AAAaaaaaabbb
AAaaaaaabbbb
`);

export const ROCK_TALL = picture(`
...AAAAA....
..AAAAAAaa..
..AAAAAaaab.
..AAAAaaabb.
...AAaaabb..
..AAAAAAaa..
.AAAAAAaaaa.
.AAAAAaaaab.
AAAAAAaaaabb
AAAAAaaaaabb
AAAAaaaaabbb
AAAaaaaabbbb
AAaaaaaabbbb
`);

export const SHARD_A = picture(`
.AAa
AAaa
Aaab
.abb
`);
export const SHARD_B = picture(`
AAa.
Aaab
.abb
`);
export const SHARD_C = picture(`
.Aa
Aab
abb
`);

/** A lava pool that sits in the ground: the top row is level with the ground line. */
export const LAVA = (() => {
  const grid = fromRows(
    `
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KlyllLLLLlllLLLLLLllyllLLLLLlK
KLLLLlllLLLLLLllLLLLLLLLllLLLK
.KLLLLLLLLllLLLLLLLLlLLLLLLLK.
..KKLLLLLLLLLLLLlLLLLLLLLLKK..
....KKKKKKKKKKKKKKKKKKKKKK....
`
      .split('\n')
      .filter(Boolean),
    COLOURS,
  );
  return grid;
})();

export const FLY_A = picture(`
....ww.....ww.....
...wwvw...wwvw....
...wvvw...wvvw....
....wvw....wvw....
.PP..ww.....ww....
TTTTTTTTTTTttttttt
PTTTTTTTTTtt......
.TT...............
`);
export const FLY_B = picture(`
..................
..................
..................
.PP...............
TTTTTTTTTTTttttttt
PTTTTwwTTttwwt....
.TT.wvvw..wvvw....
....wvvw..wvvw....
.....ww....ww.....
`);

export const DUST = picture(`
..MMM...MM..
.MMMMMMMMMM.
MMMMmMMMMmMM
.MmmMMMmmMM.
`);

export const BURST = (() => {
  const grid = fromRows(
    `
.......Y.......
.......Y.......
..Y...YYY...Y..
...Y..YYY..Y...
....YYYMYYY....
....YMMMMMY....
..YYYMMMMMYYY..
YYYYMMMMMMMYYYY
..YYYMMMMMYYY..
....YMMMMMY....
....YYYMYYY....
...Y..YYY..Y...
..Y...YYY...Y..
.......Y.......
.......Y.......
`
      .split('\n')
      .filter(Boolean),
    COLOURS,
  );
  return grid;
})();

export const STAR = picture(`
..Y..
.YYY.
YYYYY
.YYY.
.Y.Y.
`);

// ---- A 5 x 7 block alphabet, only the letters used ----
const GLYPHS = {
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'],
  S: ['#####', '#....', '#....', '#####', '....#', '....#', '#####'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  G: ['#####', '#....', '#....', '#.###', '#...#', '#...#', '#####'],
  A: ['#####', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  // Lower case for the big word
  r: ['.....', '.....', '#.###', '##...', '#....', '#....', '#....'],
  a: ['.....', '.....', '####.', '....#', '#####', '#...#', '#####'],
  f: ['..###', '..#..', '#####', '..#..', '..#..', '..#..', '..#..'],
};
export function lettering(word, colour, gap = 1) {
  const glyphs = [...word].map((letter) => GLYPHS[letter] ?? GLYPHS[' ']);
  const width = glyphs.reduce((sum, glyph) => sum + glyph[0].length, 0) + gap * (glyphs.length - 1);
  const grid = new Grid(width, 7);
  let x = 0;
  for (const glyph of glyphs) {
    glyph.forEach((row, y) => [...row].forEach((cell, i) => cell === '#' && grid.set(x + i, y, colour)));
    x += glyph[0].length + gap;
  }
  return grid;
}
/** Where each block of the big word is, in block units: [x, y] with y 0 at the top. */
export function wordBlocks(word, gap = 1) {
  const cells = lettering(word, '#fff', gap);
  const blocks = [];
  for (let y = 0; y < cells.height; y++) for (let x = 0; x < cells.width; x++) if (cells.get(x, y)) blocks.push([x, y]);
  return { blocks, width: cells.width, height: cells.height };
}

export const NO_SIGNAL = (() => {
  const text = lettering('NO SIGNAL', '#FFFFFF');
  const grid = new Grid(text.width + 8, 9);
  grid.fill(1, 2, 4, 5, '#FF3B4E');
  grid.draw(text, 7, 1);
  return grid;
})();

// ---- The moon ----
export const MOON = (() => {
  const size = 26;
  const grid = new Grid(size, size);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre);
      if (distance <= size / 2 - 0.3) grid.set(x, y, '#FFF3C7');
    }
  for (const [x, y, w, h] of [
    [7, 6, 4, 3],
    [15, 9, 5, 4],
    [9, 15, 3, 3],
    [16, 18, 3, 2],
    [5, 12, 2, 2],
  ])
    grid.fill(x, y, w, h, '#E9D79B');
  return grid;
})();

// ---- The meteor that is on its way: a rock with fire streaming behind it, coming down to the right ----
/** Where the rock is in the picture, as fractions of its width and height. */
export const METEOR_HEAD = [32 / 42, 19 / 28];
export function meteor(flicker) {
  const grid = new Grid(42, 28);
  const head = [32, 19];
  const along = [0.875, 0.483]; // the way it is going
  const across = [-0.483, 0.875];
  const LENGTH = 33;
  const flame = (half, reach, colour) =>
    grid.polygon(
      [
        [head[0] + across[0] * half, head[1] + across[1] * half],
        [head[0] - across[0] * half, head[1] - across[1] * half],
        [head[0] - along[0] * LENGTH * reach, head[1] - along[1] * LENGTH * reach],
      ],
      colour,
    );
  if (flicker) {
    flame(5.4, 0.9, '#E8421C');
    flame(4.3, 0.68, '#FF9A1F');
    flame(2.2, 0.3, '#FFE27A');
    for (const [x, y] of [[4, 3], [9, 4], [13, 11], [7, 8]]) grid.set(x, y, '#FF9A1F');
  } else {
    flame(6, 1, '#E8421C');
    flame(4, 0.6, '#FF9A1F');
    flame(2.5, 0.38, '#FFE27A');
    for (const [x, y] of [[6, 3], [11, 9], [16, 7]]) grid.set(x, y, '#FFE27A');
  }
  grid.ellipse(head[0] + 0.9, head[1] + 0.5, 5.9, 5.4, '#FFD23F'); // the glow on the side that leads
  grid.ellipse(head[0], head[1], 5, 4.6, '#6B5A72');
  grid.ellipse(head[0] - 1.2, head[1] - 1, 3.4, 3, '#544660');
  grid.fill(31, 18, 2, 2, '#3F3248');
  grid.set(34, 20, '#3F3248');
  grid.fill(29, 21, 2, 1, '#3F3248');
  return grid.outline(INK);
}

// ---- The sun, the same size as the moon ----
export const SUN = (() => {
  const size = 26;
  const grid = new Grid(size, size);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre);
      if (distance <= 4.6) grid.set(x, y, '#FFF6B8');
      else if (distance <= 7.6) grid.set(x, y, '#FFD23F');
    }
  for (let step = 0; step < 8; step++) {
    const angle = (step * Math.PI) / 4;
    for (const reach of [10, 11, 12]) grid.set(Math.round(centre + Math.cos(angle) * reach), Math.round(centre + Math.sin(angle) * reach), '#FFD23F');
  }
  return grid;
})();

/** A few clouds, for the day sky. */
export function clouds(width, height, seed) {
  const random = seeded(seed);
  const grid = new Grid(width, height);
  for (let x = 8; x < width - 50; x += 46 + Math.floor(random() * 40)) {
    const y = 4 + Math.floor(random() * (height - 14));
    const long = 22 + Math.floor(random() * 18);
    grid.fill(x + 5, y, long - 12, 2, '#FFFFFF');
    grid.fill(x + 2, y + 2, long - 4, 2, '#FFFFFF');
    grid.fill(x, y + 4, long, 3, '#FFFFFF');
    grid.fill(x + 1, y + 7, long - 2, 1, '#D5E9FA');
  }
  return grid;
}

/** A row of city buildings. The same seed gives the same buildings, so day and night line up. */
export function skyline(width, height, seed, { face, roof, windows, lit, widths, heights }) {
  const random = seeded(seed);
  const grid = new Grid(width, height);
  let x = 0;
  while (x < width) {
    const wide = Math.min(width - x, widths[0] + Math.floor(random() * (widths[1] - widths[0])));
    const tall = heights[0] + Math.floor(random() * (heights[1] - heights[0]));
    const top = height - tall;
    grid.fill(x, top, wide, tall, face);
    grid.fill(x, top, wide, 1, roof);
    const mast = random();
    if (mast < 0.3 && wide > 6) grid.fill(x + Math.floor(wide / 2), top - 3, 1, 3, roof);
    for (let row = top + 3; row < height - 2; row += 3)
      for (let column = x + 1; column < x + wide - 1; column += 2) {
        const on = random() < lit;
        const pick = windows[Math.floor(random() * windows.length)];
        if (on) grid.set(column, row, pick);
      }
    x += wide + (random() < 0.3 ? 1 : 0);
  }
  return grid;
}

/** Lane dashes and a few cracks, for the road. The dashes repeat cleanly across the strip. */
export function roadMarks(width, height, seed, dash, crack) {
  const random = seeded(seed);
  const grid = new Grid(width, height);
  for (let x = 0; x < width; x += 26) grid.fill(x, 9, 12, 2, dash);
  for (let i = 0; i < width / 9; i++) {
    const x = 1 + Math.floor(random() * (width - 6));
    const y = 2 + Math.floor(random() * (height - 4));
    if (y >= 8 && y <= 11) continue;
    grid.fill(x, y, 2 + Math.floor(random() * 3), 1, crack);
  }
  return grid;
}

// ---- Wide strips that repeat: far mesas, nearer dunes, pebbles on the ground ----
/** Flat-topped hills against the sky. `width` and `height` in art pixels; the strip repeats cleanly. */
export function mesas(width, height, seed, face, rim) {
  const random = seeded(seed);
  const grid = new Grid(width, height);
  const top = new Array(width).fill(height - 4);
  let x = 0;
  while (x < width - 30) {
    const gap = 6 + Math.floor(random() * 22);
    const span = 14 + Math.floor(random() * 34);
    const tall = 8 + Math.floor(random() * (height - 14));
    const start = x + gap;
    for (let i = 0; i < span && start + i < width - 4; i++) {
      const edge = Math.min(i, span - 1 - i);
      const step = edge < 2 ? 4 : edge < 4 ? 2 : 0;
      top[start + i] = Math.min(top[start + i], height - tall + step);
    }
    x = start + span;
  }
  for (let i = 0; i < width; i++) {
    for (let y = top[i]; y < height; y++) grid.set(i, y, y === top[i] ? rim : face);
  }
  return grid;
}

/** Rolling dunes. Built from whole waves so the strip repeats cleanly. */
export function dunes(width, height, seed, face, rim) {
  const random = seeded(seed);
  const waves = [1, 2, 3, 5].map((count) => ({ count, phase: random() * Math.PI * 2, size: (0.5 + random() * 0.5) / count }));
  const total = waves.reduce((sum, wave) => sum + wave.size, 0);
  const grid = new Grid(width, height);
  for (let x = 0; x < width; x++) {
    let level = 0;
    for (const wave of waves) level += Math.sin((x / width) * Math.PI * 2 * wave.count + wave.phase) * wave.size;
    const top = Math.round(((1 - level / total) / 2) * (height - 6));
    for (let y = top; y < height; y++) grid.set(x, y, y <= top + 1 ? rim : face);
  }
  return grid;
}

/** Pebbles, cracks and tufts scattered on the ground. */
export function pebbles(width, height, seed, light, dark) {
  const random = seeded(seed);
  const grid = new Grid(width, height);
  for (let i = 0; i < width / 3; i++) {
    const x = 1 + Math.floor(random() * (width - 6));
    const y = 3 + Math.floor(random() * (height - 5));
    const kind = random();
    const colour = random() < 0.5 ? light : dark;
    if (kind < 0.45) grid.fill(x, y, 2, 1, colour);
    else if (kind < 0.75) grid.fill(x, y, 3, 1, colour);
    else if (kind < 0.9) {
      grid.fill(x, y, 3, 2, colour);
      grid.set(x, y, null);
    } else grid.fill(x, y, 5, 1, colour);
  }
  return grid;
}

/** Stars for the sky. */
export function starfield(width, height, seed) {
  const random = seeded(seed);
  const grid = new Grid(width, height);
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * random() * height);
    grid.set(x, y, random() < 0.25 ? '#FFFFFF' : random() < 0.5 ? '#B9C4FF' : '#7F8CD9');
  }
  return grid;
}

if (process.argv[2] === 'sheet') {
  const items = [
    ...Object.entries(DINO).map(([name, frame]) => [name, frame.full]),
    ['oldA', OLD_A.full],
    ['oldB', OLD_B.full],
    ['pteroA', PTERO_A.full],
    ['pteroB', PTERO_B.full],
    ['sun', SUN],
    ['meteorA', meteor(false)],
    ['meteorB', meteor(true)],
    ['hat', HAT],
    ['shout', SHOUT],
    ['rock', ROCK],
    ['rockTall', ROCK_TALL],
    ['shardA', SHARD_A],
    ['shardB', SHARD_B],
    ['shardC', SHARD_C],
    ['lava', LAVA],
    ['flyA', FLY_A],
    ['flyB', FLY_B],
    ['dust', DUST],
    ['burst', BURST],
    ['star', STAR],
    ['moon', MOON],
    ['noSignal', NO_SIGNAL],
    ['word', lettering('OGraf', '#FFFFFF')],
  ];
  const columns = 6;
  const cell = 34;
  const sheet = new Grid(columns * cell, Math.ceil(items.length / columns) * cell);
  sheet.fill(0, 0, sheet.width, sheet.height, '#2A3A6E');
  items.forEach(([, grid], index) => {
    const x = (index % columns) * cell + Math.floor((cell - Math.min(grid.width, cell)) / 2);
    const y = Math.floor(index / columns) * cell + Math.floor((cell - Math.min(grid.height, cell)) / 2);
    sheet.draw(grid, x, y);
  });
  writeFileSync('sheet.png', sheet.png(6));
  console.log('sheet.png', items.map(([name]) => name).join(', '));
}
