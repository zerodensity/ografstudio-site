/**
 * Saves the telemetry the Race telemetry example replays: the last two laps of the 2020 Italian Grand
 * Prix at Monza, for every car still running, from TracingInsights' public files.
 *
 *   node examples-src/race-telemetry-snapshot.mjs
 *
 * The telemetry comes from one fixed commit of https://github.com/TracingInsights/2020 (MIT licence),
 * and the official classification from https://github.com/TracingInsights/RaceData (CC0), so a rebuild
 * always replays the same race. Downloads are kept in .cache/race-telemetry.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = {
  repository: 'https://github.com/TracingInsights/2020',
  commit: 'f83629390b84b637ed3d173350c3bc3b95f53724',
  licence: 'MIT',
  event: 'Italian Grand Prix',
  session: 'Race',
  circuit: 'Autodromo Nazionale Monza',
  date: '2020-09-06',
};
/** The official result: grid places, finishing times and gaps as published. */
const RESULTS = {
  repository: 'https://github.com/TracingInsights/RaceData',
  commit: '4e24920dfeec4214f47355435a1aa200a630d477',
  licence: 'CC0-1.0',
};
/** The laps kept: the final lap and the one before it, which the replay opens on. */
const LAPS = [52, 53];

const cache = new URL('../.cache/race-telemetry/', import.meta.url);
mkdirSync(cache, { recursive: true });

