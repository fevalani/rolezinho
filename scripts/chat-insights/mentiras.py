"""Mentiras CONFIRMADAS no próprio chat: alguém afirma algo sobre si, outro contesta e a conversa mesmo confirma.

Não há detector de mentira (a pesquisa mostra que não é confiável). O fluxo é:
  1. o código separa trechos candidatos (palavras-gatilho: mentira, mentindo, fake, balela…);
  2. o Ollama só EXTRAI a estrutura (quem afirmou, a frase, quem contestou, a frase, como terminou);
  3. o código CONFERE: as 3 frases são cópias literais, na ordem certa, de autores coerentes; senão descarta;
  4. o admin APROVA cada caso (review_mentiras.py). Só os aprovados vão para o app.
Desfechos aceitos: "admitted" (quem afirmou admitiu) e "proven_false" (o chat mostrou que era falso).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "wrapped-pipeline"))

import ai_curator  # noqa: E402
from build_wrapped import scrub  # noqa: E402
from highlights import transcript  # noqa: E402
from models import Message  # noqa: E402

# "mente" fica de fora de propósito: é o substantivo ("minha mente")
TRIGGER = re.compile(r"\b(mentir\w*|mentira\w*|mentiu|mentindo|mentiroso\w*|balela|fake|caô)\b", re.I)
MAX_CONSECUTIVE_ERRORS = 3        # IA fora do ar: para em vez de falhar trecho por trecho
# palavras que costumam aparecer quando alguém admite ou é desmentido: trechos com elas são analisados primeiro
CONCESSION = re.compile(r"\b(menti|confesso|admito|fui pego|me pegou|te pegou|pegou|foi mal|t[áa] bom|ok,? voc[êe] ganhou|"
                        r"prova|provei|print|era brincadeira|tava brincando|t[ôo] brincando)\b", re.I)
BEFORE, AFTER = 10, 12            # mensagens em volta de cada gatilho
MIN_QUOTE = 6                     # frase curta demais ("sim") não prova nada
QUOTE_LIMIT = 200
OUTCOMES = ["admitted", "proven_false", "unresolved", "joke"]
ACCEPTED = {"admitted", "proven_false"}

DISPUTE_SCHEMA = {
    "type": "object",
    "required": ["isDispute", "claimant", "claim", "contester", "contest", "outcome", "resolution"],
    "properties": {
        "isDispute": {"type": "boolean"},
        "claimant": {"type": "string", "maxLength": 60},
        "claim": {"type": "string", "maxLength": QUOTE_LIMIT},
        "contester": {"type": "string", "maxLength": 60},
        "contest": {"type": "string", "maxLength": QUOTE_LIMIT},
        "outcome": {"type": "string", "enum": OUTCOMES},
        "resolution": {"type": "string", "maxLength": QUOTE_LIMIT},
    },
}


def candidate_windows(messages: list[Message], before: int = BEFORE, after: int = AFTER) -> list[list[Message]]:
    """Trechos em volta de cada mensagem com palavra-gatilho; janelas que se tocam viram uma só.

    Cada grupo é analisado separado (uma conversa não se mistura com a de outro grupo); a saída vem em ordem cronológica.
    """
    by_group: dict[str, list[Message]] = {}
    for m in messages:
        if m.kind != "deleted":
            by_group.setdefault(m.group, []).append(m)
    out: list[list[Message]] = []
    for msgs in by_group.values():
        spans: list[tuple[int, int]] = []
        for i, m in enumerate(msgs):
            if m.kind == "text" and TRIGGER.search(m.text):
                a, b = max(0, i - before), min(len(msgs), i + after + 1)
                if spans and a <= spans[-1][1]:
                    spans[-1] = (spans[-1][0], b)
                else:
                    spans.append((a, b))
        out += [msgs[a:b] for a, b in spans]
    return sorted(out, key=lambda w: w[0].ts)


def window_score(window: list[Message]) -> int:
    """Quantas mensagens do trecho parecem admissão/prova. Quanto maior, mais provável de ser um caso real."""
    return sum(1 for m in window if m.kind == "text" and CONCESSION.search(m.text))


def rank_windows(windows: list[list[Message]]) -> list[list[Message]]:
    """Mais promissores primeiro; empate fica na ordem cronológica (ordenação estável)."""
    return sorted(windows, key=lambda w: (-window_score(w), w[0].ts))


def _find(window: list[Message], author: str, quote: str, after: int = -1) -> int:
    """Índice da 1ª mensagem do autor, depois de `after`, que contém a frase literalmente (-1 se não há)."""
    q = ai_curator._norm(quote)
    if len(q) < MIN_QUOTE:
        return -1
    for i, m in enumerate(window):
        if i > after and m.author.casefold() == author.casefold() and q in ai_curator._norm(m.text):
            return i
    return -1


def _find_any(window: list[Message], quote: str, after: int) -> int:
    q = ai_curator._norm(quote)
    if len(q) < MIN_QUOTE:
        return -1
    return next((i for i, m in enumerate(window) if i > after and q in ai_curator._norm(m.text)), -1)


def check(raw: dict[str, Any], window: list[Message]) -> tuple[Optional[dict[str, Any]], str]:
    """Confere a extração da IA contra o trecho. Devolve (caso limpo, "ok") ou (None, motivo da rejeição)."""
    if not raw.get("isDispute"):
        return None, "sem disputa"
    if raw.get("outcome") not in ACCEPTED:
        return None, f"desfecho {raw.get('outcome')}"
    people = {m.author.casefold(): m.author for m in window}
    claimant, contester = people.get(raw["claimant"].strip().casefold()), people.get(raw["contester"].strip().casefold())
    if not claimant or not contester or claimant == contester:
        return None, "autores inválidos"
    clean = lambda s: s.strip().strip('"“”')  # noqa: E731
    claim, contest, resolution = clean(raw["claim"]), clean(raw["contest"]), clean(raw["resolution"])
    i = _find(window, claimant, claim)
    if i < 0:
        return None, "afirmação não literal"
    j = _find(window, contester, contest, after=i)
    if j < 0:
        return None, "contestação não literal ou antes da afirmação"
    k = _find(window, claimant, resolution, after=j) if raw["outcome"] == "admitted" else _find_any(window, resolution, after=j)
    if k < 0:
        return None, "desfecho não literal ou fora de ordem"
    return {
        "id": episode_id(claimant, claim, window[i].ts),
        "date": f"{window[i].ts:%Y-%m-%d}",
        "claimant": claimant, "contester": contester, "outcome": raw["outcome"],
        "claim": _clip(claim), "contest": _clip(contest), "resolution": _clip(resolution),
    }, "ok"


def verify(raw: dict[str, Any], window: list[Message]) -> Optional[dict[str, Any]]:
    return check(raw, window)[0]


def _clip(s: str) -> str:
    s = " ".join(scrub(s).split())
    return s if len(s) <= QUOTE_LIMIT else s[: QUOTE_LIMIT - 1].rstrip() + "…"


def episode_id(claimant: str, claim: str, ts: datetime) -> str:
    key = f"{claimant.casefold()}|{ai_curator._norm(claim)}|{ts:%Y-%m-%d}"
    return hashlib.sha1(key.encode()).hexdigest()[:12]


def build_prompt(window: list[Message]) -> str:
    text = transcript(window, max_msgs=60, max_chars=5000)
    return (
        f"Trecho de um grupo de amigos em {window[0].ts:%d/%m/%Y}. Participantes: {', '.join(sorted({m.author for m in window}))}.\n\n"
        f"<conversa>\n{text}\n</conversa>\n\n"
        "Procure UM caso em que alguém afirmou um fato sobre si ou sobre algo que fez, outra pessoa CONTESTOU (disse que é mentira) "
        "e a própria conversa mostra como terminou. Responda em JSON: isDispute (true só se houver esse caso), claimant (quem afirmou), "
        "claim (a frase da afirmação, COPIADA LITERALMENTE), contester (quem contestou), contest (a frase da contestação, COPIADA LITERALMENTE), "
        "outcome: 'admitted' (quem afirmou admitiu que era mentira), 'proven_false' (a conversa mostrou que era falso, ex.: prova ou print), "
        "'unresolved' (ficou sem resposta) ou 'joke' (era brincadeira, exclamação de surpresa ou zoeira), e resolution (a frase que mostra o "
        "desfecho, COPIADA LITERALMENTE). Quando 'mentira!' for só espanto ou piada, use 'joke'. Sem caso claro: isDispute=false e '-' nos textos. "
        "Não invente nada que não esteja escrito."
    )


def extract(client: "ai_curator.OllamaClient", window: list[Message]) -> dict[str, Any]:
    return client.chat_json(build_prompt(window), DISPUTE_SCHEMA, system=ai_curator.SYSTEM, max_tokens=400)


def find_episodes(client: "ai_curator.OllamaClient", messages: list[Message], max_windows: int = 300,
                  log: Callable[..., None] = lambda *a: None) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Casos verificados (ainda NÃO aprovados) + contagens do funil, para você ver quanto cada filtro descartou."""
    windows = rank_windows(candidate_windows(messages))[:max_windows]
    found: dict[str, dict[str, Any]] = {}
    funnel: dict[str, Any] = {"windows": len(windows), "errors": 0, "disputes": 0, "verified": 0, "rejected": {}}
    streak = 0
    for n, w in enumerate(windows, 1):
        try:
            raw = extract(client, w)
            streak = 0
        except ai_curator.OllamaError as e:
            funnel["errors"] += 1
            streak += 1
            log(f"  trecho {n}/{len(windows)} pulado: {e}")
            if streak >= MAX_CONSECUTIVE_ERRORS:
                log(f"  interrompido: {streak} falhas seguidas (a IA parou de responder). Os casos já achados foram mantidos.")
                break
            continue
        funnel["disputes"] += bool(raw.get("isDispute"))
        ep, why = check(raw, w)
        if ep:
            found.setdefault(ep["id"], ep)
        elif raw.get("isDispute"):
            funnel["rejected"][why] = funnel["rejected"].get(why, 0) + 1
        if n % 10 == 0:
            log(f"  {n}/{len(windows)} trechos analisados")
    funnel["verified"] = len(found)
    return sorted(found.values(), key=lambda e: (e["date"], e["id"])), funnel


