"""Vazamento de dados pessoais: imagens embutidas, telefones, e-mails, avisos do sistema e robôs."""
from __future__ import annotations

import json
import struct
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import build_wrapped as B  # noqa: E402
import imgprivacy as I  # noqa: E402
import parser as P  # noqa: E402
import stats as S  # noqa: E402
from models import Message  # noqa: E402
from tests import synthetic  # noqa: E402


def seg(marker: int, body: bytes) -> bytes:
    return bytes([0xFF, marker]) + struct.pack(">H", 2 + len(body)) + body


SOS = b"\xff\xda" + struct.pack(">H", 8) + b"\x01\x01\x00\x00\x3f\x00"


class EmbeddedImageTests(unittest.TestCase):
    def _phone_photo(self) -> bytes:
        """Como uma foto de celular com HDR: imagem principal + MPF + 2ª imagem (mapa de ganho) com EXIF/GPS próprios."""
        gain_map = b"\xff\xd8" + seg(0xE1, b"Exif\x00\x00" + b"GPS-DO-MAPA-DE-GANHO") + SOS + b"gm" + b"\xff\xd9"
        return (b"\xff\xd8" + seg(0xE0, b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")
                + seg(0xE2, b"ICC_PROFILE\x00\x01\x01" + b"perfil-de-cor")
                + seg(0xE2, b"MPF\x00" + b"aponta-para-imagem-embutida")
                + seg(0xDB, b"\x00" * 10) + SOS + b"PIXELS\x00\xff\x00ok" + b"\xff\xd9" + gain_map)

    def test_second_embedded_image_and_mpf_are_dropped_icc_kept(self):
        out = I.strip_jpeg(self._phone_photo())
        self.assertNotIn(b"GPS", out)
        self.assertNotIn(b"MPF", out)
        self.assertNotIn(b"gm", out)                 # a 2ª imagem foi embora
        self.assertIn(b"perfil-de-cor", out)         # perfil de cor mantido (a foto não muda de cor)
        self.assertIn(b"PIXELS", out)
        self.assertTrue(out.endswith(b"ok\xff\xd9"))  # termina no fim da imagem principal
        self.assertEqual(out.count(b"\xff\xd9"), 1)

    def test_stuffed_ff00_in_pixels_does_not_cut_early(self):
        raw = b"\xff\xd8" + SOS + b"a\xff\x00b\xff\xd0c" + b"\xff\xd9" + b"RESTO-SECRETO"  # FF00 e RST0 são dados
        out = I.strip_jpeg(raw)
        self.assertIn(b"a\xff\x00b\xff\xd0c", out)
        self.assertNotIn(b"SECRETO", out)

    def test_file_without_eoi_is_kept_whole(self):
        out = I.strip_jpeg(b"\xff\xd8" + SOS + b"dados-sem-fim")
        self.assertTrue(out.endswith(b"dados-sem-fim"))


class SystemLineTests(unittest.TestCase):
    def test_system_notices_are_not_people(self):
        t = ("12/03/2026 10:00 - - Nelson mudou as configurações do grupo: só admins podem enviar\n"
             "12/03/2026 10:01 - +55 11 98765-4321 mudou o assunto de \"A\" para \"B\"\n"
             "12/03/2026 10:02 - ~ Fulano adicionou Beltrano\n"
             "12/03/2026 10:03 - Beltrano saiu\n"
             "12/03/2026 10:04 - Ana: ele mudou de ideia e saiu cedo\n"
             "12/03/2026 10:05 - +55 11 98765-4321: oi do contato sem nome\n")
        ms = P.parse_whatsapp_text(t)
        self.assertEqual([(m.author, m.text) for m in ms], [("Ana", "ele mudou de ideia e saiu cedo"),
                                                            ("+55 11 98765-4321", "oi do contato sem nome")])


class ScrubTests(unittest.TestCase):
    def test_phone_and_email_scrubbed_but_numbers_and_dates_kept(self):
        self.assertEqual(B.scrub("ligue +55 11 98765-4321 ou (21) 99999-8888"), "ligue [número] ou [número]")
        self.assertEqual(B.scrub("fale com a@b.com.br agora"), "fale com [e-mail] agora")
        for ok in ("65.099 mensagens", "12/03/2026", "1.234 vezes", "20 áudios", "às 21h30"):
            self.assertEqual(B.scrub(ok), ok)
        self.assertNotIn("98765", B.cut("pix 11 98765-4321 do Beto", 100))

    def test_phone_authors_become_numbered_participants(self):
        ms = [Message(datetime(2026, 1, 1), "+55 11 98765-4321", "a"), Message(datetime(2026, 1, 2), "Ana", "b"),
              Message(datetime(2026, 1, 3), "+55 21 91111-2222", "c"), Message(datetime(2026, 1, 4), "+55 11 98765-4321", "d")]
        out = B.hide_phone_authors(ms)
        self.assertEqual([m.author for m in out], ["Participante 1", "Ana", "Participante 2", "Participante 1"])
        self.assertEqual(B.hide_phone_authors(ms[1:2]), ms[1:2])

    def test_pipeline_output_has_no_phone_bot_or_system_author(self):
        chat, _ = synthetic.build_chat()
        extra = ("06/03/2026 10:00 - +55 11 98765-4321: bom dia, meu email é fulano@x.com e tel 11 98765-4321\n"
                 "06/03/2026 10:01 - Meta AI: sou um robô\n"
                 "06/03/2026 10:02 - - Nelson mudou as configurações do grupo\n"
                 "06/03/2026 10:03 - Você: oi\n") * 25
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "raw").mkdir()
            (d / "raw" / "_chat.txt").write_text(chat + extra, encoding="utf-8")
            (d / "raw" / "aliases.json").write_text(json.dumps({"Fernando": ["Você"]}))
            out = d / "o.json"
            B.main(["--input", str(d / "raw"), "--year", "2026", "--dry-run", "--out", str(out), "--media-dest", str(d / "m"), "--quiet"])
            txt = out.read_text(encoding="utf-8")
            self.assertNotIn("98765", txt)
            self.assertNotIn("fulano@x.com", txt)
            self.assertNotIn("Meta AI", txt)
            self.assertNotIn("mudou as configura", txt)
            self.assertIn("Participante 1", txt)
            self.assertIn("Fernando", txt)         # aliases.json trocou "Você"
            self.assertNotIn("Você", txt)
            # --exclude e config.exclude_authors também funcionam
            B.main(["--input", str(d / "raw"), "--year", "2026", "--dry-run", "--out", str(out), "--media-dest", str(d / "m"),
                    "--quiet", "--exclude", "Fernando"])
            self.assertNotIn("Fernando", out.read_text(encoding="utf-8"))

    def test_warns_about_voce_and_unnamed_numbers(self):
        chat, _ = synthetic.build_chat()
        extra = "06/03/2026 10:00 - +55 11 98765-4321: oi\n06/03/2026 10:03 - Você: oi\n" * 3
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "raw").mkdir()
            (d / "raw" / "_chat.txt").write_text(chat + extra, encoding="utf-8")
            import contextlib
            import io
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                B.main(["--input", str(d / "raw"), "--year", "2026", "--dry-run", "--out", str(d / "o.json"), "--media-dest", str(d / "m")])
            self.assertIn('"Você" é o dono do export', err.getvalue())
            self.assertIn("contatos sem nome salvo", err.getvalue())


