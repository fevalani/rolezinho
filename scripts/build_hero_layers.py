#!/usr/bin/env python3
"""Gera as camadas do hero da home a partir de duas imagens que você fornece. TUDO LOCAL (só Pillow).

    python3 scripts/build_hero_layers.py --bg fundo.jpg --faces rostos.jpg

  --bg     imagem de fundo (qualquer proporção; no app ela preenche o hero e é cortada se precisar)
  --faces  folha com os rostos já recortados, em anel, sobre fundo liso claro
  --toast  (opcional) imagem do brinde no centro (ex.: emoji 🍻 em PNG/JPG com fundo branco liso)
Saídas (versionadas):
  public/images/hero/bg.jpg            fundo reduzido (largura máx. 1280)
  public/images/hero/face-NN.png       um PNG com transparência por rosto
  public/images/hero/toast.png         brinde com transparência (se usar --toast)
  src/features/home/rolezinhoFaces.ts  posição de cada rosto (GERADO — não editar à mão)

Como separa os rostos: tudo que não é o fundo liso (e está ligado à borda) é "rosto"; como os rostos se tocam,
cada pixel vai para o rosto de centro mais próximo (centros iniciais em SEEDS, refinados por k-means).
Depois de recortados, os rostos são redistribuídos em intervalos iguais num círculo (mesma ordem e posição de partida),
com tamanho FACE_SCALE e folga FACE_GAP entre vizinhos, para não ficarem um em cima do outro.
Se trocar a folha de rostos, ajuste SEEDS (centro aproximado de cada rosto, em px, em ordem horária).
NUNCA envie estas imagens a serviços externos.
"""
from __future__ import annotations

import argparse
import math
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
# Centro aproximado de cada rosto na folha de 940x939 (ordem horária a partir do topo à esquerda).
SEEDS = [(285, 140), (452, 115), (620, 150), (778, 320), (810, 540), (690, 730),
         (520, 800), (330, 790), (188, 700), (108, 490), (150, 290)]
BG_TOLERANCE = 22       # diferença máxima (por canal) para ainda ser "fundo liso"
MIN_COMPONENT = 1000    # ignora sujeira menor que isso (px)
EDGE_FEATHER = 1.2      # suavização da borda do recorte (px)
STAGE_MARGIN = 1.04     # folga em volta do anel girando
FACE_SCALE = 0.9        # tamanho dos rostos no app, relativo ao recorte original
FACE_GAP = 0.17         # folga mínima entre rostos vizinhos (fração do diâmetro de um rosto)
BG_MAX_WIDTH = 1280


def foreground_mask(im: Image.Image) -> bytearray:
    """1 = parte de um rosto. Fundo = pixels parecidos com o das quinas ligados à borda (buracos internos ficam)."""
    w, h = im.size
    px = im.load()
    bg = px[2, 2]

    def is_bg(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) <= BG_TOLERANCE

    back = bytearray(w * h)
    dq: deque[tuple[int, int]] = deque()
    border = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    for x, y in border:
        if not back[y * w + x] and is_bg(x, y):
            back[y * w + x] = 1
            dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not back[ny * w + nx] and is_bg(nx, ny):
                back[ny * w + nx] = 1
                dq.append((nx, ny))
    fg = bytearray(1 - v for v in back)
    # remove manchinhas isoladas
    seen = bytearray(w * h)
    for s in range(w * h):
        if not fg[s] or seen[s]:
            continue
        comp, q = [s], deque([s])
        seen[s] = 1
        while q:
            p = q.popleft()
            x, y = p % w, p // w
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                k = ny * w + nx
                if 0 <= nx < w and 0 <= ny < h and fg[k] and not seen[k]:
                    seen[k] = 1
                    comp.append(k)
                    q.append(k)
        if len(comp) < MIN_COMPONENT:
            for k in comp:
                fg[k] = 0
    return fg


def assign_faces(fg: bytearray, size: tuple[int, int], seeds=SEEDS, iterations: int = 4) -> list[int]:
    """Rótulo (0..n-1) do rosto de cada pixel de frente (-1 = fundo); centros refinados por k-means."""
    w, h = size
    pts = [i for i in range(w * h) if fg[i]]
    centers = [(float(x), float(y)) for x, y in seeds]
    labels = [-1] * (w * h)
    for _ in range(iterations + 1):
        sums = [[0.0, 0.0, 0] for _ in centers]
        for p in pts:
            x, y = p % w, p // w
            best, bd = 0, 1e18
            for i, (cx, cy) in enumerate(centers):
                d = (x - cx) ** 2 + (y - cy) ** 2
                if d < bd:
                    best, bd = i, d
            labels[p] = best
            s = sums[best]
            s[0] += x
            s[1] += y
            s[2] += 1
        centers = [(s[0] / s[2], s[1] / s[2]) if s[2] else c for s, c in zip(sums, centers)]
    return labels


