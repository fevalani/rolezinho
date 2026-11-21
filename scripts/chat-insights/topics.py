"""Temas mais discutidos — a IA (Ollama local) só ROTULA cada conversa; o código conta e agrega.

Cada conversa (silêncio > 3 h separa) recebe uma categoria de uma lista FIXA e um rótulo curto.
Como a categoria vem de uma lista fechada, a contagem é confiável; o rótulo livre é só ilustração.
Respostas ficam em cache (`OllamaClient.cache_dir`): reexecutar só gasta IA nas conversas novas.
"""
from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "wrapped-pipeline"))

import ai_curator  # noqa: E402
from highlights import transcript  # noqa: E402
from models import Message  # noqa: E402

CATEGORIES = ["Rolê e planos", "Comida e bebida", "Esporte", "Trabalho e estudo", "Filmes, séries e música",
              "Tecnologia e jogos", "Zoeira e piadas", "Viagem", "Dinheiro", "Cotidiano", "Outro"]
MIN_BLOCK_MESSAGES = 8

TOPIC_SCHEMA = {
    "type": "object", "required": ["category", "label"],
    "properties": {
        "category": {"type": "string", "enum": CATEGORIES},
        "label": {"type": "string", "maxLength": 50},
    },
}


def label_conversation(client: "ai_curator.OllamaClient", conv: list[Message]) -> dict[str, str]:
    text = transcript(conv, max_msgs=80, max_chars=3500)
    prompt = (
        f"Trecho de um grupo de amigos ({len(conv)} mensagens).\n\n<conversa>\n{text}\n</conversa>\n\n"
        f"Responda em JSON: category (UMA de: {', '.join(CATEGORIES)}) e label (assunto principal em até 6 palavras, "
        "só com o que está escrito; sem nomes, números nem dados pessoais). Se não der para entender, use 'Outro'."
    )
    return client.chat_json(prompt, TOPIC_SCHEMA, system=ai_curator.SYSTEM, max_tokens=120)


def aggregate(labeled: list[tuple[list[Message], dict[str, str]]]) -> dict[str, Any]:
    """Soma mensagens por categoria, por mês e por pessoa. Nenhuma chamada de IA aqui (testável direto)."""
    cat_msgs: Counter = Counter()
    cat_blocks: Counter = Counter()
    by_month: dict[str, Counter] = defaultdict(Counter)
    by_person: dict[str, Counter] = defaultdict(Counter)
    labels: list[dict[str, Any]] = []
    for conv, lab in labeled:
        cat = lab["category"] if lab["category"] in CATEGORIES else "Outro"
        cat_msgs[cat] += len(conv)
        cat_blocks[cat] += 1
        by_month[f"{conv[0].ts:%Y-%m}"][cat] += len(conv)
        for m in conv:
            by_person[m.author][cat] += 1
        labels.append({"label": lab["label"].strip(), "category": cat, "date": f"{conv[0].ts:%Y-%m-%d}", "messages": len(conv)})
    labels.sort(key=lambda x: (-x["messages"], x["date"]))
    total = sum(cat_msgs.values()) or 1
    return {
        "categories": [{"name": c, "messages": n, "conversations": cat_blocks[c], "share": round(n / total * 100, 1)}
                       for c, n in sorted(cat_msgs.items(), key=lambda kv: (-kv[1], kv[0]))],
        "byMonth": [{"month": mo, "top": sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]} for mo, c in sorted(by_month.items())],
        "byPerson": [{"name": p, "categories": [{"name": c, "messages": n} for c, n in
                                                sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[:3]]}
                     for p, cnt in sorted(by_person.items())],
        "highlights": labels[:20],
    }


def analyze_topics(client: "ai_curator.OllamaClient", convs: list[list[Message]], max_blocks: int = 300,
                   log=lambda *a: None) -> Optional[dict[str, Any]]:
    """Rotula as `max_blocks` conversas mais longas (com ≥ 8 mensagens). Uma falha isolada não derruba o resto."""
    big = sorted((c for c in convs if len(c) >= MIN_BLOCK_MESSAGES), key=lambda c: -len(c))[:max_blocks]
    labeled = []
    streak = 0
    for i, conv in enumerate(sorted(big, key=lambda c: c[0].ts), 1):
        try:
            labeled.append((conv, label_conversation(client, conv)))
            streak = 0
        except ai_curator.OllamaError as e:
            streak += 1
            log(f"  conversa {i}/{len(big)} pulada: {e}")
            if streak >= 3:
                log("  interrompido: 3 falhas seguidas (a IA parou de responder).")
                break
        else:
            if i % 10 == 0:
                log(f"  {i}/{len(big)} conversas rotuladas")
    return aggregate(labeled) if labeled else None
