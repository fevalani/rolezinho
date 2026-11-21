"""Estatísticas detalhadas do chat — 100% determinísticas (nenhuma IA aqui).

Reaproveita `parser.py`/`models.py`/`stats.py` do pipeline do Wrapped (`../wrapped-pipeline`).
A saída é só número agregado: nenhum texto de mensagem vai para o JSON, exceto as expressões
repetidas ("bordões", com contagem mínima) — e esses são conferidos por frequência, não por IA.
"""
from __future__ import annotations

import re
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from statistics import median
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "wrapped-pipeline"))

import stats as wrapped_stats  # noqa: E402
from models import Message  # noqa: E402

CONVERSATION_GAP = timedelta(hours=3)    # silêncio maior que isso separa uma conversa da outra
REPLY_LIMIT = timedelta(minutes=30)      # resposta "de verdade": até 30 min depois da fala anterior
MIN_RESPONSES = 20                       # mínimo de respostas para a mediana valer
MIN_MESSAGES = 20                        # mínimo de mensagens para entrar em taxas/percentuais
_URL = re.compile(r"https?://\S+|www\.\S+", re.I)
_WORD = re.compile(r"[a-zà-ÿ0-9']+", re.I)


def conversations(messages: list[Message], gap: timedelta = CONVERSATION_GAP) -> list[list[Message]]:
    """Agrupa mensagens em conversas: um silêncio maior que `gap` começa outra. Espera ordem cronológica."""
    out: list[list[Message]] = []
    for m in messages:
        if m.kind == "deleted":
            continue
        if out and m.ts - out[-1][-1].ts <= gap and m.group == out[-1][-1].group:
            out[-1].append(m)
        else:
            out.append([m])
    return out


def longest_streak(days: set[date]) -> dict[str, Any] | None:
    """Maior sequência de dias seguidos com pelo menos uma mensagem."""
    if not days:
        return None
    best = (0, None, None)
    run_start = prev = None
    for d in sorted(days):
        if prev is None or d - prev != timedelta(days=1):
            run_start = d
        prev = d
        length = (d - run_start).days + 1
        if length > best[0]:
            best = (length, run_start, d)
    return {"days": best[0], "start": best[1].isoformat(), "end": best[2].isoformat()}


def response_times(messages: list[Message]) -> tuple[dict[str, list[float]], Counter]:
    """Tempo (s) que cada pessoa levou para falar depois de OUTRA, e quem respondeu a quem."""
    times: dict[str, list[float]] = defaultdict(list)
    pairs: Counter = Counter()
    prev: Message | None = None
    for m in messages:
        if m.kind == "deleted":
            continue
        if prev and prev.author != m.author and m.group == prev.group and m.ts - prev.ts <= REPLY_LIMIT:
            times[m.author].append((m.ts - prev.ts).total_seconds())
            pairs[(m.author, prev.author)] += 1
        prev = m
    return times, pairs


