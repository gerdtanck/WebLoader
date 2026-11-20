# NFX-OT — Mono OTT Neighbor

By **minimal**. **r0003 / v0.3 DEV**, MDS 1.1 / MDX X.20, 44.1 kHz.
Three-band downward and upward compression with shared depth, adjustable
detector response, and internal dry/wet mixing.

## Setup

1. Put the source on track T and **NFX-OT on T+1**. It reads the preceding
   track before its track effects and LEVEL.
2. Trigger NFX-OT once for continuous processing. Retriggers preserve its
   filters and compressor envelopes.
3. Set the **source LEVEL to 0** when using the internal MIX control alone.
   Otherwise the source adds another dry signal outside MIX.
4. Set the blend with MIX and output level with GAIN and the OTT track level.
   After updating, reassign the machine to load its defaults and check MIX.

This is one mono effect machine plus its source track. It requires no partner
machine or UW RAM slot. It uses a substantial share of the kit DSP budget.
The wet processor keeps running at MIX 0, so dry settings do not save DSP time.

## Controls

All values range from 0 to 127. The eighth control position is unused.

| Control | Default | Function |
| --- | ---: | --- |
| DEPT | 0 | Compression depth for all three bands. Zero disables dynamics. |
| THR | 64 | Shared threshold shift; higher values lower thresholds. |
| UP | 0 | Upward compression of quiet signals, scaled by DEPT. Can raise input noise. |
| TIME | 38 | Gain recovery speed. Higher values recover more slowly; full recovery can take seconds. |
| GAIN | 58 | Common output gain: 0 mute, 64 unity, 127 about +12 dB. |
| RESP | 64 | Band-energy smoothing, fast to slow; 64 is about 5 ms. Not a separate attack control. |
| MIX | 127 | Linear blend: 0 dry, 64 about half/half, 127 fully processed. |

**MIX 0 / GAIN 64** passes the source sample-exactly at the machine output.
Subsequent MD track effects and mixer levels still apply. GAIN affects both
dry and wet components. MIX changes are smoothed over one 32-sample block.

DEPT 0 disables dynamic gain changes, but the wet crossover filters, fixed
band shaping, and approximately 49 Hz output high-pass remain active. The
default settings are not a neutral bypass. The dry path bypasses that filtering.
MIX is linear rather than equal-power; wet filter phase can colour intermediate
blends. Upward compression can expose the noise floor of an external input.

## Development status and sources

This is the unchanged **Quick-checked r0003** development package, with
23 targeted DSP checks recorded in the original project. It is not
release-certified. Cycle declarations are provisional. No complete firmware
emulator run or physical-hardware validation was performed for this revision.
Earlier revision tests are not presented as new r0003 tests.

The on-device name remains **DEV NFX-OT**. `NFX-OT.syx` is a byte-identical copy
of `artifacts/machines/nfx-ot/revisions/r0003/build/machine.syx` in the original
project; its default target is U01. WebLoader retargets it to the selected slot.
The English card uses the exact package controls and original documentation.
No new DSP code, original SHRUB binary or firmware file is included.

Sources and fonts are pinned in `scripts/data/minimal-nfx-ot-sources.json`
and referenced by `toolchain.lock.json`. To reproduce the card and import:

```powershell
python scripts/import_minimal_nfx_ot.py "PATH/Machinedrum Development"
npm run build
```

Requires Node.js 22.18 or newer, Python with `Pillow==12.0.0`, and the pinned
Windows Arial/Consolas fonts. Use `--font-dir` for another font directory.
The report is saved in `artifacts/minimal-nfx-ot-import/manifest.json`.