class WordTests(unittest.TestCase):
    def test_member_names_and_filler_words_are_not_top_words(self):
        ms = [Message(datetime(2026, 1, 1, 10, i % 60), "Vitor Lima", "lima churrasco acho bom nem porra churrasco") for i in range(5)]
        words = {w["name"] for w in S.compute_stats(ms)["top_words"]}
        self.assertEqual(words, {"churrasco", "porra"})   # nome, "acho", "bom", "nem" saem


if __name__ == "__main__":
    unittest.main()


class AppSlidesTests(unittest.TestCase):
    def _build(self, flag):
        chat, _ = synthetic.build_chat()
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "raw").mkdir()
            (d / "raw" / "_chat.txt").write_text(chat, encoding="utf-8")
            out = d / "o.json"
            B.main(["--input", str(d / "raw"), "--year", "2026", "--dry-run", "--out", str(out), "--media-dest", str(d / "m"), "--quiet", *flag])
            return json.loads(out.read_text(encoding="utf-8"))

    def test_app_slides_default_all_none(self):
        keys = lambda ed: [s["metricKey"] for s in ed["slides"] if s["type"] == "auto_user_stats"]
        self.assertEqual(keys(self._build([])), B.APP_SLIDES["default"])
        self.assertEqual(keys(self._build(["--app-slides", "all"])), B.APP_SLIDES["all"])
        self.assertEqual(keys(self._build(["--app-slides", "none"])), [])
        ed = self._build([])
        titles = [s.get("title") for s in ed["slides"]]
        i = titles.index("Quem Faz o Grupo Rir")
        self.assertEqual(ed["slides"][i + 1]["metricKey"], "summary")   # entram logo depois das estatísticas do chat
        self.assertEqual([s["position"] for s in ed["slides"]], list(range(1, len(ed["slides"]) + 1)))
