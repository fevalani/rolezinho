"""Mentiras confirmadas: a IA só extrai, o código confere e o admin aprova (tudo com dados sintéticos e IA falsa)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "wrapped-pipeline"))

import ai_curator  # noqa: E402
import mentiras as M  # noqa: E402
import review_mentiras as R  # noqa: E402
import run_insights  # noqa: E402
from models import Message  # noqa: E402

T0 = datetime(2026, 3, 1, 20, 0)


def msg(i: int, author: str, text: str, kind: str = "text", group: str = "") -> Message:
    return Message(ts=T0 + timedelta(minutes=i), author=author, text=text, kind=kind, group=group)


# conversa-modelo: Ana afirma, Beto contesta, Ana admite
CHAT = [msg(0, "Ana", "bom dia"), msg(1, "Ana", "eu corri 10km ontem"), msg(2, "Beto", "mentira, você nem saiu de casa"),
        msg(3, "Ana", "tá bom, menti, fiquei deitada"), msg(4, "Beto", "kkkk")]


def raw(**over):
    base = {"isDispute": True, "claimant": "Ana", "claim": "eu corri 10km ontem", "contester": "Beto",
            "contest": "mentira, você nem saiu de casa", "outcome": "admitted", "resolution": "tá bom, menti, fiquei deitada"}
    return {**base, **over}


class CandidateWindowsTest(unittest.TestCase):
    def test_gatilho_gera_janela_em_volta(self):
        ms = [msg(i, "Ana", f"oi {i}") for i in range(30)] + [msg(31, "Beto", "isso é mentira")] + [msg(32 + i, "Ana", f"x{i}") for i in range(30)]
        w = M.candidate_windows(ms)
        self.assertEqual(len(w), 1)
        self.assertEqual(len(w[0]), M.BEFORE + 1 + M.AFTER)

    def test_janelas_que_se_tocam_viram_uma(self):
        ms = [msg(i, "Ana", "fake" if i in (5, 9) else "oi") for i in range(40)]
        self.assertEqual(len(M.candidate_windows(ms)), 1)

    def test_janelas_distantes_ficam_separadas(self):
        ms = [msg(i, "Ana", "mentira" if i in (5, 60) else "oi") for i in range(100)]
        self.assertEqual(len(M.candidate_windows(ms)), 2)

    def test_mente_substantivo_nao_e_gatilho_e_apagada_e_ignorada(self):
        self.assertEqual(M.candidate_windows([msg(0, "Ana", "minha mente tá cansada")]), [])
        self.assertEqual(M.candidate_windows([msg(0, "Ana", "mentira", kind="deleted")]), [])

    def test_gatilhos_variados(self):
        for t in ["mentiroso!", "você tá mentindo", "isso é balela", "fake news", "ela mentiu"]:
            self.assertEqual(len(M.candidate_windows([msg(0, "Ana", t)])), 1, t)

    def test_grupos_diferentes_nao_se_fundem(self):
        ms = [msg(0, "Ana", "mentira", group="g1"), msg(1, "Ana", "mentira", group="g2"), msg(2, "Beto", "oi", group="g1")]
        w = M.candidate_windows(ms)
        self.assertEqual(len(w), 2)
        self.assertTrue(all(len({m.group for m in x}) == 1 for x in w))
        self.assertEqual([x[0].group for x in w], ["g1", "g2"])   # ordem cronológica


class RankTest(unittest.TestCase):
    def test_pontua_mensagens_com_cara_de_admissao_ou_prova(self):
        self.assertEqual(M.window_score([msg(0, "Ana", "tá bom, menti"), msg(1, "Beto", "olha o print"), msg(2, "Ana", "oi")]), 2)
        self.assertEqual(M.window_score([msg(0, "Ana", "que foto", kind="image"), msg(1, "Beto", "bom dia")]), 0)

    def test_mais_promissores_primeiro_e_empate_cronologico(self):
        fraco_antigo = [msg(0, "Ana", "mentira")]
        forte = [msg(100, "Ana", "mentira"), msg(101, "Ana", "tá bom, menti")]
        fraco_novo = [msg(200, "Ana", "mentira")]
        self.assertEqual(M.rank_windows([fraco_antigo, fraco_novo, forte]), [forte, fraco_antigo, fraco_novo])

    def test_find_episodes_com_limite_analisa_o_mais_promissor_primeiro(self):
        antigo = [msg(i, "Ana", "mentira" if i == 15 else "oi") for i in range(40)]
        forte = [msg(1000 + i, "Ana", "mentira" if i == 15 else ("foi mal, menti" if i == 16 else "oi")) for i in range(40)]
        client = FakeClient([raw(isDispute=False)])
        M.find_episodes(client, antigo + forte, max_windows=1)
        self.assertIn("foi mal, menti", client.prompts[0])


class VerifyTest(unittest.TestCase):
    def test_caso_valido_admitido(self):
        ep = M.verify(raw(), CHAT)
        self.assertEqual((ep["claimant"], ep["contester"], ep["outcome"], ep["date"]), ("Ana", "Beto", "admitted", "2026-03-01"))
        self.assertEqual(ep["claim"], "eu corri 10km ontem")
        self.assertEqual(len(ep["id"]), 12)

    def test_caso_provado_falso_aceita_qualquer_autor_no_desfecho(self):
        chat = [msg(0, "Ana", "eu corri 10km ontem"), msg(1, "Beto", "mentira, você nem saiu de casa"), msg(2, "Caio", "vi o print, ela estava em casa")]
        ep = M.verify(raw(outcome="proven_false", resolution="vi o print, ela estava em casa"), chat)
        self.assertEqual(ep["outcome"], "proven_false")

    def test_aceita_aspas_e_caixa_diferente(self):
        self.assertIsNotNone(M.verify(raw(claim="“EU CORRI 10KM ONTEM”"), CHAT))

    def test_so_aceita_admitido_ou_provado(self):
        for o in ("unresolved", "joke"):
            self.assertIsNone(M.verify(raw(outcome=o), CHAT))
        self.assertIsNone(M.verify(raw(isDispute=False), CHAT))

    def test_citacao_inventada_e_descartada(self):
        self.assertIsNone(M.verify(raw(claim="eu corri 20km ontem"), CHAT))
        self.assertIsNone(M.verify(raw(contest="mentira total"), CHAT))
        self.assertIsNone(M.verify(raw(resolution="tá bom, menti, é tudo mentira minha"), CHAT))

    def test_autor_inventado_ou_trocado_e_descartado(self):
        self.assertIsNone(M.verify(raw(claimant="Zeca"), CHAT))
        self.assertIsNone(M.verify(raw(claimant="Beto"), CHAT))   # a frase é da Ana
        self.assertIsNone(M.verify(raw(contester="Ana"), CHAT))   # mesma pessoa nos dois papéis

    def test_ordem_errada_e_descartada(self):
        chat = [msg(0, "Beto", "mentira, você nem saiu de casa"), msg(1, "Ana", "eu corri 10km ontem"), msg(2, "Ana", "tá bom, menti, fiquei deitada")]
        self.assertIsNone(M.verify(raw(), chat))   # contestação veio ANTES da afirmação

    def test_admissao_tem_que_ser_do_proprio_autor(self):
        chat = [msg(0, "Ana", "eu corri 10km ontem"), msg(1, "Beto", "mentira, você nem saiu de casa"), msg(2, "Beto", "tá bom, menti, fiquei deitada")]
        self.assertIsNone(M.verify(raw(), chat))

    def test_frase_curta_demais_nao_prova(self):
        chat = [msg(0, "Ana", "sim"), msg(1, "Beto", "mentira"), msg(2, "Ana", "menti")]
        self.assertIsNone(M.verify(raw(claim="sim", contest="mentira", resolution="menti"), chat))

    def test_telefone_e_mascarado_e_citacao_longa_cortada(self):
        chat = [msg(0, "Ana", "me liga +55 11 91234-5678 que eu corri 10km"), msg(1, "Beto", "mentira, nada disso aconteceu"), msg(2, "Ana", "tá bom, menti " + "x" * 300)]
        ep = M.verify(raw(claim="me liga +55 11 91234-5678 que eu corri 10km", contest="mentira, nada disso aconteceu", resolution="tá bom, menti " + "x" * 300), chat)
        self.assertNotIn("91234", ep["claim"])
        self.assertLessEqual(len(ep["resolution"]), M.QUOTE_LIMIT)

    def test_id_estavel(self):
        self.assertEqual(M.verify(raw(), CHAT)["id"], M.verify(raw(), CHAT)["id"])


class FakeClient:
    """Responde conforme um roteiro: lista de dicts (ou exceções) na ordem das chamadas."""
    cache_hits = 0

    def __init__(self, script):
        self.script, self.prompts = list(script), []

    def chat_json(self, prompt, schema, **kw):
        self.prompts.append(prompt)
        r = self.script.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def windows_chat():
    """Dois trechos distantes com gatilho."""
    a = [msg(i, "Ana", "oi") for i in range(40)]
    a[10] = msg(10, "Ana", "eu corri 10km ontem")
    a[11] = msg(11, "Beto", "mentira, você nem saiu de casa")
    a[12] = msg(12, "Ana", "tá bom, menti, fiquei deitada")
    b = [msg(500 + i, "Caio", "tchau") for i in range(40)]
    b[10] = msg(510, "Caio", "eu ganhei na loteria")
    b[11] = msg(511, "Dani", "balela")
    return a + b


class FindEpisodesTest(unittest.TestCase):
    def test_funil_conta_cada_etapa(self):
        client = FakeClient([raw(), raw(claimant="Caio", claim="eu ganhei na loteria", contester="Dani", contest="balela", outcome="joke", resolution="-")])
        eps, funnel = M.find_episodes(client, windows_chat())
        self.assertEqual(funnel, {"windows": 2, "errors": 0, "disputes": 2, "verified": 1, "rejected": {"desfecho joke": 1}})
        self.assertEqual([e["claimant"] for e in eps], ["Ana"])

    def test_alucinacao_da_ia_nao_chega_nos_casos(self):
        client = FakeClient([raw(claim="frase que ninguém escreveu"), raw(isDispute=False)])
        eps, funnel = M.find_episodes(client, windows_chat())
        self.assertEqual((eps, funnel["disputes"], funnel["verified"]), ([], 1, 0))
        self.assertEqual(funnel["rejected"], {"afirmação não literal": 1})

    def test_erro_de_um_trecho_nao_derruba_os_outros(self):
        client = FakeClient([ai_curator.OllamaError("timeout"), raw()])
        eps, funnel = M.find_episodes(client, windows_chat())
        self.assertEqual((funnel["errors"], len(eps)), (1, 0))   # o 1º trecho falhou; o 2º não tem o caso da Ana

    def test_para_apos_3_falhas_seguidas_e_mantem_o_que_ja_achou(self):
        chat = []
        for k in range(6):  # 6 trechos distantes, todos com gatilho
            chat += [msg(k * 300 + i, "Ana", "mentira" if i == 15 else "oi") for i in range(40)]
        down = ai_curator.OllamaError("Connection refused")
        client = FakeClient([down, down, down, raw()])
        logs: list[str] = []
        eps, funnel = M.find_episodes(client, chat, log=lambda *a: logs.append(" ".join(map(str, a))))
        self.assertEqual((len(client.prompts), funnel["errors"]), (3, 3))
        self.assertTrue(any("interrompido" in x for x in logs))

    def test_falha_isolada_zera_a_contagem_de_seguidas(self):
        chat = []
        for k in range(5):
            chat += [msg(k * 300 + i, "Ana", "mentira" if i == 15 else "oi") for i in range(40)]
        down = ai_curator.OllamaError("x")
        client = FakeClient([down, down, raw(isDispute=False), down, down])
        M.find_episodes(client, chat)
        self.assertEqual(len(client.prompts), 5)   # nunca chegou a 3 seguidas

    def test_max_windows_limita_as_chamadas(self):
        client = FakeClient([raw(isDispute=False)])
        M.find_episodes(client, windows_chat(), max_windows=1)
        self.assertEqual(len(client.prompts), 1)

    def test_prompt_trata_conversa_como_dado_e_pede_citacao_literal(self):
        client = FakeClient([raw(isDispute=False), raw(isDispute=False)])
        M.find_episodes(client, windows_chat())
        self.assertIn("<conversa>", client.prompts[0])
        self.assertIn("COPIADA LITERALMENTE", client.prompts[0])
        for campo in ("isDispute", "claimant", "claim", "contester", "contest", "outcome", "resolution"):
            self.assertIn(campo, client.prompts[0])   # todo campo exigido pelo schema é pedido no prompt

    def test_mesmo_caso_em_dois_trechos_nao_duplica(self):
        chat = windows_chat()
        # o mesmo trecho repetido mais tarde no mesmo dia gera o mesmo id (mesmo autor, frase e dia)
        shifted = [Message(ts=m.ts + timedelta(hours=2), author=m.author, text=m.text) for m in chat[:40]]
        eps, _ = M.find_episodes(FakeClient([raw(), raw(), raw(isDispute=False)]), sorted(chat[:40] + shifted, key=lambda m: m.ts))
        self.assertEqual(len(eps), 1)


class DecisionsTest(unittest.TestCase):
    EP = {"id": "a1", "date": "2026-03-01", "claimant": "Ana", "contester": "Beto", "outcome": "admitted", "claim": "c", "contest": "k", "resolution": "r"}

    def test_arquivo_ausente_ou_quebrado_nao_decide_nada(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(M.load_decisions(Path(d) / "nao.json"), {"approved": [], "rejected": []})
            p = Path(d) / "x.json"
            p.write_text("{ quebrado", encoding="utf-8")
            self.assertEqual(M.load_decisions(p), {"approved": [], "rejected": []})
            self.assertEqual(M.load_decisions(None), {"approved": [], "rejected": []})

    def test_salva_e_le_de_volta(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "sub" / "x.json"
            M.save_decisions(p, {"approved": [self.EP], "rejected": ["z9"]})
            self.assertEqual(M.load_decisions(p), {"approved": [self.EP], "rejected": ["z9"]})

    def test_pendentes_ignoram_aprovados_e_rejeitados(self):
        c2, c3 = {**self.EP, "id": "b2"}, {**self.EP, "id": "c3"}
        dec = {"approved": [self.EP], "rejected": ["b2"]}
        self.assertEqual(M.pending([self.EP, c2, c3], dec), [c3])

    def test_formato_do_app_sem_id_e_em_ordem(self):
        novo = {**self.EP, "id": "n", "date": "2026-05-01"}
        out = M.approved_for_app({"approved": [novo, self.EP], "rejected": []})
        self.assertEqual([e["date"] for e in out], ["2026-03-01", "2026-05-01"])
        self.assertNotIn("id", out[0])


class ReviewTest(unittest.TestCase):
    def cands(self, n=3):
        return [{**DecisionsTest.EP, "id": f"id{i}", "claim": f"afirmação {i}"} for i in range(n)]

    def run_review(self, answers, cands=None, decisions=None):
        it = iter(answers)
        out: list[str] = []
        dec = decisions or {"approved": [], "rejected": []}
        R.review(cands or self.cands(), dec, ask=lambda _: next(it), out=out.append)
        return dec, "\n".join(out)

    def test_aprova_rejeita_e_mostra_as_tres_frases(self):
        dec, text = self.run_review(["s", "n", "s"])
        self.assertEqual([e["id"] for e in dec["approved"]], ["id0", "id2"])
        self.assertEqual(dec["rejected"], ["id1"])
        self.assertIn("afirmação 0", text)
        self.assertIn("2 aprovados · 1 rejeitados · 0 sem decisão", text)

    def test_pular_deixa_pendente_e_q_sai_salvando_o_que_ja_decidiu(self):
        dec, text = self.run_review(["p", "s", "q"])
        self.assertEqual([e["id"] for e in dec["approved"]], ["id1"])
        self.assertIn("2 sem decisão", text)

    def test_resposta_invalida_pergunta_de_novo(self):
        dec, _ = self.run_review(["talvez", "", "s", "q"])
        self.assertEqual([e["id"] for e in dec["approved"]], ["id0"])

    def test_nao_pergunta_de_novo_o_que_ja_foi_decidido(self):
        dec, text = self.run_review(["q"], decisions={"approved": [], "rejected": ["id0", "id1"]})
        self.assertIn("caso 1/1", text)

    def test_main_sem_candidatos_orienta_e_com_candidatos_grava(self):
        with tempfile.TemporaryDirectory() as d:
            c, dec = Path(d) / "c.json", Path(d) / "d.json"
            self.assertEqual(R.main(["--candidates", str(c), "--decisions", str(dec)]), 1)
            c.write_text(json.dumps(self.cands(1)), encoding="utf-8")
            self.assertEqual(R.main(["--candidates", str(c), "--decisions", str(dec)], ask=lambda _: "s"), 0)
            self.assertEqual(len(M.load_decisions(dec)["approved"]), 1)
            self.assertEqual(R.main(["--candidates", str(c), "--decisions", str(dec), "--list"]), 0)


class RunInsightsIntegrationTest(unittest.TestCase):
    def args(self, d: str, *extra: str):
        return run_insights.make_parser().parse_args(
            ["--input", d, "--quiet", "--out", str(Path(d) / "o" / "x.json"), "--decisions", str(Path(d) / "dec.json"), *extra])

    def test_so_o_aprovado_vai_para_o_snapshot(self):
        with tempfile.TemporaryDirectory() as d:
            a = self.args(d)
            self.assertEqual(run_insights._mentiras_section(a, [], lambda *x: None), {})   # nada aprovado: seção omitida
            ep = {**DecisionsTest.EP}
            M.save_decisions(Path(d) / "dec.json", {"approved": [ep], "rejected": []})
            out = run_insights._mentiras_section(a, [], lambda *x: None)
            self.assertEqual(list(out["mentiras"]["episodes"][0]), ["date", "claimant", "contester", "outcome", "claim", "contest", "resolution"])

    def test_com_ia_grava_candidatos_mas_nao_publica_sem_aprovacao(self):
        with tempfile.TemporaryDirectory() as d:
            a = self.args(d)
            logs: list[str] = []
            out = run_insights._mentiras_section(a, windows_chat(), lambda *x: logs.append(" ".join(map(str, x))), FakeClient([raw(), raw(isDispute=False)]))
            self.assertEqual(out, {})
            cands = json.loads((Path(d) / "o" / "mentiras_candidatas.json").read_text(encoding="utf-8"))
            self.assertEqual(len(cands), 1)
            self.assertTrue(any("aguardando sua revisão" in x for x in logs))
            self.assertTrue(any("2 trechos → 1 disputas → 1 verificados" in x for x in logs))

    def test_aprovacao_persiste_mesmo_sem_rodar_a_ia_de_novo(self):
        with tempfile.TemporaryDirectory() as d:
            a = self.args(d)
            run_insights._mentiras_section(a, windows_chat(), lambda *x: None, FakeClient([raw(), raw(isDispute=False)]))
            cands = json.loads((Path(d) / "o" / "mentiras_candidatas.json").read_text(encoding="utf-8"))
            M.save_decisions(Path(d) / "dec.json", {"approved": cands, "rejected": []})
            out = run_insights._mentiras_section(a, [], lambda *x: None)   # sem IA (--no-ai)
            self.assertEqual(out["mentiras"]["episodes"][0]["claimant"], "Ana")


if __name__ == "__main__":
    unittest.main()
