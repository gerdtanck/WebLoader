# RVB-MR — Mono / Stereo Neighbor Reverb

By **minimal**. **r0001 / v0.1 DEV**, MDS 1.1 / MDX X.20-C, 44.1 kHz.
Requires **UW RAM**. Fully wet reverb based on the reverb of Mutable Instruments
Rings (MIT), retaining four input allpasses and both coupled reverb branches.
LCUT filters both feedback branches after HCUT, including an existing tail.

## Setup

1. **Mono:** source on track T, RVB-MR on T+1. Keep UW RAM slot **R1 empty**.
2. **Stereo:** assign the same loaded RVB-MR machine to **T+1 and T+2**.
   Pan the first reverb track hard left and the second hard right.
   Keep **R1 and R2 empty**; left borrows R1 and right borrows R2.
3. Match all eight controls and parameter locks on both reverb tracks manually.
   The host does not synchronize them. Track 16 cannot pair with track 1.
   Use **one stereo pair or one mono instance per kit**.
4. Trigger each reverb track once, and again after reassignment or Panic.
   Set dry/wet balance with source and return LEVEL. SEND controls new input,
   not the reverb output level.

The Neighbor input is taken before source track effects. The dry source
remains audible unless its LEVEL is reduced. Both stereo instances process
the same source independently; stereo therefore uses two processing instances.

Startup clears delay memory over 43 blocks, about 31 ms. Missing, occupied
or insufficient UW RAM produces silence. When the memory becomes available
again, the machine clears it and resumes automatically. Keep the reserved
RAM slots free throughout use.

## Controls

All values range from 0 to 127. Defaults are shown below.

| Control | Default | Function |
| --- | ---: | --- |
| SEND | 127 | Quadratic input send, gain 0–0.2. Zero stops new input while the tail decays. |
| SIZE | 127 | Delay lengths from 25 to 100%. A full sweep takes about 4.46 seconds. |
| TIME | 64 | Nominal RT60 range 0.3–60 seconds; 64 is about 4.33 s. Actual decay also depends on diffusion, filters and modulation. |
| DIFF | 99 | Allpass coefficient 0–0.8; default is about 0.624. |
| LCUT | 0 | OFF, otherwise logarithmic 20–500 Hz. High-pass in both feedback branches after HCUT; 91 is about 201 Hz. |
| HCUT | 54 | Feedback low-pass coefficient 0.3–1. Higher is brighter; 127 = OFF. |
| WARP | 32 | Quadratic depth of fixed 0.5 / 0.3 Hz modulation. Default is approximately the original depth; 127 is 16 times deeper. |
| WDTH | 127 | 0 = mono, 127 = separate Rings outputs. A single instance always sums to mono. |

Controls and locks affect a running tail. SEND, TIME and width ramp over
32 samples; DIFF, HCUT and LCUT are smoothed over about 5 ms. SIZE changes
deliberately slowly in this revision. WARP changes are also rate-limited.

## Development status

This is the unchanged **Quick-checked r0001** development package, with
**23 DSP functional checks** recorded in the original project. It is **not
release-certified**. No full firmware-emulator run or physical-hardware
validation was performed for this revision.

The DSP performance target was not met. The measured running path used
15,991 cycles on simulated MKII, 17,146 on MKI DRAM and 15,656 on MKI SRAM
per instance and 32-sample block. Package declarations include provisional
headroom; these are not certified worst-case limits. The normal Quick run
only reaches memory clearing, so the original exporter used an additional
longer DSP run to measure the active reverb path. Multi-track capacity remains
unverified.

LCUT at about 200 Hz passed its low-frequency decay-shortening check. At
LCUT OFF, the measured 63 Hz tail was about 25% longer than the 1 kHz tail,
outside the intended 20% tolerance. Full stability, RT60, SIZE and width
validation remain incomplete. These open criteria are retained as limitations.

## Sources, attribution and reproduction

The on-device name remains **DEV RVB-MR**. `RVB-MR.syx` is a byte-identical copy
of `artifacts/machines/rvb-mr/revisions/r0001/build/machine.syx` in the original
project. Its default target is U01; WebLoader retargets it to the selected slot.
No new DSP build, hardware installation, firmware or ROM file is included.

Algorithm based on the reverb of **Mutable Instruments Rings**.
Copyright 2014 **Emilie Gillet**, MIT. The full original notice is preserved
in [RVB-MR.LICENSE.txt](RVB-MR.LICENSE.txt) and included in the published site.

Source documents, package, license and fonts are pinned in
`scripts/data/minimal-rvb-mr-sources.json`, referenced by `toolchain.lock.json`.
To reproduce the import and English card:

```powershell
python scripts/import_minimal_rvb_mr.py "PATH/Machinedrum Development"
npm run build
```

Requires Node.js 22.18 or newer, Python with `Pillow==12.0.0`, and the pinned
Windows Arial/Consolas fonts. Use `--font-dir` for another font directory.
The report is saved in `artifacts/minimal-rvb-mr-import/manifest.json`.
