"""Import unchanged NFX-DC r0001 and render its English description card.

Requires Node >=22.18, Pillow==12.0.0 and pinned Windows fonts.
python scripts/import_minimal_nfx_dc.py <Machinedrum-Development-directory>
No DSP build or MIDI access.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont
from import_jmamma import digest, inspect

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'artifacts/machines/nfx-dc/revisions/r0001/build/machine.syx'
SETUP = [
    'Place the mono reverb on track T and NFX-DC directly after it on T+1. Keep any source feeding the reverb in its existing position.',
    'Trigger the reverb and NFX-DC. The decorrelator then processes continuously; retriggers preserve its running state.',
    'Pan the reverb left and NFX-DC right, with similar track levels. Move both PAN settings symmetrically toward the centre for less width.',
    'Start with neutral track effects on both returns. A fully wet mono reverb is ideal; any dry component in its output is also decorrelated.',
]


def render_card(info, fonts, target):
    width, margin = 1000, 48
    ink, muted, rule = '#181818', '#555555', '#d6d6d6'
    body = ImageFont.truetype(str(fonts / 'arial.ttf'), 28)
    small = ImageFont.truetype(str(fonts / 'arial.ttf'), 23)
    bold = ImageFont.truetype(str(fonts / 'arialbd.ttf'), 30)
    title = ImageFont.truetype(str(fonts / 'consolab.ttf'), 54)
    mono = ImageFont.truetype(str(fonts / 'consolab.ttf'), 29)
    image = Image.new('RGB', (width, 2400), 'white')
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

    text('minimal  /  MDX X.20-C  /  MDS 1.1', 32, small, fill=muted)
    text('NFX-DC', 78, title)
    draw.text((width - margin, 94), 'v' + info['version'], font=mono, fill=muted, anchor='rt')
    text('MONO-TO-STEREO DECORRELATOR', 150, bold)
    y = paragraph('Adds stereo width to a mono source by pairing its original output with a decorrelated copy. Especially useful for mono reverbs.', 202)
    top, bottom = y + 24, y + 260
    draw.rectangle((margin, top, 448, bottom), outline=ink, width=2)
    draw.rectangle((552, top, width - margin, bottom), outline=ink, width=2)
    for cx, track, name, output, pan in [(248, 'TRACK T', 'MONO REVERB', 'Original output', 'PAN LEFT'),
                                        (752, 'TRACK T+1', 'NFX-DC', 'Decorrelated copy', 'PAN RIGHT')]:
        draw.text((cx, top + 22), track, font=small, fill=muted, anchor='mt')
        draw.text((cx, top + 70), name, font=bold, fill=ink, anchor='mt')
        draw.text((cx, top + 123), output, font=body, fill=ink, anchor='mt')
        draw.text((cx, top + 179), pan, font=mono, fill=ink, anchor='mt')
    draw.line((462, top + 91, 537, top + 91), fill=ink, width=3)
    draw.line((525, top + 82, 537, top + 91, 525, top + 100), fill=ink, width=3)
    y = paragraph('Two mono outputs become a stereo return through track panning.', bottom + 22, small, fill=muted, gap=32)
    y = section('SETUP FOR MONO REVERBS', y + 22)
    for n, instruction in enumerate(SETUP, 1):
        text(str(n) + '.', y, mono)
        y = paragraph(instruction, y, x=91) + 14
    y = section('NO SYNTH CONTROLS', y + 10)
    y = paragraph('Four fixed allpass stages reshape the timing and phase of the source. No modulation or adjustable machine parameters. Use the normal MD PAN and LEVEL controls.', y)
    y = paragraph('NFX-DC uses its own track memory. No UW RAM slot or firmware STEREO PAIR feature is required.', y + 14)
    y = section('ROUTING AND MONO COMPATIBILITY', y + 18)
    y = paragraph('The input is taken before the preceding track\'s effects, LEVEL and PAN. Lowering that track\'s LEVEL does not stop the decorrelator feed. A global reverb return cannot feed the Neighbor input.', y)
    y = paragraph('Summing the two returns to mono can colour the sound. Leave headroom: allpass processing can produce higher peaks even at nominal unity gain.', y + 14)
    y = section('DEVELOPMENT r0001', y + 18)
    y = paragraph('Package name: ' + info['name'] + '. Quick-checked development build with 35 targeted DSP checks. Not release-certified.', y, small, fill=muted, gap=32)
    y = paragraph('Cycle limits are provisional. No complete firmware-emulator run or physical-hardware validation for this revision.', y + 10, small, fill=muted, gap=32)
    assert y + 40 <= image.height
    image.crop((0, 0, width, y + 40)).save(target, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--font-dir', type=Path, default=Path('C:/Windows/Fonts'))
    args = parser.parse_args()
    source = args.source.resolve()
    pins = json.loads((ROOT / 'scripts/data/minimal-nfx-dc-sources.json').read_text(encoding='utf-8'))
    assert PIL.__version__ == '12.0.0', 'Use the pinned Pillow version'
    for path, expected in pins['files_sha256'].items():
        assert digest(source / path) == expected, f'Changed source: {path}'
    for path, expected in pins['fonts_sha256'].items():
        assert digest(args.font_dir / path) == expected, f'Changed font: {path}'
    info = inspect(source, [SOURCE])[0]
    assert info['name'] == 'DEV NFX-DC' and info['version'] == '0.1'
    assert info['category'] == 'NFX' and info['label'] == 'DC'
    assert info['parameters'] == [] and info['originalSlot'] == 3
    target = ROOT / 'machines/minimal/NFX-DC.syx'
    target.parent.mkdir(parents=True, exist_ok=True)
    assert not target.exists() or digest(target) == pins['files_sha256'][SOURCE], 'Refusing to replace changed NFX-DC file'
    target.write_bytes((source / SOURCE).read_bytes())
    render_card(info, args.font_dir, target.with_suffix('.png'))
    output = ROOT / 'artifacts/minimal-nfx-dc-import'
    output.mkdir(parents=True, exist_ok=True)
    record = dict(schema=1, source=SOURCE, revision='r0001', status=pins['status'],
                  file=target.relative_to(ROOT).as_posix(), sysex_sha256=digest(target),
                  png_sha256=digest(target.with_suffix('.png')), info=info)
    (output / 'manifest.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Imported unchanged NFX-DC r0001 and generated its English PNG card.')


if __name__ == '__main__':
    main()
