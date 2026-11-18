"""Takeout (Google Fotos), limpeza de metadados e escolha das fotos dos vencedores."""
from __future__ import annotations

import json
import os
import struct
import sys
import tempfile
import unittest
import zipfile
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import ai_curator  # noqa: E402
import build_wrapped  # noqa: E402
import imgprivacy  # noqa: E402
import photo_curation as PC  # noqa: E402
import takeout as T  # noqa: E402
from photo_curation import Analysis  # noqa: E402
from tests import synthetic  # noqa: E402
from tests.test_pipeline import FIXTURES, StubOllama, run_stub, write_or_compare  # noqa: E402

GROUPS = {
    "Ana": {"google_people": ["Ana S.", "Ana Souza"], "albums": []},   # dois rostos do Google = uma pessoa
    "Beto": {"google_people": ["Beto"], "albums": []},
    "Caio": {"google_people": [], "albums": ["Caio 2026"]},            # por álbum
    "Dani": {"google_people": ["Dani"], "albums": []},
}


class ImgPrivacyTests(unittest.TestCase):
    def test_jpeg_loses_gps_keeps_orientation_and_image(self):
        raw = synthetic.fake_jpeg(orientation=6, marker=b"PIXELS")
        self.assertIn(synthetic.GPS_SECRET, raw)
        out = imgprivacy.strip_jpeg(raw)
        self.assertNotIn(synthetic.GPS_SECRET, out)
        self.assertNotIn(b"Exif" + b"\x00\x00MM", out)
        self.assertIn(b"PIXELS", out)       # dados da imagem intactos
        self.assertIn(b"JFIF", out)         # APP0 mantido
        i = out.index(b"Exif\x00\x00")
        self.assertEqual(imgprivacy._orientation(out[i + 6:]), 6)  # orientação preservada
        self.assertTrue(out.startswith(b"\xff\xd8") and out.endswith(b"\xff\xd9"))
        self.assertEqual(imgprivacy.strip_jpeg(out), out)  # idempotente

    def test_jpeg_without_orientation_has_no_exif_at_all(self):
        self.assertNotIn(b"Exif", imgprivacy.strip_jpeg(synthetic.fake_jpeg(orientation=1)))

    def test_xmp_comment_and_iptc_dropped(self):
        xmp = b"\xff\xe1" + struct.pack(">H", 2 + 29) + b"http://ns.adobe.com/xap/1.0/\x00"
        com = b"\xff\xfe" + struct.pack(">H", 2 + 6) + b"SEGRED"
        raw = b"\xff\xd8" + xmp + com + b"\xff\xda" + struct.pack(">H", 8) + b"\x01\x01\x00\x00\x3f\x00" + b"zz\xff\xd9"
        out = imgprivacy.strip_jpeg(raw)
        self.assertNotIn(b"adobe", out)
        self.assertNotIn(b"SEGRED", out)

    def test_png_text_chunks_dropped(self):
        def chunk(k, d):
            return struct.pack(">I", len(d)) + k + d + b"\x00\x00\x00\x00"
        png = imgprivacy._PNG_SIG + chunk(b"IHDR", b"\x00" * 13) + chunk(b"tEXt", b"GPS\x00SECRET") + chunk(b"eXIf", b"EXIFSECRET") + chunk(b"IDAT", b"pix") + chunk(b"IEND", b"")
        out = imgprivacy.strip_png(png)
        self.assertNotIn(b"SECRET", out)
        self.assertIn(b"IDAT", out)

    def test_invalid_or_unsupported_is_refused(self):
        for data, ext in ((b"nada", ".jpg"), (b"\xff\xd8\xff\xe0\x00", ".jpg"), (b"x", ".png"), (b"x", ".heic"), (b"x", ".webp")):
            with self.assertRaises(ValueError):
                imgprivacy.clean_bytes(data, ext)

    def test_clean_media_dir_only_removes_generated_photos(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            for n in ("foto-01.jpg", "ilustra-02.jpg", "piada-03.png", "minha-capa.jpg"):
                (d / n).write_bytes(b"x")
            imgprivacy.clean_media_dir(d)
            self.assertEqual(sorted(p.name for p in d.iterdir()), ["minha-capa.jpg"])


def exif_jpeg(dt: str | None, endian: str = "<", digitized: str | None = None, ifd0_dt: str | None = None) -> bytes:
    """JPEG válido com EXIF contendo DateTimeOriginal (e opcionalmente Digitized / DateTime)."""
    e = endian
    bo = b"II" if e == "<" else b"MM"

    def ascii20(v: str) -> bytes:
        return v.encode() + b"\x00"
    # layout: header(8) | IFD0 | ExifIFD | strings
    ifd0_entries = [(0x8769, 4, 1, 0)]  # ponteiro p/ ExifIFD (offset preenchido depois)
    if ifd0_dt:
        ifd0_entries.append((0x0132, 2, 20, 0))
    ex_entries = []
    if dt:
        ex_entries.append((0x9003, 2, 20, 0))
    if digitized:
        ex_entries.append((0x9004, 2, 20, 0))
    ifd0_off = 8
    ifd0_len = 2 + 12 * len(ifd0_entries) + 4
    ex_off = ifd0_off + ifd0_len
    ex_len = 2 + 12 * len(ex_entries) + 4
    str_off = ex_off + ex_len
    strings = b""
    ifd0 = struct.pack(e + "H", len(ifd0_entries))
    for tag, typ, cnt, _ in ifd0_entries:
        if tag == 0x8769:
            ifd0 += struct.pack(e + "HHII", tag, typ, cnt, ex_off)
        else:
            ifd0 += struct.pack(e + "HHII", tag, typ, cnt, str_off + len(strings))
            strings += ascii20(ifd0_dt)
    ifd0 += struct.pack(e + "I", 0)
    ex = struct.pack(e + "H", len(ex_entries))
    for tag, typ, cnt, _ in ex_entries:
        v = dt if tag == 0x9003 else digitized
        ex += struct.pack(e + "HHII", tag, typ, cnt, str_off + len(strings))
        strings += ascii20(v)
    ex += struct.pack(e + "I", 0)
    tiff = bo + (b"*\x00" if e == "<" else b"\x00*") + struct.pack(e + "I", 8) + ifd0 + ex + strings
    body = b"Exif\x00\x00" + tiff
    app1 = b"\xff\xe1" + struct.pack(">H", 2 + len(body)) + body
    sos = b"\xff\xda" + struct.pack(">H", 8) + b"\x01\x01\x00\x00\x3f\x00"
    return b"\xff\xd8" + app1 + sos + b"\x00\x01\xff\xd9"


class DateFallbackTests(unittest.TestCase):
    def _load(self, name: str, data: bytes, meta: dict | None = None):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / name).write_bytes(data)
            os.utime(d / name, (1_800_000_000, 1_800_000_000))  # mtime "errado" (jan/2027)
            if meta is not None:
                (d / (name + ".json")).write_text(json.dumps(meta))
            return T.load_takeout(d)[0]

    def test_exif_both_byte_orders(self):
        for e in ("<", ">"):
            p = self._load("a.jpg", exif_jpeg("2026-03-14 23:15:00".replace("-", ":", 2), e))
            self.assertEqual((p.taken, p.date_source), (datetime(2026, 3, 14, 23, 15), "exif"), e)

    def test_exif_prefers_original_then_digitized_then_datetime(self):
        a = self._load("a.jpg", exif_jpeg("2026:01:01 10:00:00", digitized="2026:02:02 10:00:00", ifd0_dt="2026:03:03 10:00:00"))
        b = self._load("b.jpg", exif_jpeg(None, digitized="2026:02:02 10:00:00", ifd0_dt="2026:03:03 10:00:00"))
        c = self._load("c.jpg", exif_jpeg(None, ifd0_dt="2026:03:03 10:00:00"))
        self.assertEqual([x.taken.month for x in (a, b, c)], [1, 2, 3])

    def test_json_beats_exif_and_exif_beats_name_and_mtime(self):
        ts = int((datetime(2026, 5, 5, 15) - datetime(1970, 1, 1)).total_seconds())
        j = self._load("IMG_20260101_000000.jpg", exif_jpeg("2026:02:02 10:00:00"), {"photoTakenTime": {"timestamp": str(ts)}})
        self.assertEqual((j.taken, j.date_source), (datetime(2026, 5, 5, 12), "json"))
        x = self._load("IMG_20260101_000000.jpg", exif_jpeg("2026:02:02 10:00:00"))
        self.assertEqual((x.taken.month, x.date_source), (2, "exif"))

    def test_filename_date_patterns(self):
        for name, want in (("IMG_20260314_231500.jpg", datetime(2026, 3, 14, 23, 15)), ("PXL_20260314_231500123.jpg", datetime(2026, 3, 14, 23, 15)),
                           ("WhatsApp Image 2026-03-14 at 23.15.00.jpeg", datetime(2026, 3, 14, 23, 15)), ("IMG-20260314-WA0001.jpg", datetime(2026, 3, 14, 12))):
            p = self._load(name, b"nao-eh-jpeg")
            self.assertEqual((p.taken, p.date_source), (want, "nome"), name)

    def test_mtime_is_last_resort_and_garbage_exif_is_safe(self):
        p = self._load("foto.jpg", b"\xff\xd8\xff\xe1\x00\x08Exif\x00\x00zz\xff\xda")  # EXIF truncado
        self.assertEqual(p.date_source, "mtime")
        self.assertEqual(self._load("IMG_20261340_000000.jpg", b"x").date_source, "mtime")  # mês/dia impossíveis


