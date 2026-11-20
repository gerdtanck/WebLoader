"""Import the pinned CROSSFIELD r0001 pair and render its English cards.

Requires Node >=22.18 and Pillow==12.0.0. No DSP build or MIDI access.
python scripts/import_minimal.py <Machinedrum-Development-directory>
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
WIDTH, MARGIN = 1000, 48
INK, MUTED, LINE = '#181818', '#555555', '#d6d6d6'
CONTROL_TEXT = {
    'SEND': 'Input send level. Zero stops new input and lets the existing tail decay.',
    'TIME': 'Feedback from 0.35 to 0.98. Higher values give longer tails; no freeze.',
    'DAMP': 'High-frequency damping in all eight feedback paths. Higher is darker.',
    'LINK': 'Cross-coupling between the two networks. Zero separates their feedback, not the stereo output.',
    'WDTH': 'Stereo width: 0 mono, 64 normal side level, 127 double. Preserves the mono sum.',
    'DIFF': 'Input allpass diffusion. At zero, diffusion within the reverb network remains active.',
    'MOD': 'Delay modulation depth: 0 off, 64 about +/-3 samples, 127 +/-12 samples.',
    'RATE': 'Modulation base rate, 0.02-2 Hz, with different rates and phases on each side.',
}
WARNING = "The pair uses almost all of the MD's DSP capacity. Designed primarily as an effect for an external input."
SETUP = [
    'Use both machines on consecutive tracks: input/source on T, RVB-XA on T+1, RVB-XB on T+2.',
    'Pan XA fully left and XB fully right. Trigger the source and both reverb tracks.',
    'All eight reverb controls are on XA. XB follows automatically; track PAN and LEVEL remain separate.',
    'UW required. Keep RAM slots R1 and R2 empty. Use one CROSSFIELD pair per kit.',
    'Both returns are fully wet. Source LEVEL sets dry level; the two return LEVELs set wet level.',
]


def render_card(info, role, fonts, destination):
    body = ImageFont.truetype(str(fonts / 'arial.ttf'), 28)
    small = ImageFont.truetype(str(fonts / 'arial.ttf'), 23)
    bold = ImageFont.truetype(str(fonts / 'arialbd.ttf'), 30)
    title = ImageFont.truetype(str(fonts / 'consolab.ttf'), 54)
    mono = ImageFont.truetype(str(fonts / 'consolab.ttf'), 29)
    image = Image.new('RGB', (WIDTH, 3200), 'white')
    draw = ImageDraw.Draw(image)

    def line(value, y, font=body, x=MARGIN, fill=INK):
        assert draw.textlength(value, font=font) <= WIDTH - MARGIN - x, value
        draw.text((x, y), value, font=font, fill=fill, anchor='lt')

    def paragraph(value, y, font=body, x=MARGIN, fill=INK, gap=37):
        current = ''
        for word in value.split():
            candidate = (current + ' ' + word).strip()
            if draw.textlength(candidate, font=font) > WIDTH - MARGIN - x:
                line(current, y, font, x, fill)
                y += gap
                current = word
            else:
                current = candidate
        if current:
            line(current, y, font, x, fill)
            y += gap
        return y

    def section(value, y):
        draw.line((MARGIN, y, WIDTH - MARGIN, y), fill=LINE, width=2)
        line(value, y + 20, bold)
        return y + 68

    code = f'RVB-X{role}'
    line('minimal  /  MDX X.20-C  /  UW', 32, small, fill=MUTED)
    line(code, 78, title)
    draw.text((WIDTH - MARGIN, 94), 'v' + info['version'], font=mono, fill=MUTED, anchor='rt')
    line('CROSSFIELD  /  ' + ('LEFT + CONTROLS' if role == 'A' else 'RIGHT + FOLLOWER'), 150, bold)
    y = paragraph('An eight-line, cross-coupled stereo reverb. Requires the RVB-XA + RVB-XB machine pair.', 202)
    y += 18
    warning_top = y
    # A plain information block keeps the intended use visible before the controls.
    warning_bottom = y + 181
    draw.rectangle((MARGIN, warning_top, WIDTH - MARGIN, warning_bottom), fill='#eeeeee')
    line('HIGH DSP LOAD', y + 18, bold, x=MARGIN + 18)
    y = paragraph(WARNING, y + 65, x=MARGIN + 18, gap=34)
    assert y <= warning_bottom
    y = warning_bottom + 28

    # Exact package sprite and control order, drawn as a technical schematic.
    top, bottom = y, y + 304
    draw.rectangle((MARGIN, top, WIDTH - MARGIN, bottom), outline=INK, width=2)
    draw.line((304, top, 304, bottom), fill=LINE, width=2)
    for x, column in enumerate(info['sprite']):
        for row in range(24):
            if (column >> (row + 8)) & 1:
                px, py = 80 + x * 6, top + 28 + row * 6
                draw.rectangle((px, py, px + 5, py + 5), fill=INK)
    label_y = top + (199 if any(info['sprite']) else 111)
    line(code, label_y, mono, x=80)
    line('PAN LEFT' if role == 'A' else 'PAN RIGHT', label_y + 48, small, x=80, fill=MUTED)
    if role == 'A':
        for i, p in enumerate(info['parameters']):
            left, row_y = 304 + (i % 4) * 162, top + (i // 4) * 152
            cx, cy = left + 81, row_y + 82
            draw.text((cx, row_y + 14), p['name'], font=mono, fill=INK, anchor='mt')
            draw.ellipse((cx - 27, cy - 27, cx + 27, cy + 27), outline=INK, width=2)
            angle = math.radians(135 + 270 * (p['default'] - p['min']) / (p['max'] - p['min']))
            draw.line((cx, cy, cx + 23 * math.cos(angle), cy + 23 * math.sin(angle)), fill=INK, width=3)
            draw.text((cx, row_y + 120), str(p['default']), font=small, fill=INK, anchor='mt')
    else:
        line('CONTROLLED BY RVB-XA', top + 85, bold, x=338)
        paragraph('No local reverb controls. XB follows all eight settings on XA.', top + 139, x=338)
    y = section('PAIR SETUP', bottom + 34)
    for i, instruction in enumerate(SETUP, 1):
        line(str(i) + '.', y, mono)
        y = paragraph(instruction, y, x=91) + 14
    y = section('CONTROLS ON RVB-XA' if role == 'A' else 'RVB-XB ROLE', y + 10)
    if role == 'A':
        line('Default values shown. All controls range from 0 to 127.', y, small, fill=MUTED)
        y += 48
        for p in info['parameters']:
            line(p['name'], y, mono)
            line(str(p['default']), y + 37, small, fill=MUTED)
            end = paragraph(CONTROL_TEXT[p['name']], y, x=205)
            y = max(end, y + 74) + 17
            draw.line((MARGIN, y, WIDTH - MARGIN, y), fill=LINE)
            y += 20
    else:
        y = paragraph('XB runs four of the eight delay lines and produces the right wet return. XA supplies the shared input and all reverb settings.', y)
        y = paragraph('Both halves must run together. Missing RAM or a missing partner silences the returns. Retriggering preserves the tail.', y + 14)
    y = section('EXPERIMENTAL r0001', y + 18)
    y = paragraph('Package name: ' + info['name'] + '. Emulator-tested development build; no physical-hardware validation.', y, small, fill=MUTED, gap=32)
    y = paragraph('Uses cross-track memory reads outside the MDS specification. Not Quick-certified or release-certified.', y + 10, small, fill=MUTED, gap=32)
    height = y + 40
    assert height <= image.height, height
    image.crop((0, 0, WIDTH, height)).save(destination, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Machinedrum Development project root')
    parser.add_argument('--font-dir', type=Path, default=Path('C:/Windows/Fonts'))
    args = parser.parse_args()
    source = args.source.resolve()
    pins = json.loads((ROOT / 'scripts/data/minimal-rvb-x-sources.json').read_text(encoding='utf-8'))
    assert PIL.__version__ == '12.0.0', 'Use the pinned Pillow version'
    for path, expected in pins['files_sha256'].items():
        assert digest(source / path) == expected, f'Changed source: {path}'
    for path, expected in pins['fonts_sha256'].items():
        assert digest(args.font_dir / path) == expected, f'Changed font: {path}'
    paths = [f'artifacts/machines/rvb-x{r}/revisions/r0001/build/machine.syx' for r in ['a', 'b']]
    infos = inspect(source, paths)
    destination = ROOT / 'machines/minimal'
    destination.mkdir(parents=True, exist_ok=True)
    records = []
    for role, path, info in zip(['A', 'B'], paths, infos, strict=True):
        assert info['name'] == f'DEV RVB-X{role}' and info['version'] == '0.1'
        assert info['category'] == 'RVB' and info['label'] == 'X' + role
        assert [p['name'] for p in info['parameters']] == (list(CONTROL_TEXT) if role == 'A' else [])
        assert all(p['min'] == 0 and p['max'] == 127 for p in info['parameters'])
        target = destination / f'RVB-X{role}.syx'
        assert not target.exists() or digest(target) == pins['files_sha256'][path], f'Refusing to replace changed file: {target}'
    for role, path, info in zip(['A', 'B'], paths, infos, strict=True):
        target = destination / f'RVB-X{role}.syx'
        target.write_bytes((source / path).read_bytes())
        render_card(info, role, args.font_dir, target.with_suffix('.png'))
        records.append(dict(source=path, file=target.relative_to(ROOT).as_posix(),
                            sysex_sha256=digest(target), png_sha256=digest(target.with_suffix('.png')), info=info))
    output = ROOT / 'artifacts/minimal-import'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'manifest.json').write_text(json.dumps(dict(schema=1, pair='CROSSFIELD', revision='r0001',
        status=pins['status'], performance_note=WARNING, machines=records), indent=2) + '\n', encoding='utf-8')
    print('Imported 2 unchanged SYX files and generated 2 English description cards.')


if __name__ == '__main__':
    main()
