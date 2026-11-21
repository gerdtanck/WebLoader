"""Import unchanged RVB-MR r0001, its license, and an English description card.

Requires Node >=22.18, Pillow==12.0.0 and pinned Windows fonts.
python scripts/import_minimal_rvb_mr.py <Machinedrum-Development-directory>
No DSP build or MIDI access.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont
from import_jmamma import digest, inspect

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'artifacts/machines/rvb-mr/revisions/r0001/build/machine.syx'
LICENSE = 'artifacts/machines/rvb-mr/revisions/r0001/source/LICENSE'
CONTROLS = {
    'SEND': 'Input send, with a quadratic response. Zero stops new input and lets the existing tail decay.',
    'SIZE': 'Delay lengths from 25 to 100%. Changes are slow: a full sweep takes about 4.46 seconds.',
    'TIME': 'Nominal decay range 0.3 to 60 seconds; 64 is about 4.33 s. Actual decay also depends on the other controls.',
    'DIFF': 'Diffusion: allpass coefficient from 0 to 0.8. Default 99 is about 0.624.',
    'LCUT': 'High-pass in both feedback branches, after HCUT. 0 = OFF; otherwise 20 to 500 Hz. Also changes a running tail.',
    'HCUT': 'Feedback low-pass. Higher values make the tail brighter; 127 = OFF.',
    'WARP': 'Modulation depth with fixed 0.5 / 0.3 Hz rates. 32 is approximately the original depth; 127 is 16 times deeper.',
    'WDTH': 'Stereo width: 0 = mono, 127 = separate Rings outputs. A single instance always sums to mono.',
}
SETUP = [
    'Mono: source on track T, RVB-MR on T+1. Keep UW RAM slot R1 empty.',
    'Stereo: assign the same RVB-MR machine to T+1 and T+2. Pan the first hard left and the second hard right. Keep R1 and R2 empty.',
    'Match all eight controls and parameter locks on both reverb tracks manually. Track 16 cannot pair with track 1. Use one pair or one mono instance per kit.',
    'Trigger each reverb track once, and again after reassignment or Panic. Set the dry/wet balance with source and return LEVEL. The input is taken before source track effects.',
]


def render_card(info, fonts, target):
    width, margin = 1000, 48
    ink, muted, rule = '#181818', '#555555', '#d6d6d6'
    body = ImageFont.truetype(str(fonts / 'arial.ttf'), 28)
    small = ImageFont.truetype(str(fonts / 'arial.ttf'), 23)
    bold = ImageFont.truetype(str(fonts / 'arialbd.ttf'), 30)
    title = ImageFont.truetype(str(fonts / 'consolab.ttf'), 54)
    mono = ImageFont.truetype(str(fonts / 'consolab.ttf'), 29)
    image = Image.new('RGB', (width, 3400), 'white')
    draw = ImageDraw.Draw(image)

    def text(value, y, font=body, x=margin, fill=ink):
        assert draw.textlength(value, font=font) <= width - margin - x, value
        draw.text((x, y), value, font=font, fill=fill, anchor='lt')

    def paragraph(value, y, font=body, x=margin, fill=ink, gap=37):
        line = ''
        for word in value.split():
            candidate = (line + ' ' + word).strip()
            if draw.textlength(candidate, font=font) > width - margin - x:
                text(line, y, font, x, fill)
                y += gap
                line = word
            else:
                line = candidate
        if line:
            text(line, y, font, x, fill)
            y += gap
        return y

    def section(label, y):
        draw.line((margin, y, width - margin, y), fill=rule, width=2)
        text(label, y + 20, bold)
        return y + 68

    text('minimal  /  MDX X.20-C  /  MDS 1.1  /  UW required', 32, small, fill=muted)
    text('RVB-MR', 78, title)
    draw.text((width - margin, 94), 'v' + info['version'], font=mono, fill=muted, anchor='rt')
    text('MONO / STEREO NEIGHBOR REVERB', 150, bold)
    y = paragraph('Fully wet reverb based on Mutable Instruments Rings. Four input diffusers and two coupled reverb branches, with low-cut filtering inside both feedback loops.', 202)
    top, bottom = y + 28, y + 332
    draw.rectangle((margin, top, width - margin, bottom), outline=ink, width=2)
    draw.line((304, top, 304, bottom), fill=rule, width=2)
    text('RVB-MR', top + 109, mono, x=80)
    text('100% WET', top + 157, small, x=80, fill=muted)
    for i, p in enumerate(info['parameters']):
        left, row_y = 304 + (i % 4) * 162, top + (i // 4) * 152
        cx, cy = left + 81, row_y + 82
        draw.text((cx, row_y + 14), p['name'], font=mono, fill=ink, anchor='mt')
        draw.ellipse((cx - 27, cy - 27, cx + 27, cy + 27), outline=ink, width=2)
        angle = math.radians(135 + 270 * (p['default'] - p['min']) / (p['max'] - p['min']))
        draw.line((cx, cy, cx + 23 * math.cos(angle), cy + 23 * math.sin(angle)), fill=ink, width=3)
        draw.text((cx, row_y + 120), str(p['default']), font=small, fill=ink, anchor='mt')
    y = section('SETUP / UW RAM', bottom + 34)
    for n, instruction in enumerate(SETUP, 1):
        text(str(n) + '.', y, mono)
        y = paragraph(instruction, y, x=91) + 14
    y = paragraph('Startup clears the delay memory in about 31 ms. Missing or occupied RAM produces silence. Keep the reserved slots free while using the reverb.', y + 4)
    y = section('CONTROLS', y + 18)
    text('Default values shown. All controls range from 0 to 127.', y, small, fill=muted)
    y += 48
    for p in info['parameters']:
        text(p['name'], y, mono)
        text(str(p['default']), y + 37, small, fill=muted)
        end = paragraph(CONTROLS[p['name']], y, x=205)
        y = max(end, y + 74) + 17
        draw.line((margin, y, width - margin, y), fill=rule)
        y += 20
    y = section('DEVELOPMENT r0001', y + 10)
    y = paragraph('Package name: ' + info['name'] + '. Quick-checked development build; 23 DSP functional checks passed. Not release-certified or tested on physical hardware.', y, small, fill=muted, gap=32)
    y = paragraph('The DSP performance target was not met. Stereo uses two processing instances. Cycle declarations are provisional; multi-track capacity is unverified.', y + 10, small, fill=muted, gap=32)
    y = paragraph('The LCUT OFF decay-balance test remains outside its target: about 25% difference between the measured 63 Hz and 1 kHz tails. Full stability and parameter-range validation are pending.', y + 10, small, fill=muted, gap=32)
    y = section('ALGORITHM CREDIT', y + 18)
    y = paragraph('Based on the reverb of Mutable Instruments Rings (MIT). Copyright 2014 Emilie Gillet. Full notice accompanies the SysEx as RVB-MR.LICENSE.txt.', y, small, fill=muted, gap=32)
    assert y + 40 <= image.height
    image.crop((0, 0, width, y + 40)).save(target, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--font-dir', type=Path, default=Path('C:/Windows/Fonts'))
    args = parser.parse_args()
    source = args.source.resolve()
    pins = json.loads((ROOT / 'scripts/data/minimal-rvb-mr-sources.json').read_text(encoding='utf-8'))
    assert PIL.__version__ == '12.0.0', 'Use the pinned Pillow version'
    for path, expected in pins['files_sha256'].items():
        assert digest(source / path) == expected, f'Changed source: {path}'
    for path, expected in pins['fonts_sha256'].items():
        assert digest(args.font_dir / path) == expected, f'Changed font: {path}'
    info = inspect(source, [SOURCE])[0]
    assert info['name'] == 'DEV RVB-MR' and info['version'] == '0.1'
    assert info['category'] == 'RVB' and info['label'] == 'MR' and info['originalSlot'] == 1
    assert [p['name'] for p in info['parameters']] == list(CONTROLS)
    assert [p['default'] for p in info['parameters']] == [127, 127, 64, 99, 0, 54, 32, 127]
    assert all(p['min'] == 0 and p['max'] == 127 for p in info['parameters'])
    target = ROOT / 'machines/minimal/RVB-MR.syx'
    target.parent.mkdir(parents=True, exist_ok=True)
    assert not target.exists() or digest(target) == pins['files_sha256'][SOURCE], 'Refusing to replace changed RVB-MR file'
    target.write_bytes((source / SOURCE).read_bytes())
    license_target = target.with_suffix('.LICENSE.txt')
    license_target.write_bytes((source / LICENSE).read_bytes())
    render_card(info, args.font_dir, target.with_suffix('.png'))
    output = ROOT / 'artifacts/minimal-rvb-mr-import'
    output.mkdir(parents=True, exist_ok=True)
    record = dict(schema=1, source=SOURCE, revision='r0001', status=pins['status'],
                  file=target.relative_to(ROOT).as_posix(), sysex_sha256=digest(target),
                  png_sha256=digest(target.with_suffix('.png')), license_sha256=digest(license_target), info=info)
    (output / 'manifest.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Imported unchanged RVB-MR r0001, its license, and generated its English PNG card.')


if __name__ == '__main__':
    main()