def catchphrases(messages: list[Message], extra_stopwords=(), min_count: int = 8, top_n: int = 15) -> list[dict[str, Any]]:
    """Trechos de 3 palavras que se repetem (piadas internas / bordões) e quem mais usa cada um."""
    skip = wrapped_stats.STOPWORDS | {w.casefold() for w in extra_stopwords}
    total: Counter = Counter()
    by_author: dict[str, Counter] = defaultdict(Counter)
    for m in messages:
        if m.kind != "text" or not m.text.strip():
            continue
        words = _WORD.findall(_URL.sub(" ", m.text.lower()))
        seen = set()
        for i in range(len(words) - 2):
            tri = words[i:i + 3]
            if all(w in skip or len(w) < 3 for w in tri) or any(wrapped_stats._NOISE_RE.match(w) for w in tri):
                continue
            phrase = " ".join(tri)
            if phrase in seen:
                continue
            seen.add(phrase)
            total[phrase] += 1
            by_author[phrase][m.author] += 1
    ranked = sorted((p for p, c in total.items() if c >= min_count), key=lambda p: (-total[p], p))
    out: list[dict[str, Any]] = []
    for p in ranked:
        # descarta trecho que é só parte de outro mais frequente já escolhido
        if any(p in o["phrase"] and total[p] <= o["count"] * 1.2 for o in out):
            continue
        top = sorted(by_author[p].items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        out.append({"phrase": p, "count": total[p], "topAuthor": top})
        if len(out) == top_n:
            break
    return out


def compute_insights(messages: list[Message], extra_stopwords=()) -> dict[str, Any]:
    """Todas as métricas do chat. `messages` em ordem cronológica."""
    real = [m for m in messages if m.kind != "deleted"]
    base = wrapped_stats.compute_stats(messages, top_n=10_000, min_for_avg=MIN_MESSAGES, extra_stopwords=extra_stopwords)
    sent = Counter(m.author for m in real)
    texts = [m for m in real if m.kind == "text" and m.text.strip()]

    by_hour, by_weekday = [0] * 24, [0] * 7
    month_msgs: Counter = Counter()
    month_chars: dict[str, list[int]] = defaultdict(list)
    for m in real:
        by_hour[m.ts.hour] += 1
        by_weekday[m.ts.weekday()] += 1
        month_msgs[f"{m.ts:%Y-%m}"] += 1
    for m in texts:
        month_chars[f"{m.ts:%Y-%m}"].append(len(_URL.sub("", m.text).strip()))

    convs = [c for c in conversations(messages) if len(c) >= 3]
    starts = Counter(c[0].author for c in convs)
    enders = Counter(c[-1].author for c in convs)
    times, pairs = response_times(messages)

    questions: Counter = Counter(m.author for m in texts if "?" in m.text)
    text_count: Counter = Counter(m.author for m in texts)
    by = lambda key: {r["name"]: r for r in base[key]}  # noqa: E731
    avg, owls, audio, stickers, photos = by("essayists"), by("owls"), by("audio"), by("stickers"), by("photos")
    funny, emoji = by("funniest"), by("signature_emoji")

    total = len(real) or 1
    people = []
    for name, n in sent.most_common():
        ts = times.get(name, [])
        people.append({
            "name": name,
            "messages": n,
            "share": round(n / total * 100, 1),
            "avgChars": avg[name]["value"] if name in avg else None,
            "medianResponseSec": round(median(ts)) if len(ts) >= MIN_RESPONSES else None,
            "starts": starts[name],
            "enders": enders[name],
            "questionRate": round(questions[name] / text_count[name] * 100, 1) if text_count[name] >= MIN_MESSAGES else None,
            "nightMessages": owls[name]["value"] if name in owls else 0,
            "audio": audio[name]["value"] if name in audio else 0,
            "stickers": stickers[name]["value"] if name in stickers else 0,
            "photos": photos[name]["value"] if name in photos else 0,
            "laughPercent": funny[name]["percent"] if name in funny else None,
            "signatureEmoji": emoji[name]["emoji"] if name in emoji else None,
        })

    days = {m.ts.date() for m in real}
    return {
        "periodStart": min(days).isoformat() if days else None,
        "periodEnd": max(days).isoformat() if days else None,
        "totalMessages": len(real),
        "activeDays": len(days),
        "conversations": len(convs),
        "byHour": by_hour,
        "byWeekday": by_weekday,
        "byMonth": [{"month": k, "messages": month_msgs[k],
                     "avgChars": round(sum(month_chars[k]) / len(month_chars[k]), 1) if month_chars[k] else 0}
                    for k in sorted(month_msgs)],
        "longestStreak": longest_streak(days),
        "people": people,
        "interactions": [{"from": a, "to": b, "count": c}
                         for (a, b), c in sorted(pairs.items(), key=lambda kv: (-kv[1], kv[0]))[:20]],
        "catchphrases": catchphrases(real, extra_stopwords),
        "topWords": [{"word": r["name"], "count": r["value"]} for r in base["top_words"][:20]],
    }
