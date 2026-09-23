#!/usr/bin/env python3
"""Prepare the wall sets (sides + joint towers) and preview them on a hex grid.

The approach: a wall side is drawn between the two hex corners of its edge, and
a tower is stood on every corner a wall run touches. The towers cover the
joints, so the side pieces only have to reach the corners, never to agree with
each other pixel for pixel.

There is one set per wall tier, and every piece comes in the three structure
conditions (intact, damaged, destroyed):

    palisade   tier 1   wooden pickets, wooden posts
    stone      tier 2   stone wall, stone posts
    great      tier 3   double stone wall with iron fittings, double posts

Each set ships a side piece per hex-edge axis plus a joint tower:

    "v"   run heading away from camera   -> hex sides 0 / 3
    "u"   run rising to the right  "/"   -> hex sides 1 / 4
    "d"   run falling to the right "\\"  -> hex sides 2 / 5

The source renders arrive as one zip of Croatian-named files. The diagonal
files are named "kut 1" / "kut 2" inconsistently between sets and states, so
their axis is read off the art itself (the slope of the run's footing) rather
than the name. The end anchors are measured once on the intact render and
carried over to the damaged and destroyed ones (whose broken ends and spilled
rubble would throw a measurement) by matching their silhouettes; see register().
Byte-identical renders (several states ship the same file) export once.

    python tools/fortification-art.py                  # export + preview
    python tools/fortification-art.py --src D:/art/Zidovi.zip --size 140
    python tools/fortification-art.py --no-export      # preview only
"""

import argparse
import hashlib
import io
import json
import math
import os
import unicodedata
import zipfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "client", "public", "walls")
ALPHA = 24
INSET = 0.1  # fraction of a side hidden under each end's tower
SCALE = 0.4  # common downscale for every exported piece, so relative sizes hold
STATES = ("intact", "damaged", "destroyed")

VSQUISH = math.sqrt(3) / 2  # matches renderer.ts
SIDE_ORIENT = ["v", "u", "d", "v", "u", "d"]
NEIGHBOURS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]

# Source files per set, by ASCII-folded name without ".png". Diagonals list both
# renders of a state; which one is "u" and which "d" is measured.
SETS = {
    "palisade": {
        "diag": {
            "intact": ["drveni zid kut 1", "drveni zid kut 2"],
            "damaged": ["drveni zid kut 1 (ostecen)", "drveni zid kut 2 (ostecen)"],
            "destroyed": ["drveni zid kut 1 (urupen)", "drveni zid kut 2 (urupen)"],
        },
        "v": {
            "intact": "drveni zig pod 90",
            "damaged": "drveni zig pod 90 (ostecen)",
            "destroyed": "drveni zig pod 90 (urusen)",
        },
        "tower": {
            "intact": "drveni stup",
            "damaged": "drveni stup (ostecen)",
            "destroyed": "drveni stup (urusen)",
        },
        # End-post half width and the lift from the fitted footing (which runs
        # along the posts' front corners) back to their centres, source pixels.
        "post_half": 65,
        "lift": 22,
        # The away-from-camera render packs its pickets tighter than a hex side is
        # long, so a copy is stacked `steps` pickets further back behind it.
        "v_extend": (4, 190),
        # Height of the far picket above its footing: the run starts that far
        # below the top of the render.
        "v_top": 1072,
        "tower_scale": 1.7,
    },
    "stone": {
        "diag": {
            "intact": ["kameni zid kut 1", "kameni zid kut 1-1"],
            "damaged": ["kameni zid kut 1 (ostecen)", "kameni zid kut 2 (ostecen)"],
            "destroyed": ["kameni zid kut 1 (urusen)", "kameni zid kut 2 (urusen)"],
        },
        "v": {
            "intact": "kameni zid pod kutwm od 90",
            "damaged": "kameni zid pod kutwm od 90 (ostecen)",
            "destroyed": "kameni zid pod kutwm od 90 (urusen)",
        },
        "tower": {
            "intact": "kameni stup",
            "damaged": "kameni stup (ostecen)",
            "destroyed": "kameni stup (urusen)",
        },
        "post_half": 70,
        "lift": 40,
        "v_extend": None,
        "v_top": 0,
        "tower_scale": 1.5,
    },
    "great": {
        "diag": {
            "intact": ["dvostruki kameni zid kut 1", "dvostruki kameni zid kut 2"],
            "damaged": ["dvostruki kameni zid kut 1 (ostecen)", "dvostruki kameni zid kut 2 (ostecen)"],
            "destroyed": ["dvostruki kameni zid kut 1 (urusen)", "dvostruki kameni zid kut 2 (urusen)"],
        },
        "v": {
            "intact": "dvostruki kameni pod kutem od 90",
            "damaged": "dvostruki kameni pod kutem od 90 (ostecen)",
            "destroyed": "dvostruki kameni pod kutem od 90 (urusen)",
        },
        "tower": {
            "intact": "dvostruki kameni stup",
            "damaged": "dvostruki kameni stup (ostecen)",
            "destroyed": "dvostruki kameni stup (urusen))",
        },
        "post_half": 90,
        "lift": 60,
        "v_extend": None,
        "v_top": 0,
        "tower_scale": 1.5,
    },
}


