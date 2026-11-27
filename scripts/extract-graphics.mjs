#!/usr/bin/env node
// Unpacks the OGraf packages in graphics/ so the site can play them with the OGraf web player.
//
//   graphics/<slug>.ograf.zip  ->  static/graphics/<slug>/            extracted package
//                                  static/graphics/<slug>.ograf.zip   download copy
//                                  src/data/graphics.json             manifest URLs for pages
//   examples-src/<slug>.ogs    ->  static/graphics/<slug>.ogs         editable source to download
//
// The home page's reel also gets its script minified in the extracted copy: Studio exports the playback
// code unminified, and that copy is what every visitor's browser fetches and runs. The download stays as
// Studio exported it.
//
// Runs before `npm start` and `npm run build`. Add a graphic by exporting it from Studio with
// Export .ograf.zip and saving it as graphics/<slug>.ograf.zip.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import {minify} from 'terser';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(siteRoot, 'graphics');
const editableDirs = [path.join(siteRoot, 'examples-src'), path.join(siteRoot, 'carousel')];
const outputDir = path.join(siteRoot, 'static', 'graphics');
const indexFile = path.join(siteRoot, 'src', 'data', 'graphics.json');
/** Packages a page plays as it opens, whose script is minified for the browser. */
const MINIFIED_FOR_THE_PAGE = new Set(['feature-reel']);

/** Minifies an exported package's module in place. Licence comments stay, as the licences require. */
async function minifyModule(file) {
  const source = fs.readFileSync(file, 'utf8');
  const {code} = await minify(source, {
    module: true,
    // Custom element and error names are read from classes and functions at run time.
    keep_classnames: true,
    keep_fnames: true,
    format: {comments: /licen[cs]e|copyright|@preserve|^!/i},
  });
  if (!code) throw new Error(`${file}: the minifier returned nothing.`);
  fs.writeFileSync(file, code);
  return [source.length, code.length];
}

fs.rmSync(outputDir, {recursive: true, force: true});
fs.mkdirSync(outputDir, {recursive: true});

const index = {};
const zips = fs.existsSync(sourceDir)
  ? fs.readdirSync(sourceDir).filter((name) => name.endsWith('.ograf.zip')).sort()
  : [];

for (const zipName of zips) {
  const slug = zipName.replace(/\.ograf\.zip$/, '');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${zipName}: use lower-case letters, digits and hyphens.`);
  const bytes = fs.readFileSync(path.join(sourceDir, zipName));
  const packageDir = path.join(outputDir, slug);
  let manifestFile;
  for (const [entry, data] of Object.entries(unzipSync(bytes))) {
    if (entry.endsWith('/')) continue;
    // The exporter adds a standalone preview page. The player never loads it and the zip still has it.
    if (!entry.includes('/') && entry.endsWith('.html')) continue;
    const destination = path.resolve(packageDir, entry);
    // Never write outside the package folder, whatever the archive says.
    if (!destination.startsWith(packageDir + path.sep)) {
      throw new Error(`${zipName}: entry "${entry}" points outside the package.`);
    }
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, data);
    if (!entry.includes('/') && entry.endsWith('.ograf.json')) manifestFile = entry;
  }
  if (!manifestFile) throw new Error(`${zipName}: no .ograf.json manifest at the top level.`);
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, manifestFile), 'utf8'));
  if (MINIFIED_FOR_THE_PAGE.has(slug)) {
    const [before, after] = await minifyModule(path.resolve(packageDir, manifest.main));
    console.log(`Minified ${slug}'s script for the page: ${Math.round(before / 1024)} KiB to ${Math.round(after / 1024)} KiB.`);
  }
  fs.copyFileSync(path.join(sourceDir, zipName), path.join(outputDir, zipName));
  // The editable project, from whichever build script saved one.
  const sourceFile = editableDirs.map((dir) => path.join(dir, `${slug}.ogs`)).find((file) => fs.existsSync(file));
  const hasSource = Boolean(sourceFile);
  if (hasSource) fs.copyFileSync(sourceFile, path.join(outputDir, `${slug}.ogs`));
  index[slug] = {
    name: manifest.name ?? slug,
    manifest: `/graphics/${slug}/${manifestFile}`,
    download: `/graphics/${zipName}`,
    bytes: bytes.length,
    source: hasSource ? `/graphics/${slug}.ogs` : null,
    sourceBytes: hasSource ? fs.statSync(sourceFile).size : 0,
    // Plain values only: what OGrafExample's form can edit.
    fields: Object.values(manifest.schema?.properties ?? {}).filter((field) =>
      ['string', 'number', 'integer', 'boolean'].includes(field.type),
    ).length,
    // The same packages whose timer commands OGrafExample's operatorActions leaves out.
    actions: ['clock', 'race-telemetry'].includes(slug) ? 0 : (manifest.customActions?.length ?? 0) + (Number(manifest.stepCount ?? 1) > 1 ? 1 : 0),
  };
}

const json = `${JSON.stringify(index, null, 2)}\n`;
if (!fs.existsSync(indexFile) || fs.readFileSync(indexFile, 'utf8') !== json) {
  fs.writeFileSync(indexFile, json);
}
console.log(`Unpacked ${zips.length} OGraf packages into static/graphics.`);