def cut_faces(im: Image.Image, labels: list[int], n: int):
    """PNG com transparência por rosto: (imagem, caixa (x0,y0,x1,y1) na folha)."""
    w, h = im.size
    out = []
    for i in range(n):
        mask = Image.new("L", (w, h), 0)
        mask.putdata([255 if labels[k] == i else 0 for k in range(w * h)])
        box = mask.getbbox()
        if box is None:
            raise SystemExit(f"rosto {i + 1} ficou vazio — confira SEEDS")
        pad = 4
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
        alpha = mask.crop(box).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(EDGE_FEATHER))
        face = im.crop(box).convert("RGBA")
        face.putalpha(alpha)
        out.append((face, box))
    return out


def cut_toast(im: Image.Image, max_side: int = 320, tolerance: int = 40,
              halo_depth: int = 8, halo_min: int = 241) -> Image.Image:
    """Tira o fundo liso (ligado à borda) de uma imagem solta e devolve PNG recortado, com borda suave.

    Recortes mal feitos deixam um contorno branco irregular em volta do desenho: depois de tirar o fundo,
    pixels de um branco quase puro (todos os canais >= `halo_min`; cinza claro do desenho, ~230, é preservado) colados por fora, até `halo_depth` px para dentro,
    também são descartados. Branco que está DENTRO do desenho (bolhas, espuma, brilho) é preservado."""
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    border = [px[x, y] for x in range(w) for y in (0, h - 1)] + [px[x, y] for y in range(h) for x in (0, w - 1)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))

    def is_bg(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) <= tolerance

    def is_halo(x: int, y: int) -> bool:
        return min(px[x, y]) >= halo_min

    outer = bytearray(w * h)
    dq: deque[tuple[int, int, int]] = deque()  # (x, y, profundidade dentro do halo)
    for x, y in [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]:
        if not outer[y * w + x] and is_bg(x, y):
            outer[y * w + x] = 1
            dq.append((x, y, 0))
    while dq:  # 1) fundo: ligado à borda e parecido com a cor dele
        x, y, _ = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not outer[ny * w + nx] and is_bg(nx, ny):
                outer[ny * w + nx] = 1
                dq.append((nx, ny, 0))
    # buracos do fundo que não tocam a borda (ex.: dentro da alça da caneca) também somem — só quando o fundo
    # NÃO é claro: num fundo branco isso apagaria o branco do próprio desenho (espuma, bolhas, brilho)
    if min(bg) < 200:
        for y in range(h):
            for x in range(w):
                if is_bg(x, y):
                    outer[y * w + x] = 1
    edge = deque((x, y, 0) for y in range(h) for x in range(w) if outer[y * w + x] and any(
        0 <= x + dx < w and 0 <= y + dy < h and not outer[(y + dy) * w + x + dx]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))))
    while edge:  # 2) halo branco: a partir do fundo, só por pixels quase brancos e até `halo_depth`
        x, y, d = edge.popleft()
        if d >= halo_depth:
            continue
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not outer[ny * w + nx] and is_halo(nx, ny):
                outer[ny * w + nx] = 1
                edge.append((nx, ny, d + 1))

    mask = Image.new("L", (w, h), 0)
    mask.putdata([0 if o else 255 for o in outer])
    box = mask.getbbox()
    if box is None:
        raise SystemExit("a imagem do brinde ficou toda transparente — confira o fundo")
    alpha = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(EDGE_FEATHER))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    out = out.crop(box)
    if max(out.size) > max_side:
        scale = max_side / max(out.size)
        out = out.resize((round(out.width * scale), round(out.height * scale)), Image.LANCZOS)
    return out


def face_radius(faces) -> float:
    """Raio de um círculo com a mesma área visível média dos rostos (px do recorte original)."""
    areas = [sum(1 for v in img.getchannel("A").get_flattened_data() if v > 128) for img, _ in faces]
    return math.sqrt(sum(areas) / len(areas) / math.pi)


def min_center_distance(boxes) -> float:
    cs = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b in boxes]
    return min(math.hypot(a[0] - b[0], a[1] - b[1]) for i, a in enumerate(cs) for b in cs[i + 1:])


