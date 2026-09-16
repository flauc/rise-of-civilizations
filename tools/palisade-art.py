#!/usr/bin/env python3
"""Prepare the palisade wall set (sides + joint towers) and preview it on a hex grid.

The approach: a wall side is drawn between the two hex corners of its edge, and
a tower is stood on every corner a wall run touches. The towers cover the
joints, so the side pieces only have to reach the corners, never to agree with
each other pixel for pixel.

Source renders (default: ~/Downloads):

    side.png         run heading away from camera   -> hex sides 0 / 3  ("v")
    right-down.png   run rising to the right  "/"   -> hex sides 1 / 4  ("u")
    left-down.png    run falling to the right "\\"  -> hex sides 2 / 5  ("d")
    tower.png        joint tower

    python tools/palisade-art.py                   # export + preview
    python tools/palisade-art.py --src D:/art --size 140
"""

import argparse
import json
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "client", "public", "walls", "palisade")
ALPHA = 24
INSET = 0.1  # fraction of a side hidden under each end's tower
SCALE = 0.4  # common downscale for every exported piece, so relative sizes hold

VSQUISH = math.sqrt(3) / 2  # matches renderer.ts
SIDE_ORIENT = ["v", "u", "d", "v", "u", "d"]
NEIGHBOURS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def load(path):
    return Image.open(path).convert("RGBA")


def opaque(img):
    return np.array(img)[:, :, 3] > ALPHA


def ground_line(m):
    """Least-squares line through the lowest opaque pixel of each column."""
    xs = [x for x in range(m.shape[1]) if m[:, x].any()]
    ys = [int(np.nonzero(m[:, x])[0].max()) for x in xs]
    xs, ys = np.array(xs, float), np.array(ys, float)
    slope, icpt = np.polyfit(xs, ys, 1)
    # Drop the columns that sit well above the line (gaps between pickets) and refit.
    keep = ys > slope * xs + icpt - 25
    slope, icpt = np.polyfit(xs[keep], ys[keep], 1)
    return slope, icpt, int(xs.min()), int(xs.max())


def diagonal_piece(img):
    """Ground points of the two end posts of a run drawn across the screen."""
    m = opaque(img)
    slope, icpt, x0, x1 = ground_line(m)
    post_half = 65  # half an end post's footprint, in source pixels
    lift = 22  # the fitted line runs along the front corners; the posts' centres sit behind
    ax, bx = x0 + post_half, x1 - post_half
    return (ax, slope * ax + icpt - lift), (bx, slope * bx + icpt - lift)


def extend_vertical(img, steps=4, spacing=190):
    """The away-from-camera render packs its pickets tighter than a hex side is
    long, so stack a copy `steps` pickets further back behind it. The far copy
    is drawn first and the near one over it, which is how the pickets overlap."""
    shift = steps * spacing
    out = Image.new("RGBA", (img.width, img.height + shift))
    out.alpha_composite(img, (0, 0))
    out.alpha_composite(img, (0, shift))
    return out, shift


def vertical_piece(img, picket_h=1072):
    m = opaque(img)
    ys, xs = np.nonzero(m)
    cx = (xs.min() + xs.max()) / 2
    lift = 22
    top_tip = ys.min()
    return (cx, top_tip + picket_h - lift), (cx, ys.max() - lift)


def tower_anchor(img):
    """Centre of the tower's footprint: its widest row near the bottom."""
    m = opaque(img)
    ys, xs = np.nonzero(m)
    y0, y1 = ys.min(), ys.max()
    rows = range(int(y0 + (y1 - y0) * 0.7), int(y1) + 1)
    widths = {y: np.ptp(np.nonzero(m[y])[0]) if m[y].any() else 0 for y in rows}
    best = max(widths.values())
    wide = [y for y, w in widths.items() if w >= best - 3]
    return (xs.min() + xs.max()) / 2, sum(wide) / len(wide)


def trim_scale(img, pts):
    """Crop to the silhouette, downscale by SCALE and carry the anchor points along."""
    m = opaque(img)
    ys, xs = np.nonzero(m)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    img = img.crop(box)
    w, h = round(img.width * SCALE), round(img.height * SCALE)
    img = img.resize((w, h), Image.LANCZOS)
    return img, [((x - box[0]) * SCALE, (y - box[1]) * SCALE) for x, y in pts]


