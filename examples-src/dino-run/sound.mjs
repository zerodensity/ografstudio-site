// The sound effects, made here from square waves, sine waves and noise. Original sounds, made for this template.
//   node sound.mjs      writes each one as a .wav into sounds/ to listen to
import { mkdirSync, writeFileSync } from 'node:fs';
import { seeded } from './png.mjs';

const RATE = 22050;
const TAU = Math.PI * 2;

/** One voice: a wave whose pitch slides from `from` to `to`, with a quick start and a fade. */
function voice({ seconds, from, to = from, shape = 'square', volume = 0.4, attack = 0.004, fade = 1.5, duty = 0.5, wobble = 0, wobbleRate = 0, hold = 0 }) {
  const count = Math.round(seconds * RATE);
  const out = new Float32Array(count);
  const random = seeded(Math.round(from * 7 + to * 3 + seconds * 1000));
  let phase = 0;
  let held = 0;
  let heldFor = 0;
  for (let i = 0; i < count; i++) {
    const time = i / RATE;
    const progress = i / count;
    const pitch = (from + (to - from) * progress) * (1 + wobble * Math.sin(TAU * wobbleRate * time));
    phase += pitch / RATE;
    const turn = phase % 1;
    let sample;
    if (shape === 'square') sample = turn < duty ? 1 : -1;
    else if (shape === 'triangle') sample = 4 * Math.abs(turn - 0.5) - 1;
    else if (shape === 'saw') sample = 2 * turn - 1;
    else if (shape === 'sine') sample = Math.sin(TAU * phase);
    else {
      // Noise that holds each value for a while: a low `from` gives a rumble, a high one a hiss.
      if (heldFor <= 0) {
        held = random() * 2 - 1;
        heldFor = RATE / Math.max(50, pitch);
      }
      heldFor--;
      sample = held;
    }
    const envelope = Math.min(1, time / attack) * Math.pow(Math.max(0, 1 - Math.max(0, time - hold) / (seconds - hold)), fade);
    out[i] = sample * envelope * volume;
  }
  return out;
}
/** Lays voices on top of each other; each entry is [startSeconds, samples]. */
function mix(...parts) {
  const length = Math.max(...parts.map(([start, samples]) => Math.round(start * RATE) + samples.length));
  const out = new Float32Array(length);
  for (const [start, samples] of parts) {
    const offset = Math.round(start * RATE);
    for (let i = 0; i < samples.length; i++) out[offset + i] += samples[i];
  }
  return out;
}
const note = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);

