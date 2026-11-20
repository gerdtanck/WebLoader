# minimal — User Machines

- **[NFX-OT](NFX-OT.md)**: mono three-band OTT compressor, r0003 / v0.3,
  with seven controls and internal dry/wet mixing. Quick-checked development build.
- **CROSSFIELD RVB-XA + RVB-XB**: experimental stereo reverb pair, described below.

## CROSSFIELD

**RVB-XA + RVB-XB** form one eight-line, cross-coupled stereo reverb for
**MDX X.20-C / UW**. Use both machines together.

**The pair uses almost all of the MD's DSP capacity. It is designed primarily
as an effect for an external input.** Allow for the input/source machine as
well; this is not intended as an addition to a busy drum kit.

## Setup

1. Load both machines. The supplied files target U01 (XA) and U02 (XB);
   WebLoader can retarget them to the slots you choose.
2. Use consecutive tracks: input/source on **T**, **RVB-XA on T+1**,
   **RVB-XB on T+2**. These are two different programs, not two instances
   of the same machine or the firmware's STEREO PAIR feature.
3. Pan XA fully left and XB fully right. Trigger the source and both returns.
4. Keep **UW RAM slots R1 and R2 empty**. Each half uses 96 KiB. Use one
   CROSSFIELD pair per kit.
5. Adjust all eight reverb controls on **XA**; **XB follows automatically**.
   Track effects, PAN, and LEVEL remain separate for each track.

Both returns are fully wet. Source LEVEL controls the dry signal; the two
return LEVELs control the wet signal. XA reads the source before its track
filter/EQ. SEND 0 stops new input without cutting the tail. Missing RAM or a
missing partner silences the returns. Retriggering preserves the tail.

## Controls on XA

All controls range from 0 to 127. XB has no local reverb parameters.

| Control | Default | Function |
| --- | ---: | --- |
| SEND | 110 | Input send level; zero lets the existing tail decay. |
| TIME | 84 | Feedback 0.35–0.98; higher values decay longer. No freeze. |
| DAMP | 45 | High-frequency damping in all eight feedback paths. |
| LINK | 72 | Cross-coupling of the two networks. Zero separates their feedback, not their stereo output. |
| WDTH | 96 | 0 mono, 64 normal side level, 127 double; mono sum is preserved. |
| DIFF | 100 | Input allpass diffusion. Internal network diffusion remains active at zero. |
| MOD | 64 | Delay modulation: 0 off, 64 about ±3 samples, 127 ±12 samples. |
| RATE | 48 | Base modulation rate 0.02–2 Hz, with different rates and phases on each side. |

LINK is not a simple width or diffusion control. The two networks retain
different delay lengths and shared mid/side output mixing even at LINK 0.

## Development status

These are unchanged **r0001 / v0.1** development packages. Their names on the
device are **DEV RVB-XA** and **DEV RVB-XB**. They use cross-track memory reads
outside the MDS specification. The official Quick certifier rejects this
access: these packages are neither Quick-certified nor release-certified.

The archived evidence contains 39 DSP-fixture checks and 21 checks in the
full X.20-C UW MKII firmware emulator. This is not physical-hardware validation.
No new DSP build, certification or hardware installation was performed for
this library import. Provisional cycle declarations are not certified limits.

## Sources and card generation

Source files are preserved under the original project's
`artifacts/machines/rvb-xa/revisions/r0001/` and
`artifacts/machines/rvb-xb/revisions/r0001/`. The SYX files here are byte-identical
copies of their `build/machine.syx` files. Matching English PNG cards describe
the pair, controls, setup, DSP demand and development status.

Source documentation and package hashes are pinned in
`scripts/data/minimal-rvb-x-sources.json`. The performance/use-case wording
also follows the project owner's instructions of 20 November 2026.

Requires Node.js 22.18 or newer, Python with `Pillow==12.0.0`, and the pinned
Windows Arial/Consolas fonts. From the WebLoader directory:

```powershell
python scripts/import_minimal.py "PATH/Machinedrum Development"
npm run build
```

Use `--font-dir` to select a font directory. The importer checks all source
and font hashes before copying, refuses to replace different SYX files,
and writes its report to `artifacts/minimal-import/manifest.json`.