def fold(name):
    """ASCII-fold a file name: strip accents, lowercase, drop the extension."""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(ch for ch in name if not unicodedata.combining(ch))
    return os.path.splitext(name)[0].strip().lower()


class Source:
    """The delivered renders, read straight from the zip (or a folder of them)."""

    def __init__(self, path):
        self.files = {}
        if os.path.isdir(path):
            for f in os.listdir(path):
                if f.lower().endswith(".png"):
                    with open(os.path.join(path, f), "rb") as fh:
                        self.files[fold(f)] = fh.read()
        else:
            with zipfile.ZipFile(path) as z:
                for info in z.infolist():
                    name = info.filename
                    if not name.lower().endswith(".png"):
                        continue
                    # macOS zips store UTF-8 names without flagging them, so
                    # zipfile decodes them as cp437.
                    if not info.flag_bits & 0x800:
                        try:
                            name = name.encode("cp437").decode("utf-8")
                        except UnicodeError:
                            pass
                    self.files[fold(os.path.basename(name))] = z.read(info)

    def load(self, name):
        data = self.files.get(name)
        if data is None:
            raise SystemExit(f"missing source render: {name!r}")
        return Image.open(io.BytesIO(data)).convert("RGBA"), hashlib.md5(data).hexdigest()


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


def diagonal_piece(img, post_half, lift):
    """Axis and ground points of the two ends of a run drawn across the screen."""
    slope, icpt, x0, x1 = ground_line(opaque(img))
    ax, bx = x0 + post_half, x1 - post_half
    orient = "u" if slope < 0 else "d"
    return orient, ((ax, slope * ax + icpt - lift), (bx, slope * bx + icpt - lift))


def extend_vertical(img, steps, spacing):
    """Stack a copy of an away-from-camera render `steps` pickets further back.
    The far copy is drawn first and the near one over it, which is how the
    pickets overlap."""
    shift = steps * spacing
    out = Image.new("RGBA", (img.width, img.height + shift))
    out.alpha_composite(img, (0, 0))
    out.alpha_composite(img, (0, shift))
    return out


def vertical_piece(img, top, lift):
    """Ground points of the far and near end of a run heading away from camera."""
    ys, xs = np.nonzero(opaque(img))
    cx = (xs.min() + xs.max()) / 2
    return (cx, ys.min() + top - lift), (cx, ys.max() - lift)


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


REG_STEP = 4  # registration works on masks downsampled by this much
REG_MIN_IOU = 0.5  # below this the match is noise: keep the canvas placement


def register(ref, img):
    """Find the scale `s` and shift `t` that best lay `img`'s silhouette over
    `ref`'s, so that a point p in `ref` sits at s * p + t in `img`.

    The damaged and destroyed renders were framed a little differently from the
    intact ones (nudged up to 40 source pixels, and in the stone set also a few
    percent smaller), so the intact anchors are carried across by matching the
    silhouettes: whatever still stands lines up with the intact piece. A render
    too broken to match (a lone heap of rubble) keeps the canvas placement."""
    def mask(im, s=1.0):
        w, h = im.size
        small = im.getchannel("A").resize((max(1, round(w * s / REG_STEP)), max(1, round(h * s / REG_STEP))), Image.BILINEAR)
        return (np.array(small) > ALPHA).astype(np.float32)

    a = mask(ref)
    best = (0.0, 1.0, (0.0, 0.0))
    for s in np.arange(0.93, 1.0701, 0.01):
        b = mask(img, 1 / s)  # img brought to ref's scale
        H, W = max(a.shape[0], b.shape[0]) * 2, max(a.shape[1], b.shape[1]) * 2
        corr = np.fft.irfft2(np.fft.rfft2(a, (H, W)) * np.conj(np.fft.rfft2(b, (H, W))), (H, W))
        dy, dx = np.unravel_index(np.argmax(corr), corr.shape)
        overlap = corr[dy, dx]
        dy = dy - H if dy > H // 2 else dy
        dx = dx - W if dx > W // 2 else dx
        iou = overlap / (a.sum() + b.sum() - overlap)
        if iou > best[0]:
            # b shifted by (dx, dy) matches a: ref point p is at p - d in b's
            # frame, i.e. at s * (p - d) in img's full-resolution frame.
            best = (iou, s, (-dx * REG_STEP * s, -dy * REG_STEP * s))
    iou, s, (tx, ty) = best
    if iou < REG_MIN_IOU:
        return 1.0, (0.0, 0.0), iou
    return s, (tx, ty), iou


