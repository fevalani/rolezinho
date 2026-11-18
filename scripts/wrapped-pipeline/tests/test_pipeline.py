"""Testes do pipeline (só stdlib): `python3 -m unittest discover -s tests -t .` na pasta wrapped-pipeline."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import unittest
import zipfile
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import ai_curator  # noqa: E402
import build_wrapped  # noqa: E402
import highlights  # noqa: E402
import parser as P  # noqa: E402
import stats as S  # noqa: E402
from models import Message  # noqa: E402
from tests import synthetic  # noqa: E402

FIXTURES = HERE / "fixtures"


def msg(ts, author="A", text="oi", kind="text", f=None):
    return Message(ts, author, text, kind, f)


class ParserTests(unittest.TestCase):
    def test_android_multiline_system_and_media(self):
        t = ("12/03/2026 14:32 - As mensagens e as chamadas são protegidas\n"
             "12/03/2026 14:33 - Ana: oi\ntudo bem?\n"
             "12/03/2026 14:34 - Beto: IMG-20260312-WA0001.jpg (arquivo anexado)\n"
             "12/03/2026 14:35 - Ana saiu\n"
             "12/03/2026 14:36 - Ana: ela saiu cedo\n"
             "12/03/2026 14:37 - Beto: PTT-20260312-WA0002.opus (arquivo anexado)\n"
             "12/03/2026 14:38 - Beto: STK-20260312-WA0003.webp (arquivo anexado)\n"
             "12/03/2026 14:39 - Beto: <Mídia oculta>\n"
             "12/03/2026 14:40 - Beto: Esta mensagem foi apagada\n")
        ms = P.parse_whatsapp_text(t)
        self.assertEqual([m.kind for m in ms], ["text", "image", "text", "audio", "sticker", "media", "deleted"])
        self.assertEqual(ms[0].text, "oi\ntudo bem?")
        self.assertEqual(ms[1].media_file, "IMG-20260312-WA0001.jpg")
        self.assertEqual(ms[2].text, "ela saiu cedo")  # "saiu" no corpo não é aviso do sistema

    def test_ios_format_with_invisible_chars_and_ampm(self):
        t = "[12/03/2026 02:32:05 PM] Caio: ‎<anexo: 00000012-PHOTO-2026-03-12-14-32-05.jpg>\n[13/03/26 09:10:05] Dani: bom dia\n"
        ms = P.parse_whatsapp_text(t)
        self.assertEqual(ms[0].ts, datetime(2026, 3, 12, 14, 32, 5))
        self.assertEqual((ms[0].kind, ms[0].media_file), ("image", "00000012-PHOTO-2026-03-12-14-32-05.jpg"))
        self.assertEqual(ms[1].ts.year, 2026)

    def test_narrow_nbsp_before_ampm(self):
        ms = P.parse_whatsapp_text("[12/03/2026 02:32:05 AM] Ana: oi\n")
        self.assertEqual(ms[0].ts.hour, 2)

    def test_date_order_detection(self):
        ms = P.parse_whatsapp_text("03/25/2026 10:00 - Ana: oi\n")  # 25 não pode ser mês → mm/dd
        self.assertEqual((ms[0].ts.month, ms[0].ts.day), (3, 25))
        ms = P.parse_whatsapp_text("03/05/2026 10:00 - Ana: oi\n")  # ambíguo → dd/mm
        self.assertEqual((ms[0].ts.month, ms[0].ts.day), (5, 3))

    def test_telegram(self):
        data = {"messages": [
            {"type": "message", "date": "2026-03-12T14:32:05", "from": "Ana", "text": ["oi ", {"type": "bold", "text": "gente"}]},
            {"type": "message", "date": "2026-03-12T14:33:00", "from": "Beto", "photo": "photos/a.jpg", "text": ""},
            {"type": "message", "date": "2026-03-12T14:34:00", "from": "Beto", "media_type": "voice_message", "file": "v/a.ogg", "text": ""},
            {"type": "service", "date": "2026-03-12T14:35:00", "actor": "Ana"},
        ]}
        ms = P.parse_telegram_json(data)
        self.assertEqual([m.kind for m in ms], ["text", "image", "audio"])
        self.assertEqual(ms[0].text, "oi gente")

    def test_aliases_and_period(self):
        ms = [msg(datetime(2026, 1, 1), "Fulano Antigo"), msg(datetime(2025, 12, 31), "X")]
        with tempfile.TemporaryDirectory() as d:
            ap = Path(d) / "aliases.json"
            ap.write_text(json.dumps({"Fulano": ["fulano antigo", "+55 11 99999-0000"]}))
            out = P.filter_period(P.apply_aliases(ms, P.load_aliases(ap)), year=2026)
        self.assertEqual([m.author for m in out], ["Fulano"])
        self.assertEqual(P.load_aliases(None), {})

    def test_zip_input_and_zip_slip(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            with zipfile.ZipFile(d / "chat.zip", "w") as z:
                z.writestr("_chat.txt", "12/03/2026 14:33 - Ana: oi\n")
                z.writestr("IMG-1.jpg", b"x")
            ms, media = P.load_input(d)
            self.assertEqual(len(ms), 1)  # extraído em _extracted, sem duplicar
            self.assertIn(P.media_key("", "img-1.jpg"), media)
            with zipfile.ZipFile(d / "evil.zip", "w") as z:
                z.writestr("../escape.txt", "x")
            with self.assertRaises(ValueError):
                P.safe_extract(d / "evil.zip", d / "_x")
            self.assertFalse((d / "escape.txt").exists())


class MultiGroupTests(unittest.TestCase):
    def _zip(self, d: Path, name: str, chat: str, photo_bytes: bytes):
        with zipfile.ZipFile(d / f"Conversa do WhatsApp com {name}.zip", "w") as z:
            z.writestr("_chat.txt", chat)
            z.writestr("IMG-20260312-WA0001.jpg", photo_bytes)  # MESMO nome nos dois grupos

    def test_groups_media_collision_and_peaks(self):
        lines = lambda who, h: "".join(f"12/03/2026 {h}:{m:02d} - {who}: msg {m}\n" for m in range(30))
        a = lines("Ana", 20) + "12/03/2026 20:40 - Ana: IMG-20260312-WA0001.jpg (arquivo anexado)\n12/03/2026 20:41 - Beto: lindo\n"
        b = lines("Caio", 20) + "12/03/2026 20:40 - Caio: IMG-20260312-WA0001.jpg (arquivo anexado)\n12/03/2026 20:41 - Dani: show\n"
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            self._zip(d, "Churrasco", a, b"FOTO-DO-CHURRASCO")
            self._zip(d, "Trabalho", b, b"FOTO-DO-TRABALHO")
            ms, media = P.load_input(d)
            self.assertEqual({m.group for m in ms}, {"Churrasco", "Trabalho"})
            sel = {p["message"].group: p["path"].read_bytes() for p in highlights.select_photos(ms, media)}
            self.assertEqual(sel, {"Churrasco": b"FOTO-DO-CHURRASCO", "Trabalho": b"FOTO-DO-TRABALHO"})
            peaks = highlights.find_peaks(ms, 60, 5, 10)
            self.assertEqual(sorted(p["group"] for p in peaks), ["Churrasco", "Trabalho"])  # um por grupo, sem misturar
            for p in peaks:
                self.assertEqual({m.group for m in p["messages"]}, {p["group"]})
            st = S.compute_stats(ms)
            self.assertEqual({g["name"] for g in st["groups"]}, {"Churrasco", "Trabalho"})

    def test_single_chat_has_no_group(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "_chat.txt").write_text("12/03/2026 20:00 - Ana: oi\n")
            ms, _ = P.load_input(Path(d))
            self.assertEqual({m.group for m in ms}, {""})
            self.assertEqual(S.compute_stats(ms)["groups"], [])


class StatsTests(unittest.TestCase):
    def setUp(self):
        self.t0 = datetime(2026, 3, 2, 10, 0)  # segunda

    def test_rankings_and_habits(self):
        ms = []
        for i in range(25):
            ms.append(msg(self.t0 + timedelta(minutes=i), "Ana", "x" * 100))
        for i in range(30):
            ms.append(msg(self.t0 + timedelta(hours=1, minutes=i), "Beto", "oi"))
        ms.append(msg(datetime(2026, 3, 3, 3, 0), "Caio", "coruja"))
        ms.append(msg(datetime(2026, 3, 3, 3, 1), "Caio", "", "audio", "PTT-1.opus"))
        ms.sort(key=lambda m: m.ts)
        st = S.compute_stats(ms)
        self.assertEqual(st["talkers"][0], {"name": "Beto", "value": 30})
        self.assertEqual(st["essayists"][0]["name"], "Ana")
        self.assertEqual(st["ghosts"][0]["name"], "Caio")
        self.assertEqual(st["owls"], [{"name": "Caio", "value": 2}])
        self.assertEqual(st["audio"], [{"name": "Caio", "value": 1}])
        self.assertEqual(st["busiest_weekday"]["name"], "segunda")
        self.assertEqual(st["busiest_hour"], {"name": 11, "value": 30})

    def test_words_remove_stopwords_noise_and_urls(self):
        ms = [msg(self.t0, "Ana", "churrasco churrasco kkkkk para https://churrasco.com cerveja")]
        words = {w["name"]: w["value"] for w in S.compute_stats(ms)["top_words"]}
        self.assertEqual(words, {"churrasco": 2, "cerveja": 1})

    def test_signature_emoji_prefers_exclusive(self):
        ms = [msg(self.t0 + timedelta(minutes=i), "Ana", "😂") for i in range(5)]
        ms += [msg(self.t0 + timedelta(hours=1, minutes=i), "Ana", "🍺") for i in range(3)]
        ms += [msg(self.t0 + timedelta(hours=2, minutes=i), "Beto", "😂") for i in range(20)]
        sig = {s["name"]: s["emoji"] for s in S.compute_stats(ms)["signature_emoji"]}
        self.assertEqual(sig["Ana"], "🍺")  # 😂 é do Beto; 🍺 é exclusivo da Ana
        self.assertEqual(sig["Beto"], "😂")

    def test_funniest_counts_laughs_from_others(self):
        ms = []
        t = self.t0
        for i in range(20):
            ms.append(msg(t, "Ana", "piada"))
            ms.append(msg(t + timedelta(seconds=20), "Beto", "kkkkkk"))
            t += timedelta(minutes=10)
        for i in range(20):  # Beto ri sozinho: não conta para ele
            ms.append(msg(t, "Beto", "kkkkk"))
            t += timedelta(minutes=10)
        ms.sort(key=lambda m: m.ts)
        f = S.compute_stats(ms)["funniest"]
        self.assertEqual([x["name"] for x in f], ["Ana"])
        self.assertEqual(f[0]["value"], 20)

    def test_laugh_detection(self):
        for s in ("kkk", "kkkkkk", "hahaha", "rsrs", "😂", "ahahah"):
            self.assertTrue(S.has_laugh(s), s)
        for s in ("kk", "casa", "ok"):
            self.assertFalse(S.has_laugh(s), s)

    def test_empty(self):
        st = S.compute_stats([])
        self.assertEqual((st["total_messages"], st["busiest_hour"]), (0, None))


class HighlightTests(unittest.TestCase):
    def test_peaks_are_dense_nonoverlapping_chronological(self):
        t0 = datetime(2026, 5, 1, 20, 0)
        ms = [msg(t0 + timedelta(minutes=i)) for i in range(30)]                    # pico A (30)
        ms += [msg(t0 + timedelta(minutes=10, hours=5, seconds=i * 60)) for i in range(40)]  # pico B (40)
        ms += [msg(t0 + timedelta(days=3, hours=h)) for h in range(5)]                # ruído
        ms.sort(key=lambda m: m.ts)
        peaks = highlights.find_peaks(ms, window_min=60, top_n=5, min_messages=10)
        self.assertEqual([p["count"] for p in peaks], [30, 40])  # cronológico
        self.assertLess(peaks[0]["start"], peaks[1]["start"])

    def test_transcript_limits_and_media_tags(self):
        ms = [msg(datetime(2026, 1, 1, 10, i), "Ana", "x" * 500) for i in range(10)] + [msg(datetime(2026, 1, 1, 11), "Beto", "", "audio")]
        tr = highlights.transcript(ms, max_chars=700, per_msg=50)
        self.assertLessEqual(len(tr), 800)
        self.assertIn("[áudio]", highlights.transcript(ms[-1:]))

    def test_photo_selection_by_engagement(self):
        t = datetime(2026, 1, 1, 10, 0)
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            for n in ("a.jpg", "b.jpg", "c.jpg", "d.webp"):
                (d / n).write_bytes(b"x")
            idx = {P.media_key("", n): d / n for n in ("a.jpg", "b.jpg", "c.jpg", "d.webp")}
            ms = [msg(t, "Ana", "", "image", "a.jpg"), msg(t + timedelta(minutes=1), "Beto"), msg(t + timedelta(minutes=2), "Caio"),
                  msg(t + timedelta(hours=1), "Ana", "", "image", "b.jpg"), msg(t + timedelta(hours=1, minutes=1), "Beto"),
                  msg(t + timedelta(hours=2), "Ana", "", "image", "c.jpg"),  # sem resposta → fora
                  msg(t + timedelta(hours=3), "Ana", "", "image", "d.webp"), msg(t + timedelta(hours=3, minutes=1), "Beto"),
                  msg(t + timedelta(hours=4), "Ana", "", "image", "sumiu.jpg"), msg(t + timedelta(hours=4, minutes=1), "Beto"),
                  msg(t + timedelta(hours=5), "Ana", "", "image", "a.jpg")]
            sel = highlights.select_photos(ms, idx, window_min=10, top_n=5)
            self.assertEqual([(p["path"].name, p["engagement"]) for p in sel], [("a.jpg", 2), ("b.jpg", 1)])
            self.assertEqual(len(highlights.select_photos(ms, idx, top_n=1)), 1)

    def test_reply_window_is_respected(self):
        t = datetime(2026, 1, 1, 10, 0)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.jpg"
            p.write_bytes(b"x")
            ms = [msg(t, "Ana", "", "image", "a.jpg"), msg(t + timedelta(minutes=11), "Beto")]
            self.assertEqual(highlights.select_photos(ms, {P.media_key("", "a.jpg"): p}), [])


class StubOllama(BaseHTTPRequestHandler):
    """Ollama de mentira: responde conforme o schema pedido. Estado em atributos de classe."""
    calls: list = []
    bad_first = False
    reject_schema = False
    reject_think = False
    thinking = False
    think_only = False
    slow = 0.0
    vision = True

    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def _chat(self, content: str, payload: dict):
        """Resposta do /api/chat: em NDJSON (stream) como o Ollama de verdade, com métricas no último trecho."""
        if not payload.get("stream"):
            return self._send(200, {"message": {"content": content}})
        chunks = [{"message": {"content": content[i:i + 2]}, "done": False} for i in range(0, len(content), 2)]
        if StubOllama.think_only:  # gastou o limite de tokens só pensando: nenhum conteúdo
            chunks = [{"message": {"content": "", "thinking": "pensando..."}, "done": False} for _ in range(30)]
        if StubOllama.thinking:
            chunks.insert(0, {"message": {"content": "", "thinking": "hmm, vamos pensar..."}, "done": False})
        chunks.append({"message": {"content": ""}, "done": True, "eval_count": 100, "eval_duration": 20_000_000_000,
                       "prompt_eval_count": 2000, "prompt_eval_duration": 10_000_000_000})
        body = "".join(json.dumps(c) + "\n" for c in chunks).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):  # o cliente desistiu (teste de timeout)
            pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        StubOllama.calls.append((self.path, payload))
        if StubOllama.slow:
            import time
            time.sleep(StubOllama.slow)
        if self.path == "/api/show":
            return self._send(200, {"capabilities": ["completion", "vision"] if StubOllama.vision else ["completion"]})
        fmt = payload["format"]
        if StubOllama.reject_think and "think" in payload:
            return self._send(400, {"error": '"stub" does not support thinking'})
        if StubOllama.reject_schema and isinstance(fmt, dict):
            return self._send(400, {"error": "schema não suportado"})
        if StubOllama.bad_first and sum(1 for p, _ in StubOllama.calls if p == "/api/chat") == 1:
            return self._chat("isso não é json", payload)
        prompt = payload["messages"][-1]["content"] if not StubOllama.bad_first else payload["messages"][0]["content"]
        import re
        if "Resuma em uma frase" in prompt:
            out = {"resumo": "churrasco"}
        elif 'Responda em JSON: {"ok"' in prompt:
            out = {"ok": "sim"}
        elif "Foto da biblioteca" in prompt:
            import base64
            img = base64.b64decode(payload["messages"][-1]["images"][0])
            out = {"caption": "Legenda da foto do Takeout", "funny_score": 9, "theme": "Rolê", "sensitive": b"SENSITIVE" in img}
        elif "arquétipo" in prompt:
            out = {"title": "O Mestre do Papo", "reason": "Fala mais que o rádio."}
        elif "Foto enviada" in prompt:
            out = {"category": "Rolê", "caption": "Foto de legenda curta"}
        else:
            m = re.search(r"\] (\w+): (.+)", prompt)
            out = {"title": "A grande discussão", "summary": "Todo mundo falou ao mesmo tempo.",
                   "pearls": [{"quote": m.group(2), "author": m.group(1)}, {"quote": "frase inventada que ninguém disse", "author": "Ana"}]}
        self._chat(json.dumps(out), payload)


def run_stub(**flags):
    StubOllama.calls, StubOllama.bad_first, StubOllama.reject_schema, StubOllama.reject_think, StubOllama.vision = [], False, False, False, True
    StubOllama.thinking, StubOllama.slow, StubOllama.think_only = False, 0.0, False
    for k, v in flags.items():
        setattr(StubOllama, k, v)
    srv = HTTPServer(("127.0.0.1", 0), StubOllama)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_port}"


class CuratorTests(unittest.TestCase):
    def test_refuses_non_local_host(self):
        for url in ("http://example.com:11434", "https://api.openai.com", "http://192.168.0.5:11434"):
            with self.assertRaises(ValueError):
                ai_curator.OllamaClient(base_url=url)
        ai_curator.OllamaClient(base_url="http://localhost:11434")
        ai_curator.OllamaClient(base_url="http://127.0.0.1:11434")

    def test_validate(self):
        sch = ai_curator.ARCHETYPE_SCHEMA
        ai_curator.validate({"title": "a", "reason": "b"}, sch)
        for bad in ({"title": "a"}, {"title": "", "reason": "b"}, {"title": 1, "reason": "b"}, {"title": "x" * 99, "reason": "b"}, []):
            with self.assertRaises(ValueError):
                ai_curator.validate(bad, sch)
        with self.assertRaises(ValueError):
            ai_curator.validate({"category": "Churrasco", "caption": "x"}, ai_curator.PHOTO_SCHEMA)

    def test_retry_on_invalid_json_then_success(self):
        srv, url = run_stub(bad_first=True)
        try:
            c = ai_curator.OllamaClient("m", url)
            out = c.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA)
            self.assertEqual(out["title"], "O Mestre do Papo")
            self.assertEqual(sum(1 for p, _ in StubOllama.calls if p == "/api/chat"), 2)
        finally:
            srv.shutdown(); srv.server_close()

    def test_gives_up_after_retries(self):
        class Bad(StubOllama):
            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                self._send(200, {"message": {"content": "{}"}})
        srv = HTTPServer(("127.0.0.1", 0), Bad)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            with self.assertRaises(ai_curator.OllamaError):
                ai_curator.OllamaClient("m", f"http://127.0.0.1:{srv.server_port}").chat_json("x", ai_curator.ARCHETYPE_SCHEMA, retries=2)
        finally:
            srv.shutdown(); srv.server_close()

    def test_falls_back_to_plain_json_format_when_schema_rejected(self):
        srv, url = run_stub(reject_schema=True)
        try:
            out = ai_curator.OllamaClient("m", url).chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA)
            self.assertIn("title", out)
            self.assertEqual([p["format"] == "json" for pth, p in StubOllama.calls if pth == "/api/chat"], [False, True])
        finally:
            srv.shutdown(); srv.server_close()

    def test_thinking_is_disabled_and_dropped_if_model_rejects_it(self):
        srv, url = run_stub()
        try:
            ai_curator.OllamaClient("m", url).chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA)
            self.assertIs(StubOllama.calls[-1][1]["think"], False)
        finally:
            srv.shutdown(); srv.server_close()
        srv, url = run_stub(reject_think=True)
        try:
            c = ai_curator.OllamaClient("m", url)
            self.assertIn("title", c.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA))
            chats = [p for pth, p in StubOllama.calls if pth == "/api/chat"]
            self.assertEqual(["think" in p for p in chats], [True, False])
            self.assertEqual(chats[1]["format"], chats[0]["format"])  # não caiu no fallback de formato por engano
        finally:
            srv.shutdown(); srv.server_close()

    def test_streaming_progress_limits_and_stats(self):
        srv, url = run_stub()
        try:
            c = ai_curator.OllamaClient("m", url)
            ticks = []
            c.on_progress = ticks.append
            c.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA, max_tokens=123)
            chat = [p for pth, p in StubOllama.calls if pth == "/api/chat"][0]
            self.assertIs(chat["stream"], True)
            self.assertEqual(chat["options"]["num_predict"], 123)        # corta resposta descontrolada
            self.assertTrue(ticks and ticks[0] == 25)                    # progresso a cada 25 trechos
            self.assertEqual(c.last_stats["eval_count"], 100)
            self.assertFalse(c.thinking_seen)
            self.assertIn("5.0 tokens/s", build_wrapped._speed(c))
        finally:
            srv.shutdown(); srv.server_close()

    def test_warns_when_model_thinks_despite_think_false(self):
        srv, url = run_stub(thinking=True)
        try:
            c = ai_curator.OllamaClient("m", url)
            self.assertIn("title", c.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA))
            self.assertTrue(c.thinking_seen)
            self.assertIn("pensa", build_wrapped._speed(c))
        finally:
            srv.shutdown(); srv.server_close()

    def test_cache_skips_repeated_calls_and_depends_on_prompt_model_and_image(self):
        srv, url = run_stub()
        try:
            with tempfile.TemporaryDirectory() as d:
                cd = Path(d) / ".ai_cache"
                n_chat = lambda: sum(1 for p, _ in StubOllama.calls if p == "/api/chat")
                c = ai_curator.OllamaClient("m", url, cache_dir=cd)
                a = c.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA)
                self.assertEqual((n_chat(), c.cache_hits), (1, 0))
                self.assertEqual(c.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA), a)
                self.assertEqual((n_chat(), c.cache_hits), (1, 1))                       # mesma pergunta: do cache
                ai_curator.OllamaClient("outro", url, cache_dir=cd).chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA)
                c.chat_json("dê um arquétipo 2", ai_curator.ARCHETYPE_SCHEMA)
                self.assertEqual(n_chat(), 3)                                             # outro modelo / outro prompt: refaz
                c.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA, images=["aaa"])
                self.assertEqual(n_chat(), 4)                                             # outra imagem: refaz
                for f in cd.iterdir():                                                    # cache corrompido é ignorado
                    f.write_text("{lixo")
                c.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA)
                self.assertEqual(n_chat(), 5)
                no_cache = ai_curator.OllamaClient("m", url)
                no_cache.chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA)
                self.assertEqual(n_chat(), 6)
        finally:
            srv.shutdown(); srv.server_close()

    def test_thinking_only_reply_fails_fast_with_actionable_message(self):
        srv, url = run_stub(think_only=True)
        try:
            with self.assertRaisesRegex(ai_curator.OllamaError, "ignorou think=false.*instruct"):
                ai_curator.OllamaClient("m", url).chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA, retries=3)
            self.assertEqual(sum(1 for p, _ in StubOllama.calls if p == "/api/chat"), 1)  # não repete à toa
        finally:
            srv.shutdown(); srv.server_close()

    def test_stall_reports_timeout_not_connection_error(self):
        srv, url = run_stub(slow=2.5)
        try:
            with self.assertRaisesRegex(ai_curator.OllamaError, "sem responder"):
                ai_curator.OllamaClient("m", url, timeout=1).chat_json("dê um arquétipo", ai_curator.ARCHETYPE_SCHEMA, retries=1)
        finally:
            srv.shutdown(); srv.server_close()

    def test_check_ollama_script(self):
        import contextlib
        import io
        import check_ollama
        srv, url = run_stub()
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(check_ollama.main(["--model", "stub", "--ollama-url", url]), 0)
            out = buf.getvalue()
            self.assertIn("Visão: sim", out)
            self.assertIn("geração 5.0 tok/s", out)
            self.assertIn("Estimativa por evento", out)
        finally:
            srv.shutdown(); srv.server_close()
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            self.assertEqual(check_ollama.main(["--ollama-url", "http://127.0.0.1:9", "--timeout", "2"]), 1)

    def test_connection_error_is_explained(self):
        with self.assertRaisesRegex(ai_curator.OllamaError, "ollama serve"):
            ai_curator.OllamaClient("m", "http://127.0.0.1:9", timeout=2).chat_json("x", ai_curator.ARCHETYPE_SCHEMA)

    def test_vision_detection(self):
        for flag in (True, False):
            srv, url = run_stub(vision=flag)
            try:
                self.assertEqual(ai_curator.OllamaClient("m", url).has_vision(), flag)
            finally:
                srv.shutdown(); srv.server_close()

    def test_pearls_must_be_literal_and_from_real_author(self):
        src = "[10:00] Ana: a vaca foi pro brejo\n[10:01] Beto: kkkk"
        got = ai_curator.verified_pearls(
            [{"quote": "A vaca foi pro  brejo", "author": "ana"}, {"quote": "inventada", "author": "Ana"},
             {"quote": "kkkk", "author": "Zé"}], src, {"Ana", "Beto"})
        self.assertEqual(got, [{"quote": "A vaca foi pro  brejo", "author": "Ana"}])

    def test_sample_messages_is_deterministic(self):
        ms = [msg(datetime(2026, 1, 1, 10, i % 60), "Ana", f"fala número {i}") for i in range(200)]
        a = ai_curator.sample_messages(ms)
        self.assertEqual(a, ai_curator.sample_messages(ms))
        self.assertEqual(len(a), 60)

    def test_photo_too_big_is_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.jpg"
            p.write_bytes(b"x" * 2048)
            self.assertIsNone(ai_curator.curate_photo(None, p, "Ana", max_mb=0.001))


def run_build(extra, chat_dir, out_dir, android=True):
    out = out_dir / "wrapped_output.json"
    argv = ["--input", str(chat_dir), "--year", "2026", "--out", str(out), "--media-dest", str(out_dir / "media"), "--quiet", *extra]
    assert build_wrapped.main(argv) == 0
    return json.loads(out.read_text(encoding="utf-8"))


def write_or_compare(name: str, data: dict, tc: unittest.TestCase):
    path = FIXTURES / name
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if os.environ.get("UPDATE_FIXTURE"):
        path.write_text(text, encoding="utf-8")
    tc.assertEqual(path.read_text(encoding="utf-8"), text, f"{name} desatualizado — rode com UPDATE_FIXTURE=1")


class BuildTests(unittest.TestCase):
    def test_dry_run_matches_fixture_and_never_calls_ollama(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            synthetic.write_fixture(d / "raw")
            ed = run_build(["--dry-run"], d / "raw", d)
            write_or_compare("expected_dry_run.json", ed, self)
            self.assertFalse(ed["isActive"])
            self.assertEqual([s["position"] for s in ed["slides"]], list(range(1, len(ed["slides"]) + 1)))
            self.assertGreater(len([f for f in (d / "media").iterdir()]), 0)  # fotos copiadas, renomeadas
            self.assertTrue(all(s["imageUrl"].startswith("/wrapped/2026/media/foto-") for s in ed["slides"] if s["type"] == "media"))

    def test_full_run_with_stub_ollama_matches_fixture(self):
        srv, url = run_stub()
        try:
            with tempfile.TemporaryDirectory() as d:
                d = Path(d)
                synthetic.write_fixture(d / "raw")
                ed = run_build(["--model", "stub", "--ollama-url", url, "--top-peaks", "3"], d / "raw", d)
            kinds = [s["type"] for s in ed["slides"]]
            self.assertIn("quote", kinds)       # pérola literal aceita
            self.assertIn("media", kinds)       # foto legendada
            quotes = [s.get("title", "") for s in ed["slides"] if s["type"] == "quote"]
            self.assertNotIn("frase inventada que ninguém disse", quotes)  # alucinação barrada
            self.assertTrue(any("O Mestre do Papo" in s.get("title", "") for s in ed["slides"]))
            write_or_compare("expected_full.json", ed, self)
        finally:
            srv.shutdown(); srv.server_close()

    def test_text_only_model_skips_photo_analysis(self):
        srv, url = run_stub(vision=False)
        try:
            with tempfile.TemporaryDirectory() as d:
                d = Path(d)
                synthetic.write_fixture(d / "raw")
                ed = run_build(["--model", "stub", "--ollama-url", url, "--top-peaks", "2"], d / "raw", d)
            self.assertFalse(any("images" in p["messages"][-1] for pth, p in StubOllama.calls if pth == "/api/chat"))
            media = [s for s in ed["slides"] if s["type"] == "media"]
            self.assertTrue(media and all(s.get("title", "").startswith("Foto de ") for s in media))
        finally:
            srv.shutdown(); srv.server_close()

    def test_limits_for_frontend_schema(self):
        long = "x" * 500
        ed = build_wrapped.assemble_edition(
            slug="2026", year=2026, title=long, subtitle=long,
            st=S.compute_stats([msg(datetime(2026, 1, 1, 10), "Ana", "oi")]),
            events=[{"start": datetime(2026, 1, 1), "title": long, "summary": long, "pearls": [{"quote": long, "author": "Ana"}]}],
            archetypes=[{"name": "Ana", "title": long, "reason": long}], photos=[])
        for s in ed["slides"]:
            self.assertLessEqual(len(s.get("title", "")), 100)
            self.assertLessEqual(len(s.get("description", "")), 400)
        self.assertLessEqual(len(ed["pageTitle"]), 80)

    def test_no_messages_in_year_exits(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            synthetic.write_fixture(d / "raw")
            with self.assertRaises(SystemExit):
                build_wrapped.main(["--input", str(d / "raw"), "--year", "1999", "--dry-run", "--out", str(d / "o.json"), "--quiet"])

    def test_ios_export_gives_same_stats(self):
        a = S.compute_stats(P.parse_whatsapp_text(synthetic.build_chat(True)[0]))
        b = S.compute_stats(P.parse_whatsapp_text(synthetic.build_chat(False)[0]))
        self.assertEqual(a["talkers"], b["talkers"])


if __name__ == "__main__":
    unittest.main()
