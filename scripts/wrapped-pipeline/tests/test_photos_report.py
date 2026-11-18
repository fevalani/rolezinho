from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import photos_report as R  # noqa: E402
import takeout as T  # noqa: E402
from tests import synthetic  # noqa: E402
from tests.test_takeout import GROUPS  # noqa: E402


class ReportTests(unittest.TestCase):
    def test_report_with_named_faces_and_groups(self):
        with tempfile.TemporaryDirectory() as d:
            synthetic.write_takeout(Path(d))
            photos = T.filter_period(T.load_takeout(Path(d)), year=2026)
            out = R.build_report(photos, GROUPS)
        self.assertIn("Origem da data: json", out)
        self.assertIn("Rostos nomeados no Google Fotos", out)
        self.assertIn("Ana", out)
        self.assertRegex(out, r"Ana\s+\d+ fotos \(\d+ só dela\)")
        self.assertIn("Fulano de Tal", out.split("NÃO estão no people_groups:")[1])   # rosto do Google sem membro
        self.assertIn("poucas fotos", out)                                            # Dani só tem 1 foto

    def test_report_without_people_explains_the_limit(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Rolezinho").mkdir()
            (Path(d) / "Rolezinho" / "IMG_20260314_231500.jpg").write_bytes(b"x")
            out = R.build_report(T.load_takeout(Path(d)), {})
        self.assertIn("Rostos nomeados: NENHUM", out)
        self.assertIn("Álbuns: Rolezinho (1)", out)
        self.assertIn("sem people_groups", out)

    def test_weak_dates_are_flagged_and_empty_is_safe(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "a.jpg").write_bytes(b"x")
            self.assertIn("sem data de captura", R.build_report(T.load_takeout(Path(d)), {}))
        self.assertEqual(R.build_report([], {}), "Fotos no período: 0")

    def test_main(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            synthetic.write_takeout(d / "p")
            (d / "cfg.json").write_text(json.dumps({"takeout": {"people_groups": GROUPS}, "period": {"year": 2026}}))
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(R.main(["--photos", str(d / "p"), "--config", str(d / "cfg.json")]), 0)
        self.assertIn("Cobertura por membro", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
