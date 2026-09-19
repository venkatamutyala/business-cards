#!/usr/bin/env python3
"""Generate PWA icons and a favicon, with no image libraries.

Writes RGBA PNGs by hand: zlib is in the standard library, so there is nothing
to install. DESIGN selects which mark to render.
"""
import struct, zlib, os, sys

INK    = (17, 17, 17, 255)
PAPER  = (255, 255, 255, 255)
ACCENT = (31, 93, 76, 255)
SAND   = (246, 245, 243, 255)


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + bytes(v for px in row for v in px) for row in rows)
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(raw, 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)


def rounded(x, y, size, radius):
    """True when the point is inside a rounded square covering the whole icon."""
    r = radius
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def finder(gx, gy):
    """A QR finder pattern on a 7x7 grid: ring, gap, solid centre."""
    if not (0 <= gx < 7 and 0 <= gy < 7):
        return None
    if gx < 1 or gx >= 6 or gy < 1 or gy >= 6:
        return 'on'
    if gx < 2 or gx >= 5 or gy < 2 or gy >= 5:
        return 'off'
    return 'on'


def render(size, design, maskable=False):
    # A maskable icon is cropped to a circle or squircle by the platform, so its
    # content has to stay well inside the safe zone.
    pad = size * 0.27 if maskable else size * 0.14
    inner = size - pad * 2
    rows = []

    for y in range(size):
        row = []
        for x in range(size):
            px = None

            if design == 'finder':
                # Accent field, white finder mark.
                unit = inner / 7.0
                cell = finder((x - pad) / unit, (y - pad) / unit)
                bg = ACCENT if (maskable or rounded(x, y, size, size * 0.22)) else (0, 0, 0, 0)
                px = PAPER if cell == 'on' else bg

            elif design == 'card':
                # A contact card with a finder mark in the corner.
                bg = INK if (maskable or rounded(x, y, size, size * 0.22)) else (0, 0, 0, 0)
                px = bg
                cx0, cy0 = pad, pad + inner * 0.14
                cw, ch = inner, inner * 0.72
                if cx0 <= x < cx0 + cw and cy0 <= y < cy0 + ch:
                    px = PAPER
                    unit = ch * 0.62 / 7.0
                    gx = (x - (cx0 + cw * 0.08)) / unit
                    gy = (y - (cy0 + ch * 0.19)) / unit
                    cell = finder(gx, gy)
                    if cell == 'on':
                        px = INK
                    else:
                        # Two text rules to the right of the mark.
                        tx0 = cx0 + cw * 0.52
                        for k, frac in enumerate((0.34, 0.56)):
                            ry = cy0 + ch * frac
                            if tx0 <= x < cx0 + cw * 0.88 and ry <= y < ry + max(2, ch * 0.075):
                                px = ACCENT if k == 0 else (150, 150, 150, 255)

            elif design == 'scan':
                # Corner brackets around a solid finder mark: "point a camera here".
                bg = SAND if (maskable or rounded(x, y, size, size * 0.22)) else (0, 0, 0, 0)
                px = bg
                t = max(2, inner * 0.085)          # bracket thickness
                arm = inner * 0.30                 # bracket arm length
                for ox in (pad, size - pad):
                    for oy in (pad, size - pad):
                        hx = x - ox
                        hy = y - oy
                        if (abs(hx) <= arm and abs(hy) <= t) or (abs(hy) <= arm and abs(hx) <= t):
                            # keep only the arms that point inward
                            inward_x = hx >= -t if ox == pad else hx <= t
                            inward_y = hy >= -t if oy == pad else hy <= t
                            if inward_x and inward_y:
                                px = ACCENT
                unit = inner * 0.46 / 7.0
                off = pad + inner * 0.27
                cell = finder((x - off) / unit, (y - off) / unit)
                if cell == 'on':
                    px = INK

            row.append(px)
        rows.append(row)
    return rows


DESIGN = sys.argv[1] if len(sys.argv) > 1 else 'finder'

if __name__ == '__main__':
    os.makedirs('icons', exist_ok=True)
    for size, maskable, name in [
        (192, False, 'icons/icon-192.png'),
        (512, False, 'icons/icon-512.png'),
        (512, True,  'icons/icon-maskable-512.png'),
        (180, False, 'icons/apple-touch-icon.png'),
        (32,  False, 'icons/favicon-32.png'),
        (16,  False, 'icons/favicon-16.png'),
    ]:
        write_png(name, size, render(size, DESIGN, maskable))
        print(f'{name}  {size}x{size}{"  maskable" if maskable else ""}')