# ── aprovação (decisions) ──────────────────────────────────────────────
def load_decisions(path: Optional[Path]) -> dict[str, Any]:
    """{"approved": [casos completos], "rejected": [ids]}. Arquivo ausente ou quebrado = nada decidido."""
    try:
        d = json.loads(path.read_text(encoding="utf-8")) if path and path.exists() else {}
    except (OSError, ValueError):
        d = {}
    return {"approved": [e for e in d.get("approved", []) if isinstance(e, dict) and e.get("id")],
            "rejected": [i for i in d.get("rejected", []) if isinstance(i, str)]}


def save_decisions(path: Path, decisions: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(decisions, ensure_ascii=False, indent=2), encoding="utf-8")


def pending(candidates: list[dict[str, Any]], decisions: dict[str, Any]) -> list[dict[str, Any]]:
    done = {e["id"] for e in decisions["approved"]} | set(decisions["rejected"])
    return [c for c in candidates if c["id"] not in done]


def approved_for_app(decisions: dict[str, Any]) -> list[dict[str, Any]]:
    """Casos aprovados no formato do app (sem o id), do mais antigo ao mais novo."""
    keys = ("date", "claimant", "contester", "outcome", "claim", "contest", "resolution")
    return [{k: e[k] for k in keys} for e in sorted(decisions["approved"], key=lambda e: (e["date"], e["id"]))]