export const SOUNDS = {
  // A short rising chirp.
  jump: mix([0, voice({ seconds: 0.17, from: 300, to: 620, volume: 0.32, fade: 1.2 })]),
  // A falling one, for ducking.
  duck: mix([0, voice({ seconds: 0.12, from: 520, to: 240, volume: 0.26 })]),
  // Feet coming down.
  land: mix([0, voice({ seconds: 0.11, from: 110, to: 55, shape: 'sine', volume: 0.5 })], [0, voice({ seconds: 0.07, from: 900, to: 300, shape: 'noise', volume: 0.18, fade: 2 })]),
  // Two beeps: something is behind you.
  alarm: mix([0, voice({ seconds: 0.07, from: 1320, volume: 0.22 })], [0.11, voice({ seconds: 0.09, from: 1320, volume: 0.22 })]),
  // A big bite.
  chomp: mix([0, voice({ seconds: 0.09, from: 2600, to: 700, shape: 'noise', volume: 0.42, fade: 1.3 })], [0.01, voice({ seconds: 0.13, from: 210, to: 80, volume: 0.34 })]),
  // Chewing.
  munch: mix([0, voice({ seconds: 0.06, from: 1700, to: 600, shape: 'noise', volume: 0.3, fade: 1.6 })], [0, voice({ seconds: 0.07, from: 150, to: 95, volume: 0.22 })]),
  // Down it goes.
  gulp: mix([0, voice({ seconds: 0.11, from: 330, to: 120, shape: 'sine', volume: 0.5, fade: 0.6 })], [0.11, voice({ seconds: 0.13, from: 120, to: 420, shape: 'sine', volume: 0.5, fade: 1.1 })]),
  // One push of growing: two notes up.
  grow: mix([0, voice({ seconds: 0.08, from: note(3), volume: 0.28, duty: 0.25, fade: 0.8 })], [0.07, voice({ seconds: 0.14, from: note(10), volume: 0.28, duty: 0.25 })]),
  // A roar.
  roar: mix(
    [0, voice({ seconds: 0.62, from: 150, to: 78, shape: 'saw', volume: 0.36, wobble: 0.08, wobbleRate: 27, fade: 0.9, hold: 0.25 })],
    [0, voice({ seconds: 0.62, from: 520, to: 260, shape: 'noise', volume: 0.2, fade: 0.9, hold: 0.25 })],
  ),
  // A rock breaking.
  smash: mix([0, voice({ seconds: 0.26, from: 3200, to: 500, shape: 'noise', volume: 0.42, fade: 1.8 })], [0, voice({ seconds: 0.16, from: 140, to: 50, shape: 'sine', volume: 0.45 })]),
  // A beak going into a wall.
  knock: mix([0, voice({ seconds: 0.07, from: 820, to: 260, volume: 0.36, duty: 0.3 })], [0, voice({ seconds: 0.05, from: 2600, to: 1400, shape: 'noise', volume: 0.24, fade: 2 })]),
  // Into the wall.
  crash: mix(
    [0, voice({ seconds: 0.55, from: 2400, to: 180, shape: 'noise', volume: 0.5, fade: 1.6 })],
    [0, voice({ seconds: 0.4, from: 120, to: 36, shape: 'sine', volume: 0.6, fade: 1.2 })],
    [0, voice({ seconds: 0.12, from: 440, to: 200, volume: 0.25 })],
  ),
  // Onto its back.
  thud: mix([0, voice({ seconds: 0.2, from: 95, to: 40, shape: 'sine', volume: 0.6 })], [0, voice({ seconds: 0.1, from: 700, to: 250, shape: 'noise', volume: 0.2, fade: 2 })]),
  // Stars round the head.
  dizzy: mix([0, voice({ seconds: 0.9, from: 1050, to: 950, shape: 'sine', volume: 0.16, wobble: 0.16, wobbleRate: 7, fade: 0.5, hold: 0.5 })]),
  // Something big, far off and coming closer.
  rumble: mix(
    [0, voice({ seconds: 1.9, from: 70, to: 120, shape: 'noise', volume: 0.3, attack: 1.5, fade: 0.3 })],
    [0, voice({ seconds: 1.9, from: 42, to: 58, shape: 'sine', volume: 0.4, attack: 1.5, fade: 0.3 })],
  ),
  // The camera pulling back.
  whoosh: mix([0, voice({ seconds: 1.5, from: 300, to: 2600, shape: 'noise', volume: 0.14, attack: 0.5, fade: 1.4 })]),
  // The word is seen.
  reveal: mix(
    [0, voice({ seconds: 0.14, from: note(3), shape: 'triangle', volume: 0.3, fade: 0.6 })],
    [0.12, voice({ seconds: 0.14, from: note(7), shape: 'triangle', volume: 0.3, fade: 0.6 })],
    [0.24, voice({ seconds: 0.14, from: note(10), shape: 'triangle', volume: 0.3, fade: 0.6 })],
    [0.36, voice({ seconds: 0.7, from: note(15), shape: 'triangle', volume: 0.32, fade: 1.3 })],
    [0.36, voice({ seconds: 0.7, from: note(10), volume: 0.1, duty: 0.25, fade: 1.3 })],
  ),
};

// Keep every sound clear of clipping.
for (const samples of Object.values(SOUNDS)) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0.85) for (let i = 0; i < samples.length; i++) samples[i] *= 0.85 / peak;
}

/** Samples to a 16-bit mono WAV file. */
export function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

if (process.argv[1]?.endsWith('sound.mjs')) {
  mkdirSync('sounds', { recursive: true });
  for (const [name, samples] of Object.entries(SOUNDS)) {
    writeFileSync(`sounds/${name}.wav`, wav(samples));
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    console.log(name.padEnd(8), `${(samples.length / RATE).toFixed(2)} s`, `peak ${peak.toFixed(2)}`, `${Math.round(wav(samples).length / 1024)} KB`);
  }
}
