"""Testes do gerador de camadas do hero (imagens sintéticas — nenhuma foto real)."""
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build_hero_layers as bhl  # noqa: E402

BG = (247, 247, 247)


def math_sin_quarter():
    import math
    return math.sin(math.pi / 4)


def sheet(discs, size=(400, 300)):
    im = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(im)
    for (x, y, r, color) in discs:
        d.ellipse((x - r, y - r, x + r, y + r), fill=color)
    return im


class HeroLayersTest(unittest.TestCase):
    def test_mascara_ignora_fundo_e_sujeira_mas_mantem_buraco_interno(self):
        im = sheet([(100, 150, 60, (200, 80, 60))])
        ImageDraw.Draw(im).ellipse((95, 145, 105, 155), fill=BG)      # "reflexo" branco dentro do rosto
        ImageDraw.Draw(im).rectangle((300, 20, 305, 25), fill=(0, 0, 0))  # sujeirinha
        fg = bhl.foreground_mask(im)
        w = im.width
        self.assertEqual(fg[150 * w + 100], 1, "buraco interno continua sendo rosto")
        self.assertEqual(fg[10 * w + 10], 0, "fundo")
        self.assertEqual(fg[22 * w + 302], 0, "sujeira pequena removida")

    def test_rostos_que_se_tocam_sao_separados_pelo_centro_mais_proximo(self):
        im = sheet([(120, 150, 70, (200, 60, 60)), (240, 150, 70, (60, 60, 200))])  # se encostam em x=190..170
        fg = bhl.foreground_mask(im)
        labels = bhl.assign_faces(fg, im.size, seeds=[(120, 150), (240, 150)])
        w = im.width
        self.assertEqual(labels[150 * w + 100], 0)
        self.assertEqual(labels[150 * w + 260], 1)
        self.assertEqual(labels[10 * w + 10], -1)
        faces = bhl.cut_faces(im, labels, 2)
        (a, abox), (b, bbox) = faces
        self.assertLess(abox[0], bbox[0])
        self.assertTrue(all(img.mode == "RGBA" for img, _ in faces))
        self.assertEqual(a.getpixel((a.width // 2, a.height // 2))[3], 255)
        self.assertEqual(a.getpixel((0, 0))[3], 0, "canto do recorte é transparente")

    def test_cut_faces_falha_com_rosto_vazio(self):
        im = sheet([(100, 150, 60, (200, 80, 60))])
        labels = bhl.assign_faces(bhl.foreground_mask(im), im.size, seeds=[(100, 150)])
        with self.assertRaises(SystemExit):
            bhl.cut_faces(im, labels, 2)  # pede 2 rostos, só existe 1

    def test_palco_contem_o_anel_girando(self):
        import math
        boxes = [(100, 0, 200, 120), (300, 100, 400, 220), (100, 200, 200, 320), (0, 100, 100, 220)]
        ox, oy, side = bhl.layout(boxes)
        cx, cy = ox + side / 2, oy + side / 2
        for b in boxes:
            c = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            reach = math.hypot(c[0] - cx, c[1] - cy) + math.hypot(b[2] - b[0], b[3] - b[1]) / 2
            self.assertLessEqual(reach, side / 2)

    def test_rostos_ficam_em_intervalos_iguais_sem_sobreposicao_e_na_mesma_ordem(self):
        import math
        # 6 rostos de 100x120 colados em elipse (vizinhos se sobrepõem)
        boxes = []
        for i in range(6):
            a = i * math.pi / 3
            x, y = 300 + 130 * math.cos(a), 300 + 170 * math.sin(a)
            boxes.append((x - 50, y - 60, x + 50, y + 60))
        need = 130.0
        out, r = bhl.even_ring(boxes, 0.9, need)
        self.assertGreaterEqual(bhl.min_center_distance(out), need - 0.01)
        cs = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b in out]
        cx, cy = sum(c[0] for c in cs) / 6, sum(c[1] for c in cs) / 6
        ang = [math.atan2(y - cy, x - cx) % (2 * math.pi) for x, y in cs]
        gaps = [(ang[(i + 1) % 6] - ang[i]) % (2 * math.pi) for i in range(6)]
        for g in gaps:
            self.assertAlmostEqual(g, math.pi / 3, places=6)  # intervalos iguais, mesma ordem (horária)
        self.assertAlmostEqual(out[0][2] - out[0][0], 90, places=6)  # tamanho x0.9

    def test_anel_cresce_so_quando_precisa(self):
        boxes = [(0, 0, 100, 100), (400, 0, 500, 100), (400, 400, 500, 500), (0, 400, 100, 500)]
        _, r_folgado = bhl.even_ring(boxes, 1.0, need=50)
        _, r_apertado = bhl.even_ring(boxes, 1.0, need=2000)
        self.assertLess(r_folgado, r_apertado)
        self.assertAlmostEqual(r_apertado, 2000 / (2 * math_sin_quarter()), places=6)

    def test_ts_gerado_tem_centro_no_meio_e_um_item_por_rosto(self):
        src = bhl.ts_source([(0, 0, 50, 60), (50, 60, 100, 120)], -10, -10, 150, "/images/hero")
        self.assertIn("ORBIT_CENTER = { x: 50.000, y: 50.000 }", src)
        self.assertEqual(src.count('src: "/images/hero/face-'), 2)
        self.assertIn("GERADO por scripts/build_hero_layers.py", src)

    def test_brinde_vira_png_transparente_recortado_e_limitado(self):
        im = Image.new("RGB", (900, 800), (255, 255, 255))
        d = ImageDraw.Draw(im)
        d.ellipse((200, 100, 700, 700), fill=(230, 150, 20))        # caneca (elipse: os cantos do recorte ficam vazios)
        d.rectangle((300, 300, 340, 340), fill=(255, 255, 255))      # bolha branca DENTRO (deve continuar opaca)
        out = bhl.cut_toast(im)
        self.assertEqual(out.mode, "RGBA")
        self.assertLessEqual(max(out.size), 320)
        self.assertEqual(out.getpixel((0, 0))[3], 0)
        self.assertEqual(out.getpixel((out.width // 2, out.height // 2))[3], 255)

    def test_brinde_em_fundo_colorido_remove_buracos_e_halo_branco_mas_guarda_o_branco_do_desenho(self):
        brown = (113, 75, 64)
        im = Image.new("RGB", (400, 400), brown)
        d = ImageDraw.Draw(im)
        d.ellipse((40, 40, 360, 360), fill=(255, 255, 255))              # halo branco puro em volta (recorte ruim)
        d.ellipse((52, 52, 348, 348), fill=(233, 233, 233))              # corpo cinza claro (alça), preservado
        d.ellipse((150, 150, 250, 250), fill=brown)                      # buraco de fundo DENTRO do desenho
        d.ellipse((90, 90, 130, 130), fill=(255, 255, 255))              # brilho branco dentro do desenho
        out = bhl.cut_toast(im, max_side=1000)
        cx, cy = out.width // 2, out.height // 2
        self.assertEqual(out.getpixel((cx, cy))[3], 0, "buraco de fundo dentro do desenho fica transparente")
        # o contorno branco foi descascado: o recorte encolheu até o corpo cinza (~296px) e a borda é cinza, não branca
        self.assertLess(max(out.size), 310)
        self.assertGreater(max(out.size), 280)
        # o branco do brilho (dentro do desenho, fora do halo) continua opaco
        self.assertEqual(out.getpixel((110 - 52, 110 - 52))[3], 255)  # o recorte começa em ~(52, 52)

    def test_brinde_em_fundo_branco_nao_apaga_o_branco_do_desenho(self):
        im = Image.new("RGB", (300, 300), (255, 255, 255))
        d = ImageDraw.Draw(im)
        d.ellipse((30, 30, 270, 270), fill=(230, 150, 20))
        d.ellipse((140, 140, 160, 160), fill=(255, 255, 255))
        out = bhl.cut_toast(im, max_side=1000)
        self.assertEqual(out.getpixel((out.width // 2, out.height // 2))[3], 255)

    def test_brinde_so_com_fundo_falha(self):
        with self.assertRaises(SystemExit):
            bhl.cut_toast(Image.new("RGB", (50, 50), (255, 255, 255)))


if __name__ == "__main__":
    unittest.main()