async function file(path) {
  const local = new URL(path.replace(/\//g, '_'), cache);
  if (existsSync(local)) return JSON.parse(readFileSync(local, 'utf8'));
  const url = `https://raw.githubusercontent.com/TracingInsights/2020/${SOURCE.commit}/${encodeURIComponent(SOURCE.event)}/${SOURCE.session}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const text = await response.text();
  writeFileSync(local, text);
  return JSON.parse(text);
}

/** One of the official tables, as rows of text cells. */
async function official(name) {
  const local = new URL(`official_${name}.csv`, cache);
  if (!existsSync(local)) {
    const url = `https://raw.githubusercontent.com/TracingInsights/RaceData/${RESULTS.commit}/data/${name}.csv`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    writeFileSync(local, await response.text());
  }
  const [head, ...lines] = readFileSync(local, 'utf8').trim().split(/\r?\n/);
  const keys = head.split(',');
  // No cell these tables' used columns hold contains a comma, so a plain split is enough.
  return lines.map((line) => Object.fromEntries(line.split(',').map((cell, i) => [keys[i], cell.replace(/^"|"$/g, '')])));
}

const round = (value, digits) => Number(value.toFixed(digits));
/** The tables are column lists; this gives one object per row. */
const rows = (table) => {
  const keys = Object.keys(table);
  return table[keys[0]].map((_, i) => Object.fromEntries(keys.map((key) => [key, table[key][i]])));
};
const number = (value) => (typeof value === 'number' ? value : null);

const [info, lapTable, driverTable, circuit] = await Promise.all(
  ['session_info.json', 'session_laptimes.json', 'drivers.json', 'corners.json'].map(file),
);
const laps = rows(lapTable);

// The circuit's outline, and how far along it each point is. Positions sit within centimetres of
// this line, so the nearest point on it says how far round the lap a car is.
const outline = circuit.TrackX.map((x, i) => [x, circuit.TrackY[i]]);
const along = [0];
for (let i = 1; i <= outline.length; i++) {
  const a = outline[i - 1];
  const b = outline[i % outline.length];
  along.push(along[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
}
const round1 = along.at(-1);
function alongOutline(x, y) {
  let nearest = Infinity;
  let found = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const off = Math.hypot(x - (a[0] + dx * k), y - (a[1] + dy * k));
    if (off < nearest) {
      nearest = off;
      found = along[i] + (along[i + 1] - along[i]) * k;
    }
  }
  return found;
}
const lastLap = info.total_laps;
const finishers = laps.filter((row) => row.lap === lastLap).sort((a, b) => a.sesT - b.sesT);
// Every time in the snapshot counts from here: the moment the winner started the last lap.
const zero = finishers[0].lST;

const race = (await official('races')).find((item) => item.year === SOURCE.date.slice(0, 4) && item.name === SOURCE.event);
if (!race) throw new Error('The official tables have no such race.');
const classified = (await official('results')).filter((item) => item.raceId === race.raceId);

const drivers = [];
for (const [index, finish] of finishers.entries()) {
  const who = driverTable.drivers.find((driver) => driver.driver === finish.drv);
  const samples = { t: [], x: [], y: [], lap: [], speed: [], gear: [], throttle: [], brake: [], rpm: [], drs: [] };
  for (const lap of LAPS) {
    const row = laps.find((item) => item.drv === finish.drv && item.lap === lap);
    const { tel } = await file(`${finish.drv}/${lap}_tel.json`);
    // Distance round this lap, in outline units. A lap starts and ends a few metres either side of
    // the outline's first point, so the first samples may count as just before it.
    let travelled = null;
    let previous = 0;
    for (let i = 0; i < tel.time.length; i++) {
      const here = alongOutline(tel.x[i], tel.y[i]);
      if (travelled === null) travelled = here > round1 / 2 ? here - round1 : here;
      else {
        let step = here - previous;
        if (step < -round1 / 2) step += round1;
        // A car never goes backwards; a step back is noise in the position.
        travelled += Math.max(0, step);
      }
      previous = here;
      const t = round(row.lST + tel.time[i] - zero, 3);
      // A lap's last sample and the next lap's first are the same moment at the line.
      if (samples.t.length && t <= samples.t.at(-1)) continue;
      samples.t.push(t);
      samples.x.push(round(tel.x[i], 1));
      samples.y.push(round(tel.y[i], 1));
      // How far round the track, as a lap count: 52.5 is halfway through lap 52.
      samples.lap.push(round(lap + travelled / round1, 6));
      samples.speed.push(Math.round(tel.speed[i]));
      samples.gear.push(tel.gear[i]);
      samples.throttle.push(Math.round(tel.throttle[i]));
      samples.brake.push(tel.brake[i] ? 1 : 0);
      samples.rpm.push(Math.round(tel.rpm[i]));
      samples.drs.push(tel.drs[i] ? 1 : 0);
    }
  }
  drivers.push({
    code: finish.drv,
    number: who.dn,
    first: who.fn,
    last: who.ln,
    team: who.team,
    colour: `#${who.tc.toLowerCase()}`,
    position: index + 1,
    // As published: the winner's race time, everyone else's gap to it, and where they started.
    official: (() => {
      const row = classified.find((item) => item.number === who.dn);
      if (!row || Number(row.positionOrder) !== index + 1) throw new Error(`The official result disagrees about ${finish.drv}.`);
      return { time: row.time, behind: (Number(row.milliseconds) - Number(classified.find((item) => item.positionOrder === '1').milliseconds)) / 1000, grid: Number(row.grid) };
    })(),
    // When this car took the flag, and how far behind the winner.
    finish: round(finish.sesT - zero, 3),
    gap: round(finish.sesT - finishers[0].sesT, 3),
    laps: laps
      .filter((item) => item.drv === finish.drv && item.lap >= lastLap - 9)
      .map((item) => ({
        lap: item.lap,
        start: round(item.lST - zero, 3),
        end: round(item.sesT - zero, 3),
        time: number(item.time),
        s1: number(item.s1),
        s2: number(item.s2),
        s3: number(item.s3),
        s1End: typeof item.s1T === 'number' ? round(item.s1T - zero, 3) : null,
        s2End: typeof item.s2T === 'number' ? round(item.s2T - zero, 3) : null,
        position: number(item.pos),
        compound: item.compound,
        tyreLaps: number(item.life),
        trap: number(item.vst),
      })),
    samples,
  });
}

// Each driver's best lap of the whole race, for the fastest-lap line.
const best = (code) =>
  laps
    .filter((item) => item.drv === code && typeof item.time === 'number')
    .reduce((a, b) => (b.time < a.time ? b : a));
const fastest = driverTable.drivers
  .filter((driver) => laps.some((item) => item.drv === driver.driver && typeof item.time === 'number'))
  .map((driver) => best(driver.driver))
  .reduce((a, b) => (b.time < a.time ? b : a));

const snapshot = {
  source: SOURCE,
  results: RESULTS,
  laps: lastLap,
  fastestLap: { code: fastest.drv, lap: fastest.lap, time: fastest.time },
  circuit: {
    // The outline and every position are in tenths of a metre, as the timing feed gives them.
    outline: circuit.TrackX.map((x, i) => [Math.round(x), Math.round(circuit.TrackY[i])]),
    // Degrees that turn the outline the way circuit maps are usually drawn.
    rotation: circuit.Rotation,
    corners: circuit.CornerNumber.map((n, i) => ({
      label: circuit.CornerLabel?.[i] ?? String(n),
      x: Math.round(circuit.X[i]),
      y: Math.round(circuit.Y[i]),
      angle: round(circuit.Angle[i], 1),
      distance: Math.round(circuit.Distance[i]),
    })),
  },
  drivers,
};
const out = new URL('race-telemetry-snapshot.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(snapshot)}\n`);
console.log(
  `${drivers.length} cars, ${drivers.reduce((sum, driver) => sum + driver.samples.t.length, 0)} samples, ` +
    `${(readFileSync(out).length / 1024).toFixed(0)} KB`,
);
for (const driver of drivers)
  console.log(
    `${String(driver.position).padStart(2)} ${driver.code} ${driver.team.padEnd(14)} ${driver.colour} flag at ${driver.finish.toFixed(3)} ` +
      `+${driver.gap.toFixed(3)}  samples ${driver.samples.t[0]} .. ${driver.samples.t.at(-1)}`,
  );
