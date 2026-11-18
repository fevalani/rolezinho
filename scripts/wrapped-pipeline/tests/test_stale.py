from __future__ import annotations

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import parser as P  # noqa: E402
import takeout as T  # noqa: E402


class StaleExtractionTests(unittest.TestCase):
    def test_chat_from_deleted_zip_is_ignored_but_current_and_loose_are_read(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            with zipfile.ZipFile(d / "Atual.zip", "w") as z:
                z.writestr("_chat.txt", "12/03/2026 14:33 - Ana: do zip atual\n")
            old = d / "_extracted" / "Velho"
            old.mkdir(parents=True)
            (old / "_chat.txt").write_text("12/03/2026 14:34 - Beto: do zip apagado\n", encoding="utf-8")
            (d / "Solto.txt").write_text("12/03/2026 14:35 - Caio: arquivo solto\n", encoding="utf-8")
            ms, _ = P.load_input(d)
            self.assertEqual(sorted(m.text for m in ms), ["arquivo solto", "do zip atual"])

    def test_photos_from_deleted_zip_are_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            with zipfile.ZipFile(d / "Novo.zip", "w") as z:
                z.writestr("Album/novo.jpg", b"x")
            (d / "_extracted" / "Antigo" / "Album").mkdir(parents=True)
            (d / "_extracted" / "Antigo" / "Album" / "antigo.jpg").write_bytes(b"x")
            self.assertEqual([p.path.name for p in T.load_takeout(d)], ["novo.jpg"])

    def test_helper(self):
        b = Path("/x")
        self.assertTrue(P.stale_extraction(b / "_extracted" / "Velho" / "a.jpg", b, {"Novo"}))
        self.assertFalse(P.stale_extraction(b / "_extracted" / "Novo" / "a.jpg", b, {"Novo"}))
        self.assertFalse(P.stale_extraction(b / "a.jpg", b, set()))
        self.assertFalse(P.stale_extraction(Path("/outro/a.jpg"), b, set()))


if __name__ == "__main__":
    unittest.main()
