#!/usr/bin/env python3
"""
Separa a foto da home (public/images/rolezinho-roots.jpeg) em camadas, para os
rostos poderem girar em volta da caneca e continuar em pé:

  public/images/roots/bg.jpg        fundo SEM os rostos (buracos preenchidos por difusão)
  public/images/roots/face-NN.png   cada rosto, recorte oval com borda suavizada
  src/features/home/rolezinhoFaces.ts   posições em % (gerado)

Roda 100% local, só com Pillow — nenhuma imagem sai da máquina. Os rostos são
ovais ajustados à mão (FACES: centro e raios em px, na imagem 640x640); se algum
recorte ficar apertado/folgado, ajuste aqui e rode de novo:

    python3 scripts/build_roots_orbit.py
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/images/rolezinho-roots.jpeg"
OUT = ROOT / "public/images/roots"
TS = ROOT / "src/features/home/rolezinhoFaces.ts"

SIZE = 640
CENTER = (320, 330)  # centro da caneca = eixo da órbita
MARGIN = 8  # folga do recorte em volta da oval
FEATHER = 3  # suavização da borda do rosto (px)
HOLE_GROW = 10  # quanto o buraco no fundo passa da oval

# (cx, cy, rx, ry) — de cima-esquerda, no sentido horário
FACES = [
    (197, 97, 53, 78),
    (308, 82, 50, 78),
    (424, 103, 63, 79),
    (530, 218, 55, 78),
    (552, 368, 55, 77),
    (469, 497, 56, 78),
    (355, 545, 65, 77),
    (225, 535, 55, 77),
    (128, 478, 50, 78),
    (73, 333, 52, 78),
    (103, 188, 62, 77),
]


def ellipse_mask(box, rx, ry, grow=0, blur=0):
    """Máscara L (255 dentro) do tamanho `box`, oval centrada, com 4x supersampling."""
    w, h = box
    k = 4
    m = Image.new("L", (w * k, h * k), 0)
    cx, cy = w * k / 2, h * k / 2
    ImageDraw.Draw(m).ellipse(
        [cx - (rx + grow) * k, cy - (ry + grow) * k, cx + (rx + grow) * k, cy + (ry + grow) * k],
        fill=255,
    )
    m = m.resize((w, h), Image.LANCZOS)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def build_background(img):
    """Fundo sem os rostos: pinta os buracos por difusão (blur repetido, mantendo o que é conhecido)."""
    holes = Image.new("L", img.size, 0)
    for cx, cy, rx, ry in FACES:
        layer = Image.new("L", img.size, 0)
        w, h = 2 * (rx + HOLE_GROW + 4), 2 * (ry + HOLE_GROW + 4)
        m = ellipse_mask((w, h), rx, ry, grow=HOLE_GROW)
        layer.paste(m, (cx - w // 2, cy - h // 2))
        holes = ImageChops.lighter(holes, layer)
    keep = ImageChops.invert(holes).filter(ImageFilter.GaussianBlur(1))

    # parte de uma versão bem desfocada e vai refinando em escalas crescentes
    filled = img.filter(ImageFilter.GaussianBlur(40))
    filled = Image.composite(img, filled, keep)
    for radius, rounds in ((24, 6), (12, 8), (6, 10), (3, 12)):
        for _ in range(rounds):
            filled = Image.composite(img, filled.filter(ImageFilter.GaussianBlur(radius)), keep)
    # grão leve para o preenchimento não ficar liso demais
    noise = Image.effect_noise(img.size, 14).convert("RGB")
    grain = Image.blend(filled, noise, 0.06)
    return Image.composite(img, grain, keep)


def main():
    img = Image.open(SRC).convert("RGB")
    assert img.size == (SIZE, SIZE), img.size
    OUT.mkdir(parents=True, exist_ok=True)

    build_background(img).save(OUT / "bg.jpg", quality=86, optimize=True)

    rows = []
    for i, (cx, cy, rx, ry) in enumerate(FACES, start=1):
        x0, y0 = max(0, cx - rx - MARGIN), max(0, cy - ry - MARGIN)
        x1, y1 = min(SIZE, cx + rx + MARGIN), min(SIZE, cy + ry + MARGIN)
        crop = img.crop((x0, y0, x1, y1)).convert("RGBA")
        box = crop.size
        mask = Image.new("L", box, 0)
        m = ellipse_mask((2 * rx, 2 * ry), rx, ry, blur=FEATHER)
        mask.paste(m, (cx - rx - x0, cy - ry - y0))
        crop.putalpha(mask)
        crop.save(OUT / f"face-{i:02d}.png", optimize=True)
        rows.append((i, x0, y0, x1 - x0, y1 - y0))

    lines = [
        "// GERADO por scripts/build_roots_orbit.py — não editar à mão.",
        "// Posição de cada rosto (em % do quadrado da imagem) e o centro da órbita.",
        "",
        f"export const ORBIT_CENTER = {{ x: {CENTER[0] / SIZE * 100:.3f}, y: {CENTER[1] / SIZE * 100:.3f} }};",
        "",
        "export interface OrbitFace {",
        "  src: string;",
        "  left: number;",
        "  top: number;",
        "  width: number;",
        "  height: number;",
        "}",
        "",
        "export const ORBIT_FACES: OrbitFace[] = [",
    ]
    for i, x, y, w, h in rows:
        lines.append(
            f'  {{ src: "/images/roots/face-{i:02d}.png", left: {x / SIZE * 100:.3f}, '
            f"top: {y / SIZE * 100:.3f}, width: {w / SIZE * 100:.3f}, height: {h / SIZE * 100:.3f} }},"
        )
    lines.append("];")
    TS.write_text("\n".join(lines) + "\n")
    print(f"ok: bg.jpg + {len(rows)} rostos em {OUT}")


if __name__ == "__main__":
    main()