class TakeoutTests(unittest.TestCase):
    def test_sidecar_variants(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            long = "a" * 60 + ".jpg"
            files = {
                "IMG_1.jpg": "IMG_1.jpg.json",
                "IMG_2.jpg": "IMG_2.jpg.supplemental-metadata.json",
                "IMG_3.jpg": "IMG_3.jpg.supplemental-metad.json",     # sufixo truncado
                "IMG_4-editado.jpg": "IMG_4.jpg.json",                 # versão editada usa o json do original
                "IMG_5(1).jpg": "IMG_5.jpg(1).json",                   # duplicata numerada
                long: long[:46] + ".json",                             # nome longo truncado em 46
                "sem_json.jpg": None,
            }
            for img, js in files.items():
                (d / img).write_bytes(b"x")
                if js:
                    (d / js).write_text(json.dumps({"photoTakenTime": {"timestamp": "1773529800"}, "people": [{"name": "Ana S."}]}))
            os.utime(d / "sem_json.jpg", (1_700_000_000, 1_700_000_000))
            by = {p.path.name: p for p in T.load_takeout(d)}
            for img, js in files.items():
                self.assertEqual(by[img].people, ("Ana S.",) if js else (), img)
            self.assertEqual(by["sem_json.jpg"].taken.year, 2023)  # sem json: data do arquivo

    def test_timestamp_converted_to_brt(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "a.jpg").write_bytes(b"x")
            # 2026-03-15 02:30:00 UTC = 2026-03-14 23:30 em Brasília
            ts = int((datetime(2026, 3, 15, 2, 30) - datetime(1970, 1, 1)).total_seconds())
            (Path(d) / "a.jpg.json").write_text(json.dumps({"photoTakenTime": {"timestamp": str(ts)}}))
            self.assertEqual(T.load_takeout(Path(d))[0].taken, datetime(2026, 3, 14, 23, 30))

    def test_zip_dedupe_albums_and_ignores_geo(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            synthetic.write_takeout(d / "src")
            (d / "in").mkdir()
            with zipfile.ZipFile(d / "in" / "takeout-001.zip", "w") as z:
                for f in (d / "src").rglob("*"):
                    if f.is_file():
                        z.write(f, f.relative_to(d / "src"))
            photos = T.load_takeout(d / "in")
            self.assertEqual(len(photos), 8)  # ana_solo aparece em 2 pastas → 1 foto
            ana = next(p for p in photos if p.path.name == "ana_solo.jpg")
            self.assertEqual(ana.albums, ("Rolê 2026",))  # "Fotos de 2026" não conta como álbum
            self.assertFalse(hasattr(ana, "geo"))
            evil = d / "evil.zip"
            with zipfile.ZipFile(evil, "w") as z:
                z.writestr("../x.jpg", b"x")
            with self.assertRaises(ValueError):
                T.load_takeout(evil)

    def test_missing_path(self):
        with self.assertRaises(FileNotFoundError):
            T.load_takeout(Path("/nao/existe"))

    def test_period_and_people_groups(self):
        with tempfile.TemporaryDirectory() as d:
            synthetic.write_takeout(Path(d))
            photos = T.filter_period(T.load_takeout(Path(d)), year=2026)
            self.assertNotIn("antiga_2025.jpg", [p.path.name for p in photos])
            half = T.filter_period(photos, start=datetime(2026, 6, 1), end=datetime(2026, 8, 1))
            self.assertEqual(sorted(p.path.name for p in half), ["beto_solo.jpg", "dani_e_ana.jpg"])
            by = {p.path.name: T.members_of(p, GROUPS) for p in photos}
            self.assertEqual(by["ana_solo.jpg"], ("Ana",))
            self.assertEqual(by["ana_dia.jpg"], ("Ana",))             # outro rosto do Google → mesma pessoa
            self.assertEqual(by["dani_e_ana.jpg"], ("Ana", "Dani"))   # foto com duas pessoas
            self.assertEqual(by["desconhecido.jpg"], ())
            self.assertEqual(by["caio_solo.jpg"], ())                  # Caio só por álbum "Caio 2026"
            # álbum também identifica a pessoa, sem depender do nome do rosto
            alb = T.TakeoutPhoto(Path("x.jpg"), datetime(2026, 1, 1), (), ("caio 2026",))
            self.assertEqual(T.members_of(alb, GROUPS), ("Caio",))

    def test_candidates_prefer_solo_and_cap_per_day(self):
        mk = lambda n, size, people, day: T.TakeoutPhoto(Path(n), datetime(2026, 1, day, 12), people, (), "", size)
        photos = [mk("grupo.jpg", 500_000, ("Ana S.", "Dani"), 1), mk("solo_pequena.jpg", 1000, ("Ana S.",), 2),
                  mk("solo_boa.jpg", 500_000, ("Ana S.",), 3)] + [mk(f"d{i}.jpg", 1000, ("Ana S.",), 9) for i in range(5)]
        got = [p.path.name for p, _ in T.candidates(photos, GROUPS, per_member=4, per_day=2)["Ana"]]
        self.assertEqual(got[0], "solo_boa.jpg")                       # solo + qualidade primeiro
        self.assertEqual(sum(n.startswith("d") for n in got), 2)       # no máx. 2 no mesmo dia
        self.assertEqual(len(got), 4)


class MomentTests(unittest.TestCase):
    def _a(self, name, when, funny=5, sensitive=False, size=1000):
        return Analysis(T.TakeoutPhoto(Path(name), when, (), (), "", size), (), name, funny, "Rolê", sensitive)

    def test_moment_candidates_near_peaks_plus_best_of_each_session(self):
        mk = lambda n, d, h, size=1000: T.TakeoutPhoto(Path(n), datetime(2026, 3, d, h), (), (), "", size)
        win = [(datetime(2026, 3, 1, 21), datetime(2026, 3, 1, 22))]
        photos = [mk("perto1", 1, 20, 5), mk("perto2", 1, 23, 9), mk("longe", 15, 12),
                  mk("s1a", 5, 10, 10), mk("s1b", 5, 11, 90), mk("s1c", 5, 12, 20),   # sessão grande (3 fotos)
                  mk("s2a", 9, 10, 70), mk("s2b", 9, 11, 30),                          # sessão média (2)
                  mk("solta", 20, 8, 99)]                                              # sessão de 1
        got = [p.path.name for p in T.moment_candidates(photos, win, per_window=1, margin_h=2, extra=0)]
        self.assertEqual(got, ["perto2"])               # só a maior das próximas ao pico (±2h)
        got = [p.path.name for p in T.moment_candidates(photos, win, per_window=1, margin_h=2, extra=2)]
        self.assertEqual(got, ["perto2", "s1b", "s2a"])  # + a melhor de cada sessão grande, da maior para a menor
        self.assertEqual(len(T.moment_candidates(photos, [], 1, 2, extra=99)), 5)  # sem picos: 1 por sessão

    def test_event_photo_is_funniest_nearby_unique_and_not_sensitive(self):
        e1 = (datetime(2026, 3, 1, 21), datetime(2026, 3, 1, 22))
        e2 = (datetime(2026, 3, 1, 22, 30), datetime(2026, 3, 1, 23))  # sobrepõe a janela do e1
        an = [self._a("longe", datetime(2026, 3, 9, 21), funny=10),
              self._a("sensivel", datetime(2026, 3, 1, 21, 10), funny=10, sensitive=True),
              self._a("boa", datetime(2026, 3, 1, 21, 30), funny=8),
              self._a("ok", datetime(2026, 3, 1, 22, 40), funny=6)]
        got = PC.pick_event_photos([e1, e2], an)
        self.assertEqual({k: a.caption for k, a in got.items()}, {0: "boa", 1: "ok"})  # sem repetir e sem sensível
        self.assertEqual(PC.pick_event_photos([e1, e2], an, max_n=1).keys(), {0})
        self.assertEqual(PC.pick_event_photos([(datetime(2030, 1, 1), datetime(2030, 1, 1))], an), {})

    def test_exclude_used_photos_from_winner_and_jokes(self):
        a = self._a("a", datetime(2026, 1, 1), funny=9)
        b = self._a("b", datetime(2026, 1, 2), funny=8)
        chosen, jokes = PC.pick_illustrations([], [a, b], 8, 3, exclude={a})
        self.assertEqual([j.caption for j in jokes], ["b"])


class WinnerOnlyTests(unittest.TestCase):
    def test_only_first_place_members_need_photos(self):
        st = {"talkers": [{"name": "Ana"}, {"name": "Beto"}], "essayists": [{"name": "Ana"}], "ghosts": [{"name": "Caio"}],
              "owls": [], "audio": [{"name": "Beto"}], "funniest": [], "words": [{"name": "churrasco"}]}
        self.assertEqual(build_wrapped.winner_names(st), {"Ana", "Caio", "Beto"})   # Dani não ganha nada: sem análise de foto
        self.assertEqual(build_wrapped.winner_names({}), set())


class PersonMomentTests(unittest.TestCase):
    def _a(self, name, member, when, funny=5, sensitive=False, size=1000):
        return Analysis(T.TakeoutPhoto(Path(name), when, (member,), (), "", size), (member,), name, funny, "Rolê", sensitive)

    def test_photo_near_the_persons_busiest_day_beats_funnier_far_one(self):
        far = self._a("longe_e_engracada", "Ana", datetime(2026, 8, 1, 15), funny=10)
        near = self._a("perto_do_momento", "Ana", datetime(2026, 3, 15, 10), funny=4)   # 1 dia depois do pico dela
        moments = {"Ana": [datetime(2026, 3, 14, 12)]}
        got = PC.pick_illustrations([("talkers", "Ana")], [far, near], moments=moments, moment_days=2)[0]["talkers"]
        self.assertEqual(got.caption, "perto_do_momento")
        # fora da janela (±2 dias) o momento não conta: volta a valer a nota de graça
        got = PC.pick_illustrations([("talkers", "Ana")], [far, near], moments=moments, moment_days=0.5)[0]["talkers"]
        self.assertEqual(got.caption, "longe_e_engracada")
        # momento de OUTRA pessoa não ajuda a Ana
        got = PC.pick_illustrations([("talkers", "Ana")], [far, near], moments={"Beto": [datetime(2026, 3, 14, 12)]})[0]["talkers"]
        self.assertEqual(got.caption, "longe_e_engracada")

    def test_owls_still_prefer_night_over_moment(self):
        noite = self._a("noite", "Ana", datetime(2026, 9, 9, 2), funny=3)
        momento = self._a("momento", "Ana", datetime(2026, 3, 14, 15), funny=9)
        got = PC.pick_illustrations([("owls", "Ana")], [noite, momento], moments={"Ana": [datetime(2026, 3, 14, 12)]})[0]["owls"]
        self.assertEqual(got.caption, "noite")

    def test_candidates_prefer_photos_where_only_that_person_is_tagged(self):
        g = {"Ana": {"google_people": ["Ana S."]}}
        mk = lambda n, people, day: T.TakeoutPhoto(Path(n), datetime(2026, 1, day, 12), people, (), "", 500_000)
        photos = [mk("com_gente_de_fora.jpg", ("Ana S.", "Fulano"), 1), mk("so_ela.jpg", ("Ana S.",), 2)]
        got = [p.path.name for p, _ in T.candidates(photos, g, per_member=2)["Ana"]]
        self.assertEqual(got, ["so_ela.jpg", "com_gente_de_fora.jpg"])  # "Fulano" não é membro, mas conta como outra pessoa


class PickTests(unittest.TestCase):
    def _a(self, name, members, hour=12, funny=5, sensitive=False):
        return Analysis(T.TakeoutPhoto(Path(name), datetime(2026, 1, 1, hour)), tuple(members), name, funny, "Rolê", sensitive)

    def test_winners_get_distinct_photos_sensitive_never_and_cap(self):
        an = [self._a("a1", ["Ana"], funny=3), self._a("a2", ["Ana"], funny=9), self._a("a3", ["Ana"], funny=7, sensitive=True),
              self._a("b1", ["Beto"], funny=4)]
        chosen, jokes = PC.pick_illustrations([("talkers", "Ana"), ("essayists", "Ana"), ("ghosts", "Beto"), ("audio", "Caio")], an, 8, 3)
        self.assertEqual(chosen["talkers"].caption, "a2")
        self.assertEqual(chosen["essayists"].caption, "a1")      # a3 é sensível: nunca; a2 já usada
        self.assertEqual(chosen["ghosts"].caption, "b1")
        self.assertNotIn("audio", chosen)                         # Caio sem foto
        self.assertNotIn("a3", [x.caption for x in list(chosen.values()) + jokes])
        self.assertEqual(len(PC.pick_illustrations([("talkers", "Ana"), ("essayists", "Ana")], an, 1, 3)[0]), 1)

    def test_owls_prefer_night_photo(self):
        an = [self._a("dia", ["Ana"], hour=15, funny=9), self._a("noite", ["Ana"], hour=2, funny=2)]
        self.assertEqual(PC.pick_illustrations([("owls", "Ana")], an)[0]["owls"].caption, "noite")
        self.assertEqual(PC.pick_illustrations([("talkers", "Ana")], an)[0]["talkers"].caption, "dia")

    def test_jokes_need_score_and_respect_total_cap(self):
        an = [self._a(f"p{i}", ["Ana"], funny=s) for i, s in enumerate([9, 8, 7, 6, 5, 2])]
        chosen, jokes = PC.pick_illustrations([("talkers", "Ana")], an, max_published=3, joke_slides=5)
        self.assertEqual(len(chosen) + len(jokes), 3)
        self.assertTrue(all(j.funny >= PC.JOKE_MIN_SCORE for j in jokes))
        self.assertEqual(PC.pick_illustrations([], [self._a("x", ["Ana"], funny=0)], 8, 3)[1], [])  # sem IA: sem piada

    def test_schema_validation_for_takeout(self):
        ok = {"caption": "x", "funny_score": 7, "theme": "Pet", "sensitive": False}
        ai_curator.validate(ok, ai_curator.TAKEOUT_SCHEMA)
        for bad in ({**ok, "funny_score": 11}, {**ok, "funny_score": 0}, {**ok, "sensitive": "não"}, {**ok, "theme": "Nudez"}, {**ok, "funny_score": True}):
            with self.assertRaises(ValueError):
                ai_curator.validate(bad, ai_curator.TAKEOUT_SCHEMA)


def build(d: Path, extra: list[str], cfg_tk: dict | None = None, groups: bool = True):
    synthetic.write_fixture(d / "raw")
    files = synthetic.write_takeout(d / "photos")
    tk = {"path": str(d / "photos"), "candidates_per_member": 3, "max_published": 8, "joke_slides": 2, **(cfg_tk or {})}
    if groups and "people_groups" not in (cfg_tk or {}):
        tk["people_groups"] = {**GROUPS, "Caio": {"google_people": ["Caio"], "albums": []}}
    cfg = {"takeout": tk}
    (d / "cfg.json").write_text(json.dumps(cfg))
    out = d / "out.json"
    argv = ["--input", str(d / "raw"), "--year", "2026", "--config", str(d / "cfg.json"), "--out", str(out),
            "--media-dest", str(d / "media"), "--quiet", "--top-peaks", "2", *extra]
    assert build_wrapped.main(argv) == 0
    return json.loads(out.read_text(encoding="utf-8")), files


class EndToEndTests(unittest.TestCase):
    def test_full_run_with_stub(self):
        srv, url = run_stub()
        try:
            with tempfile.TemporaryDirectory() as d:
                d = Path(d)
                ed, files = build(d, ["--model", "stub", "--ollama-url", url])
                media = sorted(p.name for p in (d / "media").iterdir())
                ilustra = [m for m in media if m.startswith("ilustra")]
                piada = [m for m in media if m.startswith("piada")]
                self.assertTrue(ilustra)
                self.assertLessEqual(len(ilustra) + len(piada), 8)                  # max_published
                for m in ilustra + piada:                                           # nada de GPS nas publicadas
                    self.assertNotIn(synthetic.GPS_SECRET, (d / "media" / m).read_bytes())
                self.assertIn(synthetic.GPS_SECRET, files["ana_solo.jpg"].read_bytes())  # original intacto
                published = b"".join((d / "media" / m).read_bytes() for m in ilustra + piada)
                self.assertNotIn(b"SENSITIVE", published)                           # foto sensível nunca sobe
                # as fotos dos vencedores aparecem no 1º item do ranking, só nele
                with_img = [(s.get("title", ""), i["rank"]) for s in ed["slides"] for i in s.get("items", []) if i.get("imageUrl")]
                self.assertTrue(with_img)
                self.assertTrue(all(rank == 1 for _, rank in with_img))
                self.assertTrue(all(i["imageUrl"].startswith("/wrapped/2026/media/ilustra-")
                                    for s in ed["slides"] for i in s.get("items", []) if i.get("imageUrl")))
                jokes = [s for s in ed["slides"] if s["type"] == "media" and "piada" in s["imageUrl"]]
                self.assertTrue(all(s.get("title", "") == "Legenda da foto do Takeout" for s in jokes))
                # a foto de 2025 e a de pessoa desconhecida nunca foram analisadas
                sent = [p for pth, p in StubOllama.calls if pth == "/api/chat" and "Foto da biblioteca" in p["messages"][-1]["content"]]
                self.assertTrue(sent)
                self.assertTrue(all("Fulano" not in p["messages"][-1]["content"] for p in sent))
                write_or_compare("expected_takeout.json", ed, self)
        finally:
            srv.shutdown(); srv.server_close()

    def test_moment_mode_illustrates_events_without_people_groups(self):
        srv, url = run_stub()
        try:
            with tempfile.TemporaryDirectory() as d:
                d = Path(d)
                ed, _ = build(d, ["--model", "stub", "--ollama-url", url, "--top-peaks", "3", "--events", "3", "--photo-slides", "0"], groups=False)
                events = [s for s in ed["slides"] if s["type"] == "highlight" and s.get("title", "") == "A grande discussão"]
                self.assertEqual(len(events), 3)
                self.assertTrue(all(e["imageUrl"].startswith("/wrapped/2026/media/ilustra-") for e in events))
                # sem people_groups ninguém é "vencedor com foto": nenhum item de ranking tem imagem
                self.assertFalse([i for s in ed["slides"] for i in s.get("items", []) if i.get("imageUrl")])
                # e o prompt não pediu para identificar ninguém
                prompts = [p["messages"][-1]["content"] for pth, p in StubOllama.calls if pth == "/api/chat" and "Foto da biblioteca" in p["messages"][-1]["content"]]
                self.assertTrue(prompts and all("Não tente reconhecer" in t for t in prompts))
                for f in (d / "media").iterdir():
                    self.assertNotIn(synthetic.GPS_SECRET, f.read_bytes())
                    self.assertNotIn(b"SENSITIVE", f.read_bytes())
                write_or_compare("expected_moment.json", ed, self)
        finally:
            srv.shutdown(); srv.server_close()

    def test_people_outside_the_groups_are_never_analyzed_or_published(self):
        import base64
        srv, url = run_stub()
        try:
            with tempfile.TemporaryDirectory() as d:
                d = Path(d)
                groups = {**GROUPS, "Caio": {"google_people": ["Caio"], "albums": []},
                          "Perfil Sem Chat": {"google_people": ["Fulano de Tal"], "albums": []}}   # perfil que não fala no chat
                ed, _ = build(d, ["--model", "stub", "--ollama-url", url, "--top-peaks", "3"],
                              {"people_groups": groups, "exclude_people": ["Dani"], "extra_candidates": 20, "max_analyzed": 60})
                sent = [base64.b64decode(p["messages"][-1]["images"][0]) for pth, p in StubOllama.calls
                        if pth == "/api/chat" and p["messages"][-1].get("images") and "Foto da biblioteca" in p["messages"][-1]["content"]]
                self.assertTrue(sent)
                self.assertFalse(any(b"DANIFOTO" in b for b in sent))                    # foto com Dani: nem foi enviada ao modelo
                for f in (d / "media").iterdir():
                    self.assertNotIn(b"DANIFOTO", f.read_bytes())
                self.assertNotIn("Perfil Sem Chat", json.dumps(ed, ensure_ascii=False))          # sem mensagens: nunca vencedor
        finally:
            srv.shutdown(); srv.server_close()

    def test_publish_false_analyses_but_publishes_nothing(self):
        srv, url = run_stub()
        try:
            with tempfile.TemporaryDirectory() as d:
                d = Path(d)
                ed, _ = build(d, ["--model", "stub", "--ollama-url", url], {"publish": False})
                self.assertFalse([m for m in (d / "media").iterdir() if m.name.startswith(("ilustra", "piada"))])
                self.assertFalse(any(i.get("imageUrl", "").find("ilustra") >= 0 for s in ed["slides"] for i in s.get("items", [])))
                self.assertTrue(any(s["type"] == "highlight" and s.get("title", "") == "Legenda da foto do Takeout" for s in ed["slides"]))  # piada só em texto
        finally:
            srv.shutdown(); srv.server_close()

    def test_dry_run_never_calls_ollama_and_makes_no_jokes(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            StubOllama.calls = []
            ed, _ = build(d, ["--dry-run"])
            self.assertEqual(StubOllama.calls, [])
            self.assertTrue(any(m.name.startswith("ilustra") for m in (d / "media").iterdir()))
            self.assertFalse(any(s["type"] == "highlight" and "Takeout" in s.get("title", "") for s in ed["slides"]))
            self.assertFalse(any("imageUrl" in s for s in ed["slides"] if s["type"] == "highlight"))  # sem IA, sem foto de evento

    def test_no_takeout_flag_and_missing_groups(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            _, _ = build(d, ["--dry-run", "--no-takeout"])
            self.assertFalse(any(m.name.startswith(("ilustra", "piada")) for m in (d / "media").iterdir()))
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            synthetic.write_fixture(d / "raw")
            synthetic.write_takeout(d / "photos")
            (d / "cfg.json").write_text(json.dumps({"takeout": {"path": str(d / "photos")}}))  # sem people_groups
            build_wrapped.main(["--input", str(d / "raw"), "--year", "2026", "--dry-run", "--config", str(d / "cfg.json"),
                                "--out", str(d / "o.json"), "--media-dest", str(d / "media"), "--quiet"])
            self.assertFalse(any(m.name.startswith("ilustra") for m in (d / "media").iterdir()))

    def test_stale_published_photos_are_removed_on_rerun(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "media").mkdir()
            (d / "media" / "ilustra-09.jpg").write_bytes(b"antiga")
            build(d, ["--dry-run"])
            self.assertFalse((d / "media" / "ilustra-09.jpg").exists())

    def test_config_provides_model_and_year(self):
        srv, url = run_stub()
        try:
            with tempfile.TemporaryDirectory() as d:
                d = Path(d)
                synthetic.write_fixture(d / "raw")
                (d / "cfg.json").write_text(json.dumps({"model": {"name": "do-config", "url": url, "vision": False}, "period": {"year": 2026}}))
                StubOllama.calls = []
                build_wrapped.main(["--input", str(d / "raw"), "--config", str(d / "cfg.json"), "--out", str(d / "o.json"),
                                    "--media-dest", str(d / "media"), "--quiet", "--top-peaks", "1", "--archetypes", "1"])
                chats = [p for pth, p in StubOllama.calls if pth == "/api/chat"]
                self.assertTrue(chats and all(p["model"] == "do-config" for p in chats))
                self.assertFalse(any("images" in p["messages"][-1] for p in chats))  # vision:false no config
        finally:
            srv.shutdown(); srv.server_close()


if __name__ == "__main__":
    unittest.main()