def carry(pts, reg):
    s, (tx, ty), _ = reg
    return [(s * x + tx, s * y + ty) for x, y in pts]


def trim_scale(img, pts):
    """Crop to the silhouette, downscale by SCALE and carry the anchor points along."""
    m = opaque(img)
    ys, xs = np.nonzero(m)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    img = img.crop(box)
    w, h = round(img.width * SCALE), round(img.height * SCALE)
    img = img.resize((w, h), Image.LANCZOS)
    return img, [((x - box[0]) * SCALE, (y - box[1]) * SCALE) for x, y in pts]


class Writer:
    """Writes one set's pieces, exporting each distinct source render only once."""

    def __init__(self, out):
        self.out = out
        self.done = {}  # (source hash, anchors) -> manifest entry

    def piece(self, stem, state, img, digest, pts):
        key = (digest, tuple(pts))
        if key in self.done:
            return self.done[key]
        name = stem if state == "intact" else f"{stem}_{state}"
        img, pts = trim_scale(img, pts)
        img.save(os.path.join(self.out, f"{name}.png"), optimize=True)
        entry = {"file": name, "w": img.width, "h": img.height}
        for label, (x, y) in zip("ab", pts):
            entry[f"{label}x"], entry[f"{label}y"] = round(x, 2), round(y, 2)
        self.done[key] = entry
        return entry


def export_set(src, name, spec):
    out = os.path.join(OUT, name)
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".png"):
            os.remove(os.path.join(out, f))
    w = Writer(out)
    manifest = {"towerScale": spec["tower_scale"], "sides": {"v": {}, "u": {}, "d": {}}, "tower": {}}

    def slot(stem, renders, anchors):
        """Export one slot's three states, carrying the intact anchors across."""
        ref_img, ref_digest = renders["intact"]
        entries = {}
        for state in STATES:
            img, digest = renders[state]
            pts = anchors
            if digest != ref_digest:
                reg = register(ref_img, img)
                pts = carry(anchors, reg)
                print(f"  {name}/{stem} {state}: scale {reg[0]:.2f} shift"
                      f" ({reg[1][0]:+.0f}, {reg[1][1]:+.0f}) iou {reg[2]:.2f}")
            entries[state] = w.piece(stem, state, img, digest, pts)
        return entries

    # Diagonals: sort each state's pair by the slope of its run.
    diag = {}
    for state in STATES:
        for fname in spec["diag"][state]:
            img, digest = src.load(fname)
            orient, pts = diagonal_piece(img, spec["post_half"], spec["lift"])
            if orient in diag.get(state, {}):
                raise SystemExit(f"{name}: two {state} renders measure as '{orient}'")
            diag.setdefault(state, {})[orient] = (img, digest, pts)
    for orient in "ud":
        renders = {state: diag[state][orient][:2] for state in STATES}
        manifest["sides"][orient] = slot(f"side_{orient}", renders, diag["intact"][orient][2])

    renders = {}
    for state in STATES:
        img, digest = src.load(spec["v"][state])
        if spec["v_extend"]:
            img = extend_vertical(img, *spec["v_extend"])
        renders[state] = (img, digest)
    lift = spec["lift"] if spec["v_top"] else 0
    manifest["sides"]["v"] = slot("side_v", renders, vertical_piece(renders["intact"][0], spec["v_top"], lift))

    renders = {state: src.load(spec["tower"][state]) for state in STATES}
    towers = slot("tower", renders, [tower_anchor(renders["intact"][0])])
    for state, entry in towers.items():
        manifest["tower"][state] = {k: v for k, v in entry.items() if k not in ("bx", "by")}

    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print("wrote", out)
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
    return (k, shy, 0, k, p[0] - k * g["ax"], p[1] - k * g["ay"] - shy * g["ax"])


RANK = {"destroyed": 0, "damaged": 1, "intact": 2}


