# NFX-DC — Mono-to-Stereo Decorrelator

By **minimal**. **r0001 / v0.1 DEV**, MDS 1.1 / MDX X.20-C, 44.1 kHz.
Adds stereo width to a mono source by combining its original output with
a decorrelated copy. Especially useful for turning mono reverbs into stereo
returns. Four fixed allpass stages change phase and timing without modulation.

## Setup

1. Put the mono reverb on **track T** and **NFX-DC directly after it on T+1**.
   Keep any source feeding the reverb in its existing position.
2. Trigger the reverb and NFX-DC. After its first trigger, the decorrelator
   processes continuously. Retriggering preserves its running state.
3. Pan the reverb **left** and NFX-DC **right**, with similar track levels.
   Move both PAN settings symmetrically toward the centre for less width.
4. Start with neutral track effects on both returns. A fully wet mono reverb
   is ideal; any dry component in its output is also decorrelated.

NFX-DC has **no synth controls**. Use the normal MD PAN and LEVEL controls
to set width and balance. The two tracks each produce a mono signal; their
panning creates the stereo result. No UW RAM slot or firmware STEREO PAIR
feature is required. Each NFX-DC instance uses its own track memory.

## Routing and mono compatibility

The Neighbor input reads the preceding track before its track effects,
LEVEL and PAN. Lowering the source track's LEVEL does not stop the feed to
NFX-DC. The global reverb return cannot feed the Neighbor input.

Summing the two returns to mono can colour the sound. Leave headroom:
allpass processing can produce higher peaks even at nominal unity gain.

## Development status and sources

This is the unchanged **Quick-checked r0001** development package, with
35 targeted DSP checks recorded in the original project. It is not
release-certified. Cycle declarations are provisional. No complete firmware
emulator run or physical-hardware validation was performed for this revision.

The on-device name remains **DEV NFX-DC**. `NFX-DC.syx` is a byte-identical copy
of `artifacts/machines/nfx-dc/revisions/r0001/build/machine.syx` in the original
project; its default target is U03. WebLoader retargets it to the selected slot.
The English card follows the package metadata and original documentation.
No new DSP code, firmware or ROM file is included.

Sources and fonts are pinned in `scripts/data/minimal-nfx-dc-sources.json`
and referenced by `toolchain.lock.json`. To reproduce the card and import:

```powershell
python scripts/import_minimal_nfx_dc.py "PATH/Machinedrum Development"
npm run build
```

Requires Node.js 22.18 or newer, Python with `Pillow==12.0.0`, and the pinned
Windows Arial/Consolas fonts. Use `--font-dir` for another font directory.
The report is saved in `artifacts/minimal-nfx-dc-import/manifest.json`.
