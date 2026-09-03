#!/usr/bin/env python3
"""Normalize a multi-tile natural wonder painting into the game's sprite format.

A multi-tile natural wonder (the Amazon, the Grand Canyon) is ONE painting that
spans several hexes. The renderer draws it from the wonder's ANCHOR tile using
only the footprint declared in NATURAL_WONDER_DEFS, so the sprite has to obey a
fixed contract (see naturalWonderSpriteRect in packages/client/src/renderer.ts):

  * width  == (footprint bounding box width + 2 * 0.125) tile widths
  * bottom == the bottom vertex of the footprint's LOWEST row
  * height == free: everything above the footprint is upward overhang

The generated painting arrives on a big square canvas with the hex ground planes
somewhere in the middle, so this script measures the art instead of trusting it:
the deepest points of the alpha silhouette are the bottom vertices of the lowest
row of hexes, which give both the tile width and the anchor position. From those
it crops/pads to the contract above and scales to TILE_PX per tile.

Usage:
  python normalize_multitile_wonder.py <src.png> <out.png> <tiles...>

  <tiles...> is the footprint as q,r axial offsets, anchor first, exactly as the
  wonder's `footprint` in packages/data/src/index.ts. For example:

  # Grand Canyon: anchor + its eastern neighbour
  python normalize_multitile_wonder.py Grand_Canyon.png grand_canyon.png 0,0 1,0

  # Amazon: two tiles, plus two more on the row above shifted north-east
  python normalize_multitile_wonder.py Amazon.png amazon_rainforest.png 0,0 1,0 1,-1 2,-1
"""
import sys

from PIL import Image

# One tile is TILE_PX wide in the output sprite (the one-tile format is 256).
TILE_PX = 256
# Sideways bleed per side, in tile widths. MUST match MULTI_TILE_WONDER_SIDE_BLEED.
SIDE_BLEED = 0.125
# Alpha at or above this counts as painted art.
OPAQUE = 128


def axial_screen(q, r, w):
    """Screen offset of tile (q,r) from the anchor, in pixels, for tile width w."""
    return (w * (q + r / 2), w * 0.75 * r)


def bottom_profile(alpha, width, height):
    """For each column, the lowest painted row (-1 when the column is empty)."""
    px = alpha.load()
    out = []
    for x in range(width):
        low = -1
        for y in range(height - 1, -1, -1):
            if px[x, y] >= OPAQUE:
                low = y
                break
        out.append(low)
    return out


def bottom_vertices(profile):
    """The x of each deepest point of the silhouette: one per hex on the lowest row.

    Hexes on the bottom row each dip to a single lowest vertex, with a shallower
    notch between neighbours, so the deepest points are ~one tile width apart.
    """
    deepest = max(profile)
    xs = [x for x, y in enumerate(profile) if y >= deepest - 2]
    groups = []
    for x in xs:
        if groups and x - groups[-1][-1] <= 40:
            groups[-1].append(x)
        else:
            groups.append([x])
    return [sum(g) / len(g) for g in groups]


def normalize(src_path, out_path, offsets):
    im = Image.open(src_path).convert("RGBA")
    alpha = im.split()[3]
    profile = bottom_profile(alpha, im.width, im.height)
    if max(profile) < 0:
        raise SystemExit(f"{src_path}: image is fully transparent")

    verts = bottom_vertices(profile)
    bottom_row = sorted({r for _, r in offsets})[-1]
    expected = sum(1 for _, r in offsets if r == bottom_row)
    if len(verts) != expected:
        raise SystemExit(
            f"{src_path}: found {len(verts)} bottom hex vertices at x={[round(v) for v in verts]} "
            f"but the footprint's lowest row has {expected} tile(s). Check the footprint "
            f"argument, or the art's ground planes."
        )

    if len(verts) >= 2:
        tile_w = (verts[-1] - verts[0]) / (len(verts) - 1)
    else:
        # A single-hex bottom row: fall back to the silhouette's own vertical extent,
        # which for one squished hex is exactly one tile width.
        cols = [x for x, y in enumerate(profile) if y >= 0]
        tile_w = max(cols) - min(cols) + 1
    anchor_x = verts[0]
    anchor_y = max(profile) - tile_w / 2  # bottom vertex sits tile_w/2 below centre

    # The footprint's bounding box, relative to the anchor tile's centre.
    left = min(axial_screen(q, r, tile_w)[0] for q, r in offsets) - tile_w / 2
    right = max(axial_screen(q, r, tile_w)[0] for q, r in offsets) + tile_w / 2
    bottom = max(axial_screen(q, r, tile_w)[1] for q, r in offsets) + tile_w / 2

    bleed = tile_w * SIDE_BLEED
    crop_left = round(anchor_x + left - bleed)
    crop_right = round(anchor_x + right + bleed)
    crop_bottom = round(anchor_y + bottom)
    # Keep every painted row above the footprint: that is the wonder's overhang. The
    # crop never starts below the footprint's own top edge, so the sprite always
    # covers at least the hexes the wonder stands on.
    footprint_top = min(axial_screen(q, r, tile_w)[1] for q, r in offsets) - tile_w / 2
    art_top = im.getbbox()[1]
    crop_top = min(art_top, round(anchor_y + footprint_top))

    # Crop with padding: `Image.crop` fills out-of-bounds areas as transparent.
    sprite = im.crop((crop_left, crop_top, crop_right, crop_bottom))
    scale = (TILE_PX * (right - left + bleed * 2) / tile_w) / sprite.width
    out_w = round(sprite.width * scale)
    out_h = round(sprite.height * scale)
    sprite = sprite.resize((out_w, out_h), Image.LANCZOS)
    sprite.save(out_path)

    tiles_wide = (right - left + bleed * 2) / tile_w
    tiles_tall = (bottom - footprint_top) / tile_w
    print(
        f"{src_path} -> {out_path}\n"
        f"  measured tile width {tile_w:.1f}px, {len(verts)} hex(es) on the bottom row,\n"
        f"  anchor bottom vertex at ({anchor_x:.0f},{max(profile)})\n"
        f"  sprite {out_w}x{out_h}px = {tiles_wide:.3f} tiles wide, "
        f"{out_h / TILE_PX:.2f} tile heights tall "
        f"({out_h / TILE_PX - tiles_tall:.2f} of it overhang)"
    )


def main(argv):
    if len(argv) < 4:
        raise SystemExit(__doc__)
    src, out = argv[1], argv[2]
    offsets = []
    for arg in argv[3:]:
        q, r = arg.split(",")
        offsets.append((int(q), int(r)))
    if offsets[0] != (0, 0):
        raise SystemExit("the first tile of a footprint must be the anchor, 0,0")
    normalize(src, out, offsets)


if __name__ == "__main__":
    main(sys.argv)