def export(src):
    pieces = {}
    side, _ = extend_vertical(load(os.path.join(src, "side.png")))
    pieces["v"] = (side, vertical_piece(side))
    pieces["u"] = (load(os.path.join(src, "right-down.png")),)
    pieces["u"] += (diagonal_piece(pieces["u"][0]),)
    pieces["d"] = (load(os.path.join(src, "left-down.png")),)
    pieces["d"] += (diagonal_piece(pieces["d"][0]),)
    tower = load(os.path.join(src, "tower.png"))

    os.makedirs(OUT, exist_ok=True)
    manifest = {"sides": {}}
    for orient, (img, (a, b)) in pieces.items():
        img, (a, b) = trim_scale(img, [a, b])
        img.save(os.path.join(OUT, f"side_{orient}.png"), optimize=True)
        manifest["sides"][orient] = {
            "w": img.width, "h": img.height,
            "ax": round(a[0], 2), "ay": round(a[1], 2),
            "bx": round(b[0], 2), "by": round(b[1], 2),
        }
    img, [t] = trim_scale(tower, [tower_anchor(tower)])
    img.save(os.path.join(OUT, "tower.png"), optimize=True)
    manifest["tower"] = {"w": img.width, "h": img.height, "ax": round(t[0], 2), "ay": round(t[1], 2)}
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print("wrote", OUT)
    return manifest


# ---------------------------------------------------------------- preview ----


def hex_corners(cx, cy, size):
    return [(cx + size * math.cos(math.radians(60 * i - 30)),
             cy + size * math.sin(math.radians(60 * i - 30)) * VSQUISH) for i in range(6)]