def even_ring(boxes, scale: float, need: float, radius: float | None = None):
    """Redistribui os rostos em intervalos IGUAIS num círculo, mantendo a ordem e o ponto de partida mais próximo
    do original. O raio é o do anel original, ou maior se for preciso para respeitar `need` (distância mínima entre
    centros vizinhos). O tamanho de cada rosto é multiplicado por `scale`. Devolve (caixas, raio usado)."""
    n = len(boxes)
    cs = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b in boxes]
    cx = sum(c[0] for c in cs) / n
    cy = sum(c[1] for c in cs) / n
    step = 2 * math.pi / n
    angles = [math.atan2(y - cy, x - cx) for x, y in cs]
    # ponto de partida: média circular dos desvios entre o ângulo real e o "ideal" i*step
    start = math.atan2(sum(math.sin(a - i * step) for i, a in enumerate(angles)),
                       sum(math.cos(a - i * step) for i, a in enumerate(angles)))
    r_orig = sum(math.hypot(x - cx, y - cy) for x, y in cs) / n
    r_need = need / (2 * math.sin(step / 2))
    r = radius if radius else max(r_orig, r_need)
    out = []
    for i, b in enumerate(boxes):
        a = start + i * step
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        hw, hh = (b[2] - b[0]) / 2 * scale, (b[3] - b[1]) / 2 * scale
        out.append((x - hw, y - hh, x + hw, y + hh))
    return out, r


def layout(boxes: list[tuple[int, int, int, int]]):
    """Palco quadrado centrado no centro do anel, grande o bastante para o anel girar sem cortar rosto."""
    cs = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b in boxes]
    cx = sum(c[0] for c in cs) / len(cs)
    cy = sum(c[1] for c in cs) / len(cs)
    reach = max(math.hypot(c[0] - cx, c[1] - cy) + math.hypot(b[2] - b[0], b[3] - b[1]) / 2 for c, b in zip(cs, boxes))
    side = 2 * reach * STAGE_MARGIN
    return cx - side / 2, cy - side / 2, side


def ts_source(boxes, origin_x, origin_y, side, prefix) -> str:
    rows = []
    for i, b in enumerate(boxes, 1):
        rows.append('  { src: "%s/face-%02d.png", left: %.3f, top: %.3f, width: %.3f, height: %.3f },' % (
            prefix, i, (b[0] - origin_x) / side * 100, (b[1] - origin_y) / side * 100,
            (b[2] - b[0]) / side * 100, (b[3] - b[1]) / side * 100))
    return (
        "// GERADO por scripts/build_hero_layers.py — não editar à mão.\n"
        "// Posição de cada rosto (em % do palco quadrado) e o centro da órbita.\n\n"
        "export const ORBIT_CENTER = { x: 50.000, y: 50.000 };\n\n"
        "export interface OrbitFace {\n  src: string;\n  left: number;\n  top: number;\n  width: number;\n  height: number;\n}\n\n"
        "export const ORBIT_FACES: OrbitFace[] = [\n" + "\n".join(rows) + "\n];\n"
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bg", required=True)
    ap.add_argument("--faces", required=True)
    ap.add_argument("--face-scale", type=float, default=FACE_SCALE, help="tamanho dos rostos (1 = como no recorte)")
    ap.add_argument("--radius", type=float, help="raio do anel em px da folha (padrão: o da folha ou o mínimo sem sobreposição)")
    ap.add_argument("--toast")
    ap.add_argument("--out", default=str(ROOT / "public" / "images" / "hero"))
    ap.add_argument("--ts", default=str(ROOT / "src" / "features" / "home" / "rolezinhoFaces.ts"))
    args = ap.parse_args(argv)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    bg = Image.open(args.bg).convert("RGB")
    if bg.width > BG_MAX_WIDTH:
        bg = bg.resize((BG_MAX_WIDTH, round(bg.height * BG_MAX_WIDTH / bg.width)), Image.LANCZOS)
    bg.save(out / "bg.jpg", quality=82, optimize=True, progressive=True)
    if args.toast:
        cut_toast(Image.open(args.toast)).save(out / "toast.png", optimize=True)

    sheet = Image.open(args.faces).convert("RGB")
    fg = foreground_mask(sheet)
    labels = assign_faces(fg, sheet.size)
    faces = cut_faces(sheet, labels, len(SEEDS))
    for old in out.glob("face-*.png"):
        old.unlink()
    for i, (img, _) in enumerate(faces, 1):
        img.save(out / f"face-{i:02d}.png", optimize=True)
    cut_boxes = [b for _, b in faces]
    need = 2 * face_radius(faces) * args.face_scale * (1 + FACE_GAP)
    boxes, radius = even_ring(cut_boxes, args.face_scale, need, args.radius)
    ox, oy, side = layout(boxes)
    prefix = "/" + str(out.relative_to(ROOT / "public")).replace("\\", "/") if out.is_relative_to(ROOT / "public") else "/images/hero"
    Path(args.ts).write_text(ts_source(boxes, ox, oy, side, prefix), encoding="utf-8")
    for i, (img, b) in enumerate(faces, 1):
        print(f"rosto {i:02d}: recorte {b} ({b[2] - b[0]}x{b[3] - b[1]}px)")
    print(f"anel de raio {radius:.0f}px com rostos a {args.face_scale:.0%}; menor distância entre centros {min_center_distance(boxes):.0f}px (mínimo {need:.0f})")
    print(f"✔ palco {side:.0f}px, fundo {bg.size}, {len(faces)} rostos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
