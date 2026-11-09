---
title: Export and test an OGraf package
sidebar_label: Export and test
sidebar_position: 9
description: Export a checked .ograf.zip for playout, and test it before it goes on air.
---

The editable `.ogs` project is for Studio. Playout systems need an OGraf package: a manifest,
`main.js` and its resources, delivered as `.ograf.zip`.

## 1. Check the graphic

In **Preview & Export**:

- Step through the graphic with **Next step ⏭** and **Take Out**.
- Switch between **realtime** and **non-realtime** preview. Frame-based renderers use non-realtime
  playback, where seeking must give the same frame every time.
- Choose **Run broadcast QA**. It checks safe areas at each Step, minimum text size, packaged fonts,
  backing contrast and long replacement text.

## 2. Export

Choose **File → Export…**, which opens the Export section of **Preview & Export**. Set **Export
format** to **OGraf ZIP** and choose **Export OGraf ZIP**. Pick the thumbnail frame, or **First OGraf
step**, then export. Studio checks the package before writing it: the manifest, the package layout,
the module and its lifecycle in both realtime and non-realtime playback. If a check fails, nothing
is written and Studio tells you why.

**Export profile** sets the playback modes the package offers. A template with a live data
connection starts on **Real-time playout**; choose **Dual-mode package** or **Non-real-time render**
for frame-by-frame rendering.

The ZIP includes a transparent thumbnail referenced from the manifest, and licence files for bundled
third-party code and assets. For a preview anyone can open in a browser, set **Export format** to
the standalone page, or to **Both files** for the ZIP and the page side by side. **Both files** is
the default; change it in **File → Preferences → OGraf Studio → Export**.

To export a whole template set, set **Export scope** to **Template set**. A set that uses
[Transitions](/docs/user-guide/transitions/overview) becomes one coordinated `.ograf.zip`. Any other set
becomes an `.ograf-set.zip` with a checked package for each template. Studio shows its progress while
it prepares and checks the files; choose **Cancel** or press **Esc** to stop.

## 3. Test in your player

Extract the ZIP and load its `.ograf.json` manifest in your OGraf player, renderer or the OGraf
devtool. Before using a graphic in production, check:

- the target renderer and its GPU, especially for shaders;
- fonts on the playout machine, if any aren't packaged;
- real data, including your longest and non-Latin values.

Studio's automated checks are not EBU certification, and can't guarantee compatibility with every
third-party player.

## Bringing a package back into Studio

**Import OGraf** turns a `.ograf.zip` back into an editable project as far as it can, and reports what
it recovered, defaulted or lost. Always keep the `.ogs` source of your own graphics.
