"""Copy the pinned X.20-C user machines and render their description cards.

Requires Node >=22.18 and Pillow==12.0.0. No MIDI access.
Run from any directory: python scripts/import_jmamma.py /path/to/USR-Machines
The source collection and fonts are checked against data/jmamma-sources.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PIN = ROOT / "scripts/data/jmamma-sources.json"
INK, MUTED, LINE, ACCENT = "#18191b", "#54585f", "#d6d8db", "#ba3027"
WIDTH, MARGIN = 1000, 48


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_descriptions(path):
    rows, family, context = {}, None, None
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "/  " in line:
            family, context = line.split("/", 1)
            family, context = family.strip(), context.strip()
        if line.startswith("| U"):
            slot, filename, name, version, description = [s.strip() for s in line.strip("|").split("|")]
            key = f"{family}/{filename}"
            assert key not in rows, f"Duplicate description: {key}"
            rows[key] = dict(source_slot=slot, name=name, version=version,
                             description=description, family=family, context=context)
    return rows


def inspect(source, paths):
    # Reuse WebLoader's checked decoder; do not introduce a second importer format.
    code = """
import {readFile} from 'node:fs/promises';
import {decodeDump} from './src/protocol.ts';
let input=''; for await (const chunk of process.stdin) input+=chunk;
const out=[];
for(const file of JSON.parse(input)) {
  const {info,slot}=await decodeDump(new Uint8Array(await readFile(file)));
  out.push({...info, originalSlot:slot});
}
console.log(JSON.stringify(out));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT,
                            input=json.dumps([str(source / p) for p in paths]),
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def render_card(machine, description, fonts, destination):
    body = ImageFont.truetype(str(fonts / "arial.ttf"), 28)
    small = ImageFont.truetype(str(fonts / "arial.ttf"), 22)
    bold = ImageFont.truetype(str(fonts / "arialbd.ttf"), 34)
    title = ImageFont.truetype(str(fonts / "consolab.ttf"), 50)
    mono = ImageFont.truetype(str(fonts / "consolab.ttf"), 30)
    numbers = ImageFont.truetype(str(fonts / "consola.ttf"), 28)
    image = Image.new("RGB", (WIDTH, 1800), "white")
    draw = ImageDraw.Draw(image)

    def text(x, y, value, font=body, fill=INK):
        assert draw.textlength(value, font=font) <= WIDTH - MARGIN - x, value
        draw.text((x, y), value, font=font, fill=fill, anchor="lt")

    def paragraph(value, y, font=body, fill=INK, gap=38):
        words, line = value.split(), ""
        for word in words:
            candidate = f"{line} {word}".strip()
            if draw.textlength(candidate, font=font) > WIDTH - 2 * MARGIN:
                text(MARGIN, y, line, font, fill)
                y += gap
                line = word
            else:
                line = candidate
        if line:
            text(MARGIN, y, line, font, fill)
            y += gap
        return y

    code = destination.stem
    text(MARGIN, 34, "jmamma  /  MDX X.20-C USER MACHINES", small, MUTED)
    text(MARGIN, 83, code, title)
    version = f"v{machine['version']}"
    draw.text((WIDTH - MARGIN, 96), version, font=mono, fill=ACCENT, anchor="rt")
    text(MARGIN, 151, machine["name"], bold)

    # Schematic, using the package's original 32 x 24 pixel sprite and control order.
    top, bottom = 212, 538
    draw.rectangle((MARGIN, top, WIDTH - MARGIN, bottom), outline=INK, width=3)
    draw.rectangle((MARGIN, top, MARGIN + 8, bottom), fill=ACCENT)
    draw.line((304, top, 304, bottom), fill=INK, width=2)
    for x, column in enumerate(machine["sprite"]):
        for y in range(24):
            if (column >> (y + 8)) & 1:
                px, py = 80 + x * 6, 242 + y * 6
                draw.rectangle((px, py, px + 5, py + 5), fill=INK)
    text(82, 412, code, mono)
    text(82, 461, "DEFAULTS", small, MUTED)
    params = machine["parameters"]
    for i in range(8):
        left, y = 304 + (i % 4) * 162, top + (i // 4) * 163
        if i % 4:
            draw.line((left, top, left, bottom), fill=LINE)
        if i == 4:
            draw.line((304, y, WIDTH - MARGIN, y), fill=LINE)
        if i >= len(params):
            continue
        param = params[i]
        cx, cy = left + 81, y + 87
        draw.text((cx, y + 16), param["name"], font=mono, fill=INK, anchor="mt")
        draw.ellipse((cx - 29, cy - 29, cx + 29, cy + 29), outline=INK, width=3)
        span = param["max"] - param["min"]
        fraction = (param["default"] - param["min"]) / span if span else 0
        angle = math.radians(135 + 270 * fraction)
        end = (cx + 24 * math.cos(angle), cy + 24 * math.sin(angle))
        draw.line((cx, cy, *end), fill=ACCENT, width=4)
        draw.text((cx, y + 125), str(param["default"]), font=numbers, fill=INK, anchor="mt")

    y = paragraph(description["description"][0].upper() + description["description"][1:] + ".", 578)
    y = paragraph(description["context"] + ".", y + 10, small, MUTED, 31)
    y += 27
    draw.line((MARGIN, y, WIDTH - MARGIN, y), fill=INK, width=2)
    y += 19
    text(MARGIN, y, "CONTROL", small, MUTED)
    text(380, y, "DEFAULT", small, MUTED)
    text(650, y, "VALUE RANGE", small, MUTED)
    y += 44
    for param in params:
        text(MARGIN, y, param["name"], mono)
        text(380, y, str(param["default"]), numbers)
        text(650, y, f"{param['min']} - {param['max']}", numbers)
        y += 42
        draw.line((MARGIN, y, WIDTH - MARGIN, y), fill=LINE)
        y += 16
    y += 16
    y = paragraph("Control names, defaults and numeric ranges are taken directly from the machine package.",
                  y, small, MUTED, 31)
    y += 24
    draw.line((MARGIN, y, WIDTH - MARGIN, y), fill=INK, width=2)
    y += 22
    text(MARGIN, y, "Source: USR-Machines / README.txt + original SYX", small, MUTED)
    y += 34
    text(MARGIN, y, "Description card generated for Machinedrum WebLoader", small, MUTED)
    height = y + 55
    assert height <= image.height
    image.crop((0, 0, WIDTH, height)).save(destination, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--font-dir", type=Path, default=Path("C:/Windows/Fonts"))
    args = parser.parse_args()
    source = args.source.resolve()
    pins = json.loads(PIN.read_text(encoding="utf-8"))
    assert digest(source / "README.txt") == pins["readme_sha256"], "Source README changed"
    paths = sorted(pins["sysex_sha256"])
    assert sorted(p.relative_to(source).as_posix() for p in source.rglob("*.syx")) == paths
    assert len({Path(p).name.lower() for p in paths}) == len(paths), "Colliding filenames"
    for path in paths:
        assert digest(source / path) == pins["sysex_sha256"][path], f"Changed source: {path}"
    for font, sha in pins["fonts_sha256"].items():
        assert digest(args.font_dir / font) == sha, f"Changed font: {font}"
    descriptions = read_descriptions(source / "README.txt")
    assert sorted(descriptions) == paths, "Descriptions do not match source machines"
    infos = inspect(source, paths)
    destination = ROOT / "machines/jmamma"
    destination.mkdir(parents=True, exist_ok=True)
    for path, info in zip(paths, infos, strict=True):
        description = descriptions[path]
        assert description["version"] == info["version"], f"Version mismatch: {path}"
        assert description["name"] == info["name"], f"Name mismatch: {path}"
        assert int(description["source_slot"][1:]) == info["originalSlot"], f"Slot mismatch: {path}"
        target = destination / Path(path).name
        assert not target.exists() or digest(target) == pins["sysex_sha256"][path], f"Refusing to replace changed file: {target}"
    records = []
    for path, info in zip(paths, infos, strict=True):
        target = destination / Path(path).name
        target.write_bytes((source / path).read_bytes())
        render_card(info, descriptions[path], args.font_dir, target.with_suffix(".png"))
        assert digest(target) == pins["sysex_sha256"][path]
        records.append(dict(source=path, file=target.relative_to(ROOT).as_posix(),
                            sysex_sha256=digest(target), png_sha256=digest(target.with_suffix(".png")),
                            info=info, description=descriptions[path]))
    output = ROOT / "artifacts/jmamma-import"
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").write_text(json.dumps(dict(schema=1, machines=records), indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(records)} unchanged SYX files and generated {len(records)} description PNGs.")


if __name__ == "__main__":
    main()
