"""Import unchanged NFX-OT r0003 and render its English description card.

Requires Node >=22.18, Pillow==12.0.0 and the pinned Windows fonts.
python scripts/import_minimal_nfx_ot.py <Machinedrum-Development-directory>
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
SOURCE = 'artifacts/machines/nfx-ot/revisions/r0003/build/machine.syx'
CONTROLS = {
    'DEPT': 'Compression depth for all three bands. Zero disables dynamics; wet filtering remains active.',
    'THR': 'Shared threshold shift. Higher values lower the thresholds and increase compression.',
    'UP': 'Upward compression of quiet signals, scaled by DEPT. Can also raise the input noise floor.',
    'TIME': 'Gain recovery speed. Higher values recover more slowly; full recovery can take seconds.',
    'GAIN': 'Output level for both dry and wet. 0 mute, 64 unity, 127 about +12 dB.',
    'RESP': 'Detector smoothing: fast to slow. 64 is about 5 ms. Not a separate attack control.',
    'MIX': 'Linear dry/wet blend: 0 dry, 64 about half/half, 127 fully processed.',
}
SETUP = [
    'Place the source on track T and NFX-OT directly after it on T+1. It reads the source before track effects and LEVEL.',
    'Trigger NFX-OT once for continuous processing. Retriggering preserves filter and compressor states.',
    'For internal dry/wet mixing, set source LEVEL to 0. MIX sets the blend; GAIN and the OTT track level set output volume.',
    'After updating, reassign the machine to load its defaults and check MIX. No partner machine or UW RAM slot is required.',
]


def render_card(info, fonts, target):
    width, margin = 1000, 48
    ink, muted, rule = '#181818', '#555555', '#d6d6d6'
    body = ImageFont.truetype(str(fonts / 'arial.ttf'), 28)
    small = ImageFont.truetype(str(fonts / 'arial.ttf'), 23)
    bold = ImageFont.truetype(str(fonts / 'arialbd.ttf'), 30)
    title = ImageFont.truetype(str(fonts / 'consolab.ttf'), 54)
    mono = ImageFont.truetype(str(fonts / 'consolab.ttf'), 29)
    image = Image.new('RGB', (width, 3200), 'white')
    draw = ImageDraw.Draw(image)

    def text(value, y, font=body, x=margin, fill=ink):
        assert draw.textlength(value, font=font) <= width - margin - x, value
        draw.text((x, y), value, font=font, fill=fill, anchor='lt')

    def paragraph(value, y, font=body, x=margin, fill=ink, gap=37, right=margin):
        line = ''
        for word in value.split():
            candidate = (line + ' ' + word).strip()
            if draw.textlength(candidate, font=font) > width - right - x:
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

    text('minimal  /  MDX X.20  /  MDS 1.1', 32, small, fill=muted)
    text('NFX-OT', 78, title)
    draw.text((width - margin, 94), 'v' + info['version'], font=mono, fill=muted, anchor='rt')
    text('MONO OTT  /  NEIGHBOR COMPRESSOR', 150, bold)
    y = paragraph('Three-band downward and upward compression, with shared depth, detector response and internal dry/wet mixing.', 202)
    y += 18
    bottom = y + 162
    draw.rectangle((margin, y, width - margin, bottom), fill='#eeeeee')
    text('HIGH DSP LOAD', y + 18, bold, x=margin + 18)
    end = paragraph('Uses a substantial share of the kit DSP budget. MIX 0 keeps the wet processor running and does not reduce DSP load.', y + 65, x=margin + 18, right=margin + 18, gap=34)
    assert end <= bottom
    top, bottom = bottom + 28, bottom + 332
    draw.rectangle((margin, top, width - margin, bottom), outline=ink, width=2)
    draw.line((304, top, 304, bottom), fill=rule, width=2)
    if any(info['sprite']):
        for x, column in enumerate(info['sprite']):
            for row in range(24):
                if (column >> (row + 8)) & 1:
                    px, py = 80 + x * 6, top + 28 + row * 6
                    draw.rectangle((px, py, px + 5, py + 5), fill=ink)
    label_y = top + (199 if any(info['sprite']) else 111)
    text('NFX-OT', label_y, mono, x=80)
    text('MONO / T-1', label_y + 48, small, x=80, fill=muted)
    for i, p in enumerate(info['parameters']):
        left, row_y = 304 + (i % 4) * 162, top + (i // 4) * 152
        cx, cy = left + 81, row_y + 82
        draw.text((cx, row_y + 14), p['name'], font=mono, fill=ink, anchor='mt')
        draw.ellipse((cx - 27, cy - 27, cx + 27, cy + 27), outline=ink, width=2)
        angle = math.radians(135 + 270 * (p['default'] - p['min']) / (p['max'] - p['min']))
        draw.line((cx, cy, cx + 23 * math.cos(angle), cy + 23 * math.sin(angle)), fill=ink, width=3)
        draw.text((cx, row_y + 120), str(p['default']), font=small, fill=ink, anchor='mt')
    y = section('SETUP', bottom + 34)
    for n, instruction in enumerate(SETUP, 1):
        text(str(n) + '.', y, mono)
        y = paragraph(instruction, y, x=91) + 14
    y = section('CONTROLS', y + 10)
    text('Default values shown. All controls range from 0 to 127.', y, small, fill=muted)
    y += 48
    for p in info['parameters']:
        text(p['name'], y, mono)
        text(str(p['default']), y + 37, small, fill=muted)
        end = paragraph(CONTROLS[p['name']], y, x=205)
        y = max(end, y + 74) + 17
        draw.line((margin, y, width - margin, y), fill=rule)
        y += 20
    y = section('DRY PASS / WET COLOUR', y + 10)
    y = paragraph('MIX 0 / GAIN 64 passes the source unchanged at the machine output. Downstream MD track effects and levels still apply.', y)
    y = paragraph('DEPT 0 disables compression, not the wet filters: fixed band shaping and the 49 Hz output high-pass remain. The defaults are not a neutral bypass.', y + 14)
    y = section('DEVELOPMENT r0003', y + 18)
    y = paragraph('Package name: ' + info['name'] + '. Quick-checked development build with 23 targeted DSP checks. Not release-certified.', y, small, fill=muted, gap=32)
    y = paragraph('Cycle limits are provisional. No full firmware-emulator run or physical-hardware validation for this revision.', y + 10, small, fill=muted, gap=32)
    assert y + 40 <= image.height
    image.crop((0, 0, width, y + 40)).save(target, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--font-dir', type=Path, default=Path('C:/Windows/Fonts'))
    args = parser.parse_args()
    source = args.source.resolve()
    pins = json.loads((ROOT / 'scripts/data/minimal-nfx-ot-sources.json').read_text(encoding='utf-8'))
    assert PIL.__version__ == '12.0.0', 'Use the pinned Pillow version'
    for path, expected in pins['files_sha256'].items():
        assert digest(source / path) == expected, f'Changed source: {path}'
    for path, expected in pins['fonts_sha256'].items():
        assert digest(args.font_dir / path) == expected, f'Changed font: {path}'
    info = inspect(source, [SOURCE])[0]
    assert info['name'] == 'DEV NFX-OT' and info['version'] == '0.3'
    assert info['category'] == 'NFX' and info['label'] == 'OT'
    assert [p['name'] for p in info['parameters']] == list(CONTROLS)
    assert [p['default'] for p in info['parameters']] == [0, 64, 0, 38, 58, 64, 127]
    assert all(p['min'] == 0 and p['max'] == 127 for p in info['parameters'])
    target = ROOT / 'machines/minimal/NFX-OT.syx'
    target.parent.mkdir(parents=True, exist_ok=True)
    assert not target.exists() or digest(target) == pins['files_sha256'][SOURCE], 'Refusing to replace changed NFX-OT file'
    target.write_bytes((source / SOURCE).read_bytes())
    render_card(info, args.font_dir, target.with_suffix('.png'))
    output = ROOT / 'artifacts/minimal-nfx-ot-import'
    output.mkdir(parents=True, exist_ok=True)
    record = dict(schema=1, source=SOURCE, revision='r0003', status=pins['status'],
                  file=target.relative_to(ROOT).as_posix(), sysex_sha256=digest(target),
                  png_sha256=digest(target.with_suffix('.png')), info=info)
    (output / 'manifest.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Imported unchanged NFX-OT r0003 and generated its English PNG card.')


if __name__ == '__main__':
    main()
