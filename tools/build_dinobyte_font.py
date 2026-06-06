#!/usr/bin/env python3
"""Build a small web font from mby's DINOBYTE bitmap glyph sheet."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, "/tmp/codex-fonttools")

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/fonts/dinobyte/dbyte_2x.png"
OUT_DIRS = [
    ROOT / "assets/fonts/dinobyte",
    ROOT / "public/assets/fonts/dinobyte",
]

FAMILY = "Dinobyte Web"
UNITS_PER_EM = 1024
CELL_W = 12
CELL_H = 16
SCALE = 64
BASELINE = 2 * SCALE
ADVANCE = CELL_W * SCALE
ASCENT = (CELL_H * SCALE) - BASELINE
DESCENT = -BASELINE


def glyph_for_cell(image: Image.Image, index: int):
    col = index % 16
    row = index // 16
    left = col * CELL_W
    top = row * CELL_H
    pen = TTGlyphPen(None)

    for py in range(CELL_H):
        for px in range(CELL_W):
            if image.getpixel((left + px, top + py))[3] == 0:
                continue

            x0 = px * SCALE
            x1 = x0 + SCALE
            y0 = (CELL_H - py - 1) * SCALE - BASELINE
            y1 = y0 + SCALE

            pen.moveTo((x0, y0))
            pen.lineTo((x1, y0))
            pen.lineTo((x1, y1))
            pen.lineTo((x0, y1))
            pen.closePath()

    return pen.glyph()


def codepage_437_chars() -> dict[int, str]:
    chars: dict[int, str] = {}
    for index in range(32, 256):
        char = bytes([index]).decode("cp437")
        if ord(char) not in chars:
            chars[ord(char)] = char
    return chars


def build_font(output_path: Path, flavor: str | None = None) -> None:
    image = Image.open(SOURCE).convert("RGBA")
    if image.size != (CELL_W * 16, CELL_H * 16):
        raise ValueError(f"Unexpected Dinobyte sheet size: {image.size}")

    cmap = codepage_437_chars()
    glyph_order = [".notdef"]
    glyphs = {".notdef": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (ADVANCE, 0)}
    character_map: dict[int, str] = {}

    for unicode_value, char in cmap.items():
        index = char.encode("cp437")[0]
        glyph_name = f"uni{unicode_value:04X}"
        glyph_order.append(glyph_name)
        glyphs[glyph_name] = glyph_for_cell(image, index)
        metrics[glyph_name] = (ADVANCE, 0)
        character_map[unicode_value] = glyph_name

    builder = FontBuilder(UNITS_PER_EM, isTTF=True)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap(character_map)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    builder.setupOS2(
        sTypoAscender=ASCENT,
        sTypoDescender=DESCENT,
        sTypoLineGap=0,
        usWinAscent=ASCENT,
        usWinDescent=abs(DESCENT),
    )
    builder.setupNameTable(
        {
            "familyName": FAMILY,
            "styleName": "Regular",
            "uniqueFontIdentifier": f"{FAMILY} Regular",
            "fullName": f"{FAMILY} Regular",
            "psName": "DinobyteWeb-Regular",
            "version": "Version 1.0; converted from DINOBYTE by mby",
        }
    )
    builder.setupPost()
    builder.setupMaxp()

    font = builder.font
    font.flavor = flavor
    font.save(output_path)


def main() -> None:
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        build_font(out_dir / "dinobyte-web.ttf")
        build_font(out_dir / "dinobyte-web.woff", "woff")


if __name__ == "__main__":
    main()