def outward_sides(col, row, owned):
    q = col - (row - (row & 1)) // 2
    sides = []
    for d, (dq, dr) in enumerate(NEIGHBOURS):
        nq, nr = q + dq, row + dr
        if (nq + (nr - (nr & 1)) // 2, nr) not in owned:
            sides.append((6 - d) % 6)
    return sides


def inset(c0, c1, t):
    """Pull both ends of a side in by fraction `t`, so the run stops at the
    footprint of the towers standing on its corners instead of vanishing into them."""
    dx, dy = c1[0] - c0[0], c1[1] - c0[1]
    return (c0[0] + dx * t, c0[1] + dy * t), (c1[0] - dx * t, c1[1] - dy * t)


def side_affine(g, c0, c1, orient):
    """Affine (a, b, c, d, e, f) as in canvas transform(): x' = a x + c y + e,
    y' = b x + d y + f. One uniform scale, plus a vertical shear on diagonal
    pieces so the painted run's slope lands exactly on the hex side."""
    if orient == "v":
        p, q = (c0, c1) if c0[1] <= c1[1] else (c1, c0)
        k = (q[1] - p[1]) / (g["by"] - g["ay"])
        return (k, 0, 0, k, p[0] - k * g["ax"], p[1] - k * g["ay"])
    p, q = (c0, c1) if c0[0] <= c1[0] else (c1, c0)
    k = (q[0] - p[0]) / (g["bx"] - g["ax"])
    shy = ((q[1] - p[1]) - k * (g["by"] - g["ay"])) / (g["bx"] - g["ax"])
    return (k, shy, 0, k, p[0] - k * g["ax"] - 0, p[1] - k * g["ay"] - shy * g["ax"])


def diag_scale(manifest, size):
    g = manifest["sides"]["d"]
    return VSQUISH * size / (g["bx"] - g["ax"])


def preview(manifest, blob, size, tower_scale, pad=60):
    imgs = {o: load(os.path.join(OUT, f"side_{o}.png")) for o in "vud"}
    tower = load(os.path.join(OUT, "tower.png"))
    owned = set(blob)
    sides, towers = [], {}
    for col, row in blob:
        cx = size * math.sqrt(3) * (col + 0.5 * (row & 1))
        cy = size * 1.5 * row * VSQUISH
        cs = hex_corners(cx, cy, size)
        for sd in outward_sides(col, row, owned):
            c0, c1 = cs[sd], cs[(sd + 1) % 6]
            sides.append((SIDE_ORIENT[sd], c0, c1))
            for c in (c0, c1):
                towers[(round(c[0]), round(c[1]))] = c

    kt = diag_scale(manifest, size) * tower_scale
    tg = manifest["tower"]
    items = []  # (depth, draw-callable)
    for orient, c0, c1 in sides:
        items.append(((c0[1] + c1[1]) / 2, "side", orient, c0, c1))
    for c in towers.values():
        items.append((c[1] + 0.01, "tower", None, c, None))

    xs = [p[0] for p in towers.values()]
    ys = [p[1] for p in towers.values()]
    ox, oy = pad - min(xs) + size * 0.3, pad - min(ys) + size * 1.1
    W = round(max(xs) - min(xs) + 2 * pad + size * 0.6)
    H = round(max(ys) - min(ys) + 2 * pad + size * 1.3)
    canvas = Image.new("RGBA", (W, H), (74, 104, 60, 255))

    # Faint hex grid for reference.
    from PIL import ImageDraw
    dr = ImageDraw.Draw(canvas)
    for col, row in blob:
        cx = size * math.sqrt(3) * (col + 0.5 * (row & 1))
        cy = size * 1.5 * row * VSQUISH
        cs = [(x + ox, y + oy) for x, y in hex_corners(cx, cy, size)]
        dr.polygon(cs, fill=(96, 124, 70, 255), outline=(60, 84, 50, 255))

    SS = 2  # supersample the affine warp
    for _, kind, orient, c0, c1 in sorted(items, key=lambda it: it[0]):
        if kind == "side":
            g = manifest["sides"][orient]
            a, b, c, d, e, f = side_affine(g, *inset(c0, c1, INSET), orient)
            e, f = e + ox, f + oy
            src = imgs[orient]
            corners = [(0, 0), (src.width, 0), (0, src.height), (src.width, src.height)]
            px = [a * x + c * y + e for x, y in corners]
            py = [b * x + d * y + f for x, y in corners]
            bx0, by0 = math.floor(min(px)), math.floor(min(py))
            bw, bh = math.ceil(max(px)) - bx0, math.ceil(max(py)) - by0
            # PIL wants the inverse map from output to source pixels.
            det = a * d - b * c
            ia, ib, ic, id_ = d / det, -c / det, -b / det, a / det
            ex, fy = e - bx0, f - by0
            inv = (ia / SS, ib / SS, -(ia * ex + ib * fy), ic / SS, id_ / SS, -(ic * ex + id_ * fy))
            warped = src.transform((bw * SS, bh * SS), Image.AFFINE, inv, Image.BICUBIC)
            warped = warped.resize((bw, bh), Image.LANCZOS)
            canvas.alpha_composite(warped, (bx0, by0))
        else:
            w, h = max(1, round(tg["w"] * kt)), max(1, round(tg["h"] * kt))
            t = tower.resize((w, h), Image.LANCZOS)
            canvas.alpha_composite(t, (round(c0[0] + ox - kt * tg["ax"]), round(c0[1] + oy - kt * tg["ay"])))
    return canvas.convert("RGB")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", default=os.path.join(os.path.expanduser("~"), "Downloads"))
    ap.add_argument("--size", type=int, default=130)
    ap.add_argument("--tower-scale", type=float, default=1.7)
    ap.add_argument("--out", default=os.path.join(ROOT, "tools", "out"))
    ap.add_argument("--no-export", action="store_true")
    args = ap.parse_args()

    if args.no_export:
        with open(os.path.join(OUT, "manifest.json"), encoding="utf-8") as f:
            manifest = json.load(f)
    else:
        manifest = export(args.src)
    os.makedirs(args.out, exist_ok=True)
    blobs = {
        "city": [(1, 0), (2, 0), (0, 1), (1, 1), (2, 1), (1, 2), (2, 2), (2, 3)],
        "single": [(0, 0)],
    }
    for name, blob in blobs.items():
        path = os.path.join(args.out, f"palisade-{name}.png")
        preview(manifest, blob, args.size, args.tower_scale).save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
