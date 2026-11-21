"""Testes do pipeline de estatísticas do chat (dados 100% sintéticos, sem rede nem Ollama real)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "wrapped-pipeline"))

import ai_curator  # noqa: E402
import insights  # noqa: E402
import run_insights  # noqa: E402
import topics  # noqa: E402
from models import Message  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("synthetic", HERE.parent / "wrapped-pipeline" / "tests" / "synthetic.py")
_syn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_syn)
write_fixture = _syn.write_fixture  # chat sintético do pipeline do Wrapped

T0 = datetime(2026, 3, 1, 20, 0)


def msg(mins: float, author: str, text: str = "oi", kind: str = "text", group: str = "") -> Message:
    return Message(ts=T0 + timedelta(minutes=mins), author=author, text=text, kind=kind, group=group)


class ConversationsTest(unittest.TestCase):
    def test_silencio_maior_que_3h_separa_conversas(self):
        c = insights.conversations([msg(0, "A"), msg(5, "B"), msg(5 + 181, "A")])
        self.assertEqual([len(x) for x in c], [2, 1])

    def test_exatamente_3h_continua_a_mesma(self):
        self.assertEqual(len(insights.conversations([msg(0, "A"), msg(180, "B")])), 1)

    def test_mensagem_apagada_e_ignorada(self):
        c = insights.conversations([msg(0, "A"), msg(1, "B", "", "deleted"), msg(2, "A")])
        self.assertEqual(sum(len(x) for x in c), 2)

    def test_grupos_diferentes_nao_se_misturam(self):
        c = insights.conversations([msg(0, "A", group="g1"), msg(1, "B", group="g2")])
        self.assertEqual(len(c), 2)


class StreakTest(unittest.TestCase):
    def test_vazio(self):
        self.assertIsNone(insights.longest_streak(set()))

    def test_maior_sequencia(self):
        days = {date(2026, 1, d) for d in (1, 2, 3, 10, 11, 12, 13, 20)}
        self.assertEqual(insights.longest_streak(days), {"days": 4, "start": "2026-01-10", "end": "2026-01-13"})

    def test_dia_unico(self):
        self.assertEqual(insights.longest_streak({date(2026, 1, 1)})["days"], 1)


class ResponseTest(unittest.TestCase):
    def test_tempo_so_conta_quando_muda_o_autor(self):
        times, pairs = insights.response_times([msg(0, "A"), msg(1, "A"), msg(4, "B")])
        self.assertEqual(times, {"B": [180.0]})
        self.assertEqual(pairs[("B", "A")], 1)

    def test_resposta_depois_de_30_min_nao_conta(self):
        times, pairs = insights.response_times([msg(0, "A"), msg(31, "B")])
        self.assertEqual(dict(times), {})
        self.assertEqual(sum(pairs.values()), 0)


class CatchphraseTest(unittest.TestCase):
    def test_repeticao_vira_bordao_e_acha_o_autor(self):
        ms = [msg(i, "Ana" if i % 3 else "Beto", "bora tomar uma gelada") for i in range(10)]
        out = insights.catchphrases(ms, min_count=8)
        self.assertEqual(out[0]["count"], 10)
        self.assertEqual(out[0]["topAuthor"], "Ana")

    def test_abaixo_do_minimo_nao_entra(self):
        self.assertEqual(insights.catchphrases([msg(i, "A", "bora tomar uma gelada") for i in range(7)], min_count=8), [])

    def test_so_stopwords_nao_entra(self):
        self.assertEqual(insights.catchphrases([msg(i, "A", "que isso de um") for i in range(20)]), [])


def chat(n_each: int = 30) -> list[Message]:
    """Ana puxa assunto e responde rápido; Beto demora; só Ana manda áudio."""
    out, t = [], 0.0
    for conv in range(n_each):
        t += 400  # >3h entre conversas
        out += [msg(t, "Ana", "bora sair hoje?"), msg(t + 2, "Beto", "vamos kkkk"), msg(t + 3, "Ana", "audio", "audio"),
                msg(t + 4, "Beto", "que horas?")]
    return out


class ComputeTest(unittest.TestCase):
    def setUp(self):
        self.r = insights.compute_insights(chat())
        self.p = {x["name"]: x for x in self.r["people"]}

    def test_totais(self):
        self.assertEqual(self.r["totalMessages"], 120)
        self.assertEqual(self.r["conversations"], 30)
        self.assertEqual(sum(self.r["byHour"]), 120)
        self.assertEqual(sum(self.r["byWeekday"]), 120)
        self.assertEqual(sum(m["messages"] for m in self.r["byMonth"]), 120)

    def test_quem_inicia_e_quem_encerra(self):
        self.assertEqual(self.p["Ana"]["starts"], 30)
        self.assertEqual(self.p["Beto"]["enders"], 30)
        self.assertEqual(self.p["Ana"]["enders"], 0)

    def test_tempo_de_resposta_mediana(self):
        self.assertEqual(self.p["Beto"]["medianResponseSec"], 90)  # responde em 2 min e em 1 min → mediana 1,5 min

    def test_pouco_dado_vira_null_e_nao_inventa(self):
        r = insights.compute_insights(chat(2))
        self.assertTrue(all(p["medianResponseSec"] is None and p["questionRate"] is None for p in r["people"]))

    def test_midia_e_perguntas(self):
        self.assertEqual(self.p["Ana"]["audio"], 30)
        self.assertEqual(self.p["Beto"]["audio"], 0)
        self.assertEqual(self.p["Ana"]["questionRate"], 100.0)  # texto: 30x "bora sair hoje?"

    def test_share_soma_100(self):
        self.assertAlmostEqual(sum(p["share"] for p in self.r["people"]), 100, delta=0.2)

    def test_interacoes_e_sem_texto_de_mensagem_nas_pessoas(self):
        self.assertTrue(self.r["interactions"])
        self.assertNotIn("bora sair", json.dumps(self.r["people"]))

    def test_deterministico(self):
        self.assertEqual(self.r, insights.compute_insights(chat()))


class FakeClient:
    """Faz o papel do OllamaClient: devolve uma categoria conforme o texto."""
    cache_hits = 0

    def __init__(self, fail_on: str | None = None):
        self.prompts: list[str] = []
        self.fail_on = fail_on

    def chat_json(self, prompt, schema, **kw):
        self.prompts.append(prompt)
        if self.fail_on and self.fail_on in prompt:
            raise ai_curator.OllamaError("falhou")
        return {"category": "Esporte" if "futebol" in prompt else "Comida e bebida", "label": "assunto"}


def block(day: int, text: str, n: int = 10, authors=("Ana", "Beto")) -> list[Message]:
    return [Message(ts=datetime(2026, 3, day, 20, i), author=authors[i % 2], text=text) for i in range(n)]


class TopicsTest(unittest.TestCase):
    def test_agrega_por_categoria_mes_e_pessoa(self):
        lab = [(block(1, "futebol"), {"category": "Esporte", "label": "Final"}),
               (block(2, "pizza", 8), {"category": "Comida e bebida", "label": "Pizza"})]
        r = topics.aggregate(lab)
        self.assertEqual(r["categories"][0], {"name": "Esporte", "messages": 10, "conversations": 1, "share": 55.6})
        self.assertEqual(r["byMonth"], [{"month": "2026-03", "top": "Esporte"}])
        self.assertEqual({p["name"] for p in r["byPerson"]}, {"Ana", "Beto"})

    def test_categoria_fora_da_lista_vira_outro(self):
        r = topics.aggregate([(block(1, "x"), {"category": "Inventada", "label": "x"})])
        self.assertEqual(r["categories"][0]["name"], "Outro")

    def test_so_rotula_conversas_grandes_e_limita(self):
        c = FakeClient()
        convs = [block(1, "futebol", 10), block(2, "futebol", 5), block(3, "pizza", 12)]
        r = topics.analyze_topics(c, convs, max_blocks=1)
        self.assertEqual(len(c.prompts), 1)  # só a maior (12 msgs); a de 5 nunca
        self.assertEqual(r["categories"][0]["name"], "Comida e bebida")

    def test_falha_isolada_nao_derruba_o_resto(self):
        c = FakeClient(fail_on="pizza")
        r = topics.analyze_topics(c, [block(1, "futebol"), block(2, "pizza")])
        self.assertEqual([x["name"] for x in r["categories"]], ["Esporte"])

    def test_tudo_falhando_devolve_none(self):
        self.assertIsNone(topics.analyze_topics(FakeClient(fail_on="oi"), [block(1, "oi")]))


class BuildTest(unittest.TestCase):
    def args(self, d: str, *extra: str):
        return run_insights.make_parser().parse_args(["--input", d, "--quiet", "--out", str(Path(d) / "o" / "x.json"), *extra])

    def test_sem_ia_gera_json_e_nao_chama_ollama(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(ai_curator, "OllamaClient", side_effect=AssertionError):
            write_fixture(Path(d))
            out = run_insights.build(self.args(d, "--no-ai", "--slug", "2026"), now=datetime(2026, 11, 1))
        self.assertEqual(out["slug"], "2026")
        self.assertNotIn("topics", out)
        self.assertEqual(out["totalMessages"], 480)
        self.assertIn("generatedAt", out)

    def test_fixture_do_frontend_esta_em_dia(self):
        """tests/fixtures/expected_no_ai.json é validado pelo frontend (src/test/chatStatsPipelineOutput.test.ts)."""
        fixture = HERE / "tests" / "fixtures" / "expected_no_ai.json"
        with tempfile.TemporaryDirectory() as d:
            write_fixture(Path(d))
            out = run_insights.build(self.args(d, "--no-ai", "--slug", "2026", "--title", "Estatísticas 2026"), now=datetime(2026, 11, 1))
        text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
        if os.environ.get("UPDATE_FIXTURE"):
            fixture.parent.mkdir(exist_ok=True)
            fixture.write_text(text, encoding="utf-8")
        self.assertEqual(fixture.read_text(encoding="utf-8"), text, "rode com UPDATE_FIXTURE=1 para regerar")

    def test_filtra_ano(self):
        with tempfile.TemporaryDirectory() as d:
            write_fixture(Path(d))
            with self.assertRaises(SystemExit):
                run_insights.build(self.args(d, "--no-ai", "--year", "1999"))

    def test_com_ia_usa_cliente_e_grava_temas(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(ai_curator, "OllamaClient", return_value=FakeClient()):
            write_fixture(Path(d))
            out = run_insights.build(self.args(d))
        self.assertIn("categories", out["topics"])

    def test_cliente_recusa_host_remoto(self):
        with self.assertRaises(ValueError):
            ai_curator.OllamaClient(base_url="http://outro-host:11434")


class UploadTest(unittest.TestCase):
    DATA = {"slug": "2026", "generatedAt": "2026-11-01T00:00:00+00:00", "totalMessages": 1}

    def test_sem_chaves_nao_envia(self):
        with self.assertRaises(SystemExit):
            run_insights.upload(self.DATA, False, env={})

    def test_envia_upsert_com_chave_so_no_header(self):
        seen = {}

        def fake(req, timeout=0):
            seen["url"], seen["body"], seen["h"] = req.full_url, json.loads(req.data), dict(req.header_items())
            return mock.Mock(read=lambda: b"")

        with mock.patch("urllib.request.urlopen", fake):
            run_insights.upload(self.DATA, True, env={"SUPABASE_URL": "https://x.supabase.co/", "SUPABASE_SERVICE_ROLE_KEY": "KEY"})
        self.assertEqual(seen["url"], "https://x.supabase.co/rest/v1/chat_stats_snapshots?on_conflict=slug")
        self.assertEqual(seen["body"]["slug"], "2026")
        self.assertTrue(seen["body"]["is_active"])
        self.assertNotIn("slug", seen["body"]["config"])
        self.assertNotIn("KEY", json.dumps(seen["body"]))
        self.assertEqual(seen["h"]["Apikey"], "KEY")


if __name__ == "__main__":
    unittest.main()