def preview(manifests, blob, size, pad=60):
    """`blob` maps (col, row) -> (set name, state)."""
    cache = {}

    def img(set_name, file):
        key = (set_name, file)
        if key not in cache:
            cache[key] = Image.open(os.path.join(OUT, set_name, f"{file}.png")).convert("RGBA")
        return cache[key]

    tier = {name: i for i, name in enumerate(SETS)}
    owned = set(blob)
    sides, towers = [], {}
    for (col, row), (set_name, state) in blob.items():
        cx = size * math.sqrt(3) * (col + 0.5 * (row & 1))
        cy = size * 1.5 * row * VSQUISH
        cs = hex_corners(cx, cy, size)
        for sd in outward_sides(col, row, owned):
            c0, c1 = cs[sd], cs[(sd + 1) % 6]
            sides.append((set_name, state, SIDE_ORIENT[sd], c0, c1))
            for c in (c0, c1):
                key = (round(c[0]), round(c[1]))
                cur = towers.get(key)
                cand = (tier[set_name], RANK[state], set_name, state, c)
                if cur is None or cand[:2] > cur[:2]:
                    towers[key] = cand

    items = [((c0[1] + c1[1]) / 2, 0, s) for s in sides for c0, c1 in [s[3:5]]]
    items += [(t[4][1], 1, t) for t in towers.values()]

    xs = [t[4][0] for t in towers.values()]
    ys = [t[4][1] for t in towers.values()]
    ox, oy = pad - min(xs) + size * 0.3, pad - min(ys) + size * 1.1
    W = round(max(xs) - min(xs) + 2 * pad + size * 0.6)
    H = round(max(ys) - min(ys) + 2 * pad + size * 1.3)
    canvas = Image.new("RGBA", (W, H), (74, 104, 60, 255))

    dr = ImageDraw.Draw(canvas)
    for col, row in blob:
        cx = size * math.sqrt(3) * (col + 0.5 * (row & 1))
        cy = size * 1.5 * row * VSQUISH
        cs = [(x + ox, y + oy) for x, y in hex_corners(cx, cy, size)]
        dr.polygon(cs, fill=(96, 124, 70, 255), outline=(60, 84, 50, 255))

    SS = 2  # supersample the affine warp
    for _, kind, it in sorted(items, key=lambda it: (it[0], it[1])):
        if kind == 0:
            set_name, state, orient, c0, c1 = it
            man = manifests[set_name]
            g = man["sides"][orient][state]
            a, b, c, d, e, f = side_affine(g, *inset(c0, c1, INSET), orient)
            e, f = e + ox, f + oy
            src = img(set_name, g["file"])
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
            _, _, set_name, state, c = it
            man = manifests[set_name]
            dg = man["sides"]["d"]["intact"]
            kt = VSQUISH * size * (1 - 2 * INSET) / (dg["bx"] - dg["ax"]) * man["towerScale"]
            tg = man["tower"][state]
            w, h = max(1, round(tg["w"] * kt)), max(1, round(tg["h"] * kt))
            t = img(set_name, tg["file"]).resize((w, h), Image.LANCZOS)
            canvas.alpha_composite(t, (round(c[0] + ox - kt * tg["ax"]), round(c[1] + oy - kt * tg["ay"])))
    return canvas.convert("RGB")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", default=os.path.join(os.path.expanduser("~"), "Downloads", "Zidovi.zip"))
    ap.add_argument("--size", type=int, default=130)
    ap.add_argument("--out", default=os.path.join(ROOT, "tools", "out"))
    ap.add_argument("--no-export", action="store_true")
    args = ap.parse_args()

    manifests = {}
    if args.no_export:
        for name in SETS:
            with open(os.path.join(OUT, name, "manifest.json"), encoding="utf-8") as f:
                manifests[name] = json.load(f)
    else:
        src = Source(args.src)
        for name, spec in SETS.items():
            manifests[name] = export_set(src, name, spec)

    os.makedirs(args.out, exist_ok=True)
    city = [(1, 0), (2, 0), (0, 1), (1, 1), (2, 1), (1, 2), (2, 2), (2, 3)]
    blobs = {}
    for name in SETS:
        for state in STATES:
            blobs[f"{name}-{state}"] = {t: (name, state) for t in city}
    # A mixed frontier: tiers meeting, and a breach in an otherwise sound run.
    blobs["mixed"] = {
        (1, 0): ("palisade", "intact"), (2, 0): ("palisade", "damaged"),
        (0, 1): ("stone", "intact"), (1, 1): ("stone", "intact"), (2, 1): ("stone", "destroyed"),
        (1, 2): ("great", "intact"), (2, 2): ("great", "damaged"), (2, 3): ("great", "destroyed"),
    }
    for name, blob in blobs.items():
        path = os.path.join(args.out, f"walls-{name}.png")
        preview(manifests, blob, args.size).save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
