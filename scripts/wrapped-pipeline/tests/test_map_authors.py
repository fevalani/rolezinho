"""De-para dos autores do chat com os nomes do app."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import map_authors as M  # noqa: E402
import parser as P  # noqa: E402
from models import Message  # noqa: E402

APP = ["Guilherme Pereira", "Vitor Lima Silva", "Marcos Valente", "Tiago Carvalho", "Ana Souza"]
PHONE = "+55 11 98765-4321"


def msgs():
    t = datetime(2026, 3, 1, 10)
    mk = lambda a, txt, g="G1", k="text": Message(t, a, txt, k, None, g)
    return [mk("Gui Pereira", "alguém vai no churrasco de sábado?"), mk("Gui Pereira", "oi"), mk(PHONE, "bora marcar a viagem de julho", "G2"),
            mk(PHONE, "meu número é +55 11 98765-4321 anota", "G2"), mk("Você", "chego já", "G2"), mk("Tiago Carvalho", "fechou"),
            mk("Meta AI", "sou um robô com muito texto aqui", "G1"), mk("Felipinho", "kkkkkkkk muito bom isso aqui", "G1")]


class MatchTests(unittest.TestCase):
    def test_nickname_prefix_and_accents(self):
        self.assertGreaterEqual(M.score("Gui Pereira", "Guilherme Pereira"), 0.85)
        self.assertGreaterEqual(M.score("Vitor Lima", "Vitor Lima Silva"), 0.85)
        self.assertGreaterEqual(M.score("Lucas Pandeiro🎒", "Lucas Pandeiro"), 0.9)
        self.assertGreaterEqual(M.score("João", "Joao"), 0.9)
        self.assertGreaterEqual(M.score("Gui Pereira", "Gui"), 0.85)      # o nome do app é parte do nome do chat
        self.assertGreaterEqual(M.score("Pedro Veloso", "Veloso"), 0.85)
        self.assertGreaterEqual(M.score("Tiago Carvalho", "Tiago"), 0.85)
        self.assertGreaterEqual(M.score("Nelson", "nelson"), 0.99)
        self.assertEqual(M.suggest("Tigrão", ["Limão", "Dedé"]), [])          # parecido só por acaso: não sugere
        self.assertLess(M.score("Felipinho", "Ana Souza"), 0.6)
        self.assertEqual(M.score("🎒", "Ana"), 0.0)

    def test_suggest_orders_and_filters(self):
        s = M.suggest("Gui Pereira", APP)
        self.assertEqual(s[0][0], "Guilherme Pereira")
        self.assertEqual(M.suggest("Felipinho", APP), [])

    def test_phone_is_masked_on_screen_but_names_are_not(self):
        self.assertEqual(M.mask(PHONE), "+## ## #####-4321")
        self.assertEqual(M.mask("Ana"), "Ana")
        self.assertNotIn("98765", M.report(M.collect(msgs()), {}, APP))

    def test_collect_skips_bots_and_samples_without_phone_numbers(self):
        info = M.collect(msgs(), samples=3)
        self.assertNotIn("Meta AI", info)
        self.assertEqual(info[PHONE]["count"], 2)
        self.assertEqual(info[PHONE]["samples"], ["bora marcar a viagem de julho"])  # a fala com número não vira exemplo
        self.assertEqual(info["Gui Pereira"]["groups"], ["G1"])
        self.assertEqual(M.collect(msgs(), samples=0)[PHONE]["samples"], [])

    def test_unresolved(self):
        info = M.collect(msgs())
        # nome igual ao do app e nomes já mapeados não pedem decisão
        todo = M.unresolved(info, {"Marcos Valente": ["Você"]}, APP)
        self.assertNotIn("Tiago Carvalho", todo)       # igual ao nome do app
        self.assertNotIn("Você", todo)                # já mapeado
        self.assertIn(PHONE, todo)
        self.assertIn("Gui Pereira", todo)           # nome diferente do app: precisa confirmar
        self.assertEqual(todo, ["Gui Pereira", PHONE, "Felipinho"])  # mais mensagens primeiro (empate: ordem de aparição)


class InteractiveTests(unittest.TestCase):
    def _run(self, answers, aliases=None):
        it = iter(answers)
        out = []
        res = M.interactive(M.collect(msgs()), aliases if aliases is not None else {}, APP, ask=lambda _: next(it), out=out.append)
        return res, "\n".join(out)

    def test_choose_by_number_type_name_skip_and_quit(self):
        # ordem dos pendentes: Gui Pereira, telefone, Você, Felipinho
        res, shown = self._run(["1", "", "Marcos Valente", "q"])
        self.assertEqual(res, {"Marcos Valente": ["Você"], "Guilherme Pereira": ["Gui Pereira"]})  # telefone pulado; 'q' encerra
        self.assertIn("bora marcar a viagem", shown)   # falas de exemplo ajudam a reconhecer quem é
        self.assertNotIn("98765", shown)               # telefone nunca aparece inteiro

    def test_typed_name_is_accepted_and_merge_is_idempotent(self):
        res, _ = self._run(["Beto Novo", "", "", ""], {"Beto Novo": [PHONE]})  # pendentes: Gui, Você, Felipinho
        self.assertEqual(res["Beto Novo"], [PHONE, "Gui Pereira"])  # nome digitado à mão é aceito e acumula
        a = {}
        M.merge_alias(a, "Ana Souza", "Ana")
        M.merge_alias(a, "Ana Souza", "Ana")
        M.merge_alias(a, "Ana Souza", "Ana Souza")     # igual ao nome canônico: não duplica
        self.assertEqual(a, {"Ana Souza": ["Ana"]})

    def test_main_writes_aliases_json_used_by_the_pipeline(self):
        chat = "".join(f"05/03/2026 10:{i:02d} - {a}: mensagem número {i} aqui\n" for i, a in enumerate(["Você", "Gui Pereira", PHONE] * 4))
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "raw").mkdir()
            (d / "raw" / "_chat.txt").write_text(chat, encoding="utf-8")
            (d / "app.txt").write_text("# nomes do app\nMarcos Valente\n\nGuilherme Pereira\nBeto Lima\n", encoding="utf-8")
            answers = iter(["3", "1", "2"])   # telefone → Beto Lima? (ordem: por nº de msgs, empate por nome)
            import builtins
            real = builtins.input
            builtins.input = lambda _="": next(answers)
            try:
                self.assertEqual(M.main(["--input", str(d / "raw"), "--app-names", str(d / "app.txt"), "--interactive", "--samples", "0"]), 0)
            finally:
                builtins.input = real
            aliases = json.loads((d / "raw" / "aliases.json").read_text(encoding="utf-8"))
            self.assertEqual(sorted(sum(aliases.values(), [])), sorted([PHONE, "Você", "Gui Pereira"]))
            # o parser aplica o de-para: o chat inteiro passa a usar os nomes do app
            ms = P.apply_aliases(P.load_input(d / "raw")[0], P.load_aliases(d / "raw" / "aliases.json"))
            self.assertEqual({m.author for m in ms} & {PHONE, "Você", "Gui Pereira"}, set())
            # rodar de novo não pede nada: tudo resolvido
            self.assertEqual(M.unresolved(M.collect(ms), aliases, ["Marcos Valente", "Guilherme Pereira", "Beto Lima"]), [])

    def test_auto_accepts_only_high_confidence(self):
        chat = "".join(f"05/03/2026 10:{i:02d} - {a}: mensagem número {i} aqui\n" for i, a in
                       enumerate(["Gui Pereira", "Tigrão", "Lucas Pandeiro", "Você"] * 3))
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "raw").mkdir()
            (d / "raw" / "_chat.txt").write_text(chat, encoding="utf-8")
            (d / "app.txt").write_text("Gui\nLimão\nLucas Tambor\nDedé\n", encoding="utf-8")
            M.main(["--input", str(d / "raw"), "--app-names", str(d / "app.txt"), "--auto", "0.85", "--samples", "0"])
            self.assertEqual(json.loads((d / "raw" / "aliases.json").read_text()), {"Gui": ["Gui Pereira"]})  # Lucas Tambor (78%) e Tigrão ficam p/ decisão
            M.main(["--input", str(d / "raw"), "--app-names", str(d / "app.txt"), "--auto", "0.85", "--samples", "0"])  # idempotente
            self.assertEqual(json.loads((d / "raw" / "aliases.json").read_text()), {"Gui": ["Gui Pereira"]})

    def test_report_without_app_names_points_phones_and_voce(self):
        out = M.report(M.collect(msgs()), {}, [])
        self.assertIn("[?] +## ## #####-4321", out)
        self.assertIn("[?] Você", out)
        self.assertIn("[ok] Tiago Carvalho", out)


class AliasFileTests(unittest.TestCase):
    def test_forgotten_placeholder_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "aliases.json"
            p.write_text(json.dumps({"PREENCHER: nome": [PHONE]}))
            with self.assertRaisesRegex(ValueError, "a preencher"):
                P.load_aliases(p)


if __name__ == "__main__":
    unittest.main()
