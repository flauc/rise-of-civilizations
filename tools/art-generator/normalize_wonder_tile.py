#!/usr/bin/env python3
"""Normalize a decor sprite into a 256x384 hex-tile wonder overlay.

Built-wonder tiles share the terrain tile format: a 256x384 canvas whose bottom
256x256 is the hex footprint and whose top 128px is transparent overhang. The
decor prop is centered horizontally and bottom-anchored so it "sits" on the hex,
matching the placement convention of the source tileset's full-tile decor.

Usage: python normalize_wonder_tile.py <src.png> <out.png>
"""
import sys
from PIL import Image

CANVAS_W, CANVAS_H = 256, 384
MAX_W, MAX_H = 252, 348        # bounding box the prop may occupy (downscale only)
BOTTOM_Y = 366                 # y of the prop's base on the canvas


def near_white(px, thresh=235):
    r, g, b, a = px
    return a > 0 and r >= thresh and g >= thresh and b >= thresh


def normalize(src_path, out_path):
    im = Image.open(src_path).convert("RGBA")

    # If the image is essentially opaque (no real alpha), color-key the near-white
    # background out so generated/white-bg props become transparent.
    alpha = im.split()[3]
    if alpha.getextrema()[0] >= 250:  # min alpha ~opaque everywhere
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                if near_white(px[x, y]):
                    r, g, b, _ = px[x, y]
                    px[x, y] = (r, g, b, 0)

    bbox = im.getbbox()
    if bbox is None:
        raise SystemExit(f"{src_path}: image is fully transparent")
    prop = im.crop(bbox)

    # Downscale to fit the bounding box (never upscale — keep native crispness).
    scale = min(MAX_W / prop.width, MAX_H / prop.height, 1.0)
    if scale < 1.0:
        prop = prop.resize(
            (max(1, round(prop.width * scale)), max(1, round(prop.height * scale))),
            Image.LANCZOS,
        )

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    px_x = (CANVAS_W - prop.width) // 2
    px_y = BOTTOM_Y - prop.height
    canvas.alpha_composite(prop, (px_x, px_y))
    canvas.save(out_path)
    print(f"{src_path} -> {out_path}  prop {prop.width}x{prop.height} at ({px_x},{px_y})")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: normalize_wonder_tile.py <src.png> <out.png>")
    normalize(sys.argv[1], sys.argv[2])
