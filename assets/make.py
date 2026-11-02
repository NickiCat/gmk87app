#!/usr/bin/env python3
"""Draws the README's SVGs: GitHub strips scripts and CSS from a README, but an SVG in <img> keeps its animations.

Text becomes outlines, so the look doesn't depend on the viewer's fonts. Needs fontTools; run with the folder
holding the Inter-Regular, Inter-SemiBold and JetBrainsMono-Regular TTFs:
    python3 assets/make.py <fonts dir>
Colors are the app's own (src/renderer/src/styles/global.css), keys.json is the physical layout (src/shared/layout.ts).
"""
import json
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent
FONTS = Path(sys.argv[1])
PAGE, PANEL, SELECTED = "#000000", "#0a0a0a", "#1a1a1a"
EDGE, LINE = "#222222", "#333333"
INK, SOFT, MUTED = "#ededed", "#a1a1a1", "#888888"
OK = "#22c55e"
SANS, BOLD, MONO = "Inter-Regular", "Inter-SemiBold", "JetBrainsMono-Regular"
_fonts = {}


def font(name):
    if name not in _fonts:
        f = TTFont(FONTS / f"{name}.ttf")
        _fonts[name] = (f.getGlyphSet(), f.getBestCmap(), f["hmtx"], f["head"].unitsPerEm)
    return _fonts[name]


def width(s, size, name):
    _, cmap, hmtx, em = font(name)
    return sum(hmtx[cmap.get(ord(c), ".notdef")][0] * size / em for c in s)


def text(s, x, y, size, name=SANS, fill=SOFT, anchor="start"):
    gs, cmap, hmtx, em = font(name)
    if anchor != "start":
        x -= width(s, size, name) * (0.5 if anchor == "middle" else 1)
    k, d = size / em, ""
    for c in s:
        g = cmap.get(ord(c), ".notdef")
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, y)))
        d += pen.getCommands()
        x += hmtx[g][0] * k
    return f'<path d="{d}" fill="{fill}"/>'


def svg(w, h, alt, style, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" '
            f'aria-label="{alt}"><title>{alt}</title><style>{style}'
            f'@media (prefers-reduced-motion: reduce){{*{{animation:none!important}}}}</style>{body}</svg>\n')


def save(name, content):
    (HERE / name).write_text(content, encoding="utf-8")
    print(name, f"{len(content) // 1024} KiB")


TEXT = {
    "en": {"alt": "GMK87 Control: keymap, macros, lighting and display of the Zuoya GMK87 keyboard on Linux",
           "lead": "Configurator for the Zuoya GMK87 keyboard on Linux", "sub": "keymap · macros · lighting · screen · clock",
           "side": ["Device", "Keymap", "Macros", "Lighting", "Screen and clock"], "st": "Connected over USB"},
    "ru": {"alt": "GMK87 Control: раскладка, макросы, подсветка и экран клавиатуры Zuoya GMK87 на Linux",
           "lead": "Конфигуратор клавиатуры Zuoya GMK87 для Linux", "sub": "раскладка · макросы · подсветка · экран · часы",
           "side": ["Устройство", "Раскладка", "Макросы", "Подсветка", "Экран и часы"], "st": "Подключена по USB"},
}


def hero(lang):
    t = TEXT[lang]
    W, H, SIDE, TOP, CYCLE = 860, 420, 190, 92, 15
    keys = json.loads((HERE / "keys.json").read_text())
    cols, rows = max(k[0] + k[2] for k in keys), max(k[1] + k[3] for k in keys)
    bw, bh = W - SIDE - 72, H - TOP - 66
    u = min(bw / cols, bh / rows)
    x0, y0 = SIDE + 36 + (bw - cols * u) / 2, TOP + 20 + (bh - rows * u) / 2
    caps = ""
    for x, y, w, h, tone in keys:
        delay = -(CYCLE / 3) * (1 - (x + y * 0.5) / (cols + rows * 0.5))
        fill = ("#1b1b1b", "#141414", "#262626")[tone]
        px, py = x0 + x * u + 1.5, y0 + y * u + 1.5
        caps += f'<rect x="{px:.1f}" y="{py:.1f}" width="{w * u - 3:.1f}" height="{h * u - 3:.1f}" rx="4" fill="{fill}" stroke="{LINE}"/>'
        caps += f'<rect class="glow" style="animation-delay:{delay:.2f}s" x="{px + 2:.1f}" y="{py + 2:.1f}" width="{w * u - 7:.1f}" height="{h * u - 7:.1f}" rx="3"/>'
    side = "".join(text(n, SIDE // 2 - 62, TOP + 34 + i * 40, 13.5, SANS, INK if i else SOFT) for i, n in enumerate(t["side"]))
    pills = "".join(f"{i * 20}%,{i * 20 + 16}%{{transform:translateY({i * 40}px)}}" for i in range(5)) + "100%{transform:none}"
    style = (f".glow{{animation:glow {CYCLE // 3}s linear infinite}}"
             "@keyframes glow{0%{fill:#ff4d6a}17%{fill:#ffb020}33%{fill:#6ee755}50%{fill:#2ad4d4}67%{fill:#4d7cff}83%{fill:#c04dff}100%{fill:#ff4d6a}}"
             f".pill{{animation:pill {CYCLE}s ease-in-out infinite}}@keyframes pill{{{pills}}}"
             ".dot{animation:dot 2s ease-in-out infinite}@keyframes dot{50%{opacity:.25}}")
    body = f'''<rect width="{W}" height="{H}" rx="14" fill="{PAGE}"/><rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="14" fill="none" stroke="{LINE}"/>
{text("GMK87 Control", 28, 40, 26, BOLD, INK)}{text(t["lead"], 28, 66, 13.5, SANS, SOFT)}{text(t["sub"], W - 28, 66, 11.5, MONO, MUTED, "end")}
<path d="M0 {TOP - .5}H{W}M{SIDE}.5 {TOP}V{H - 1}" stroke="{EDGE}"/>
<rect class="pill" x="12" y="{TOP + 13}" width="{SIDE - 24}" height="32" rx="6" fill="{SELECTED}"/>{side}
<circle class="dot" cx="26" cy="{H - 24}" r="3.5" fill="{OK}"/>{text(t["st"], 38, H - 20, 11, MONO, MUTED)}
{caps}'''
    save(f"hero-{lang}.svg", svg(W, H, t["alt"], style, body))


def button(file, title, sub, alt):
    W, H = 196, 62
    style = ".ar{animation:ar 1.8s ease-in-out infinite}@keyframes ar{50%{transform:translateY(3px)}}"
    body = (f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="8" fill="{PANEL}" stroke="{LINE}"/>'
            f'{text(title, 16, 27, 15, BOLD, INK)}{text(sub, 16, 46, 11, MONO, MUTED)}'
            f'<g class="ar"><path d="M{W - 28} 22v15m-6-6l6 6 6-6" fill="none" stroke="{INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>')
    save(file, svg(W, H, alt, style, body))


hero("en")
hero("ru")
button("dl-arch.svg", "Arch Linux", ".pkg.tar.zst", "Arch Linux: .pkg.tar.zst")
button("dl-debian.svg", "Debian / Ubuntu", ".deb", "Debian and Ubuntu: .deb")
button("dl-fedora.svg", "Fedora", ".rpm", "Fedora: .rpm")
