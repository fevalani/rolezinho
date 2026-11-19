"""Módulo 2 — estatísticas determinísticas (nada de LLM aqui)."""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import timedelta
from typing import Any, Iterable

from models import Message

WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]

STOPWORDS = set("""
a o as os um uma uns umas de do da dos das em no na nos nas por para pra pro com sem sob sobre entre até
e ou mas que se como quando onde porque pq porém então logo já não nao sim também tambem só so mais menos
muito muita muitos muitas pouco bem mal aqui ali lá la aí ai cá isso isto aquilo esse essa esses essas este esta
estes estas aquele aquela eu tu ele ela nós nos vocês voces vc vcs você eles elas me te lhe meu minha meus minhas
teu tua seu sua nosso nossa foi são sao ser é eh era tá ta tô to tem tinha têm vai vou vamos vão fui ficou fica
tava estava está estou estamos ter ir ver fazer faz fez dar dá deu pode posso podem preciso quer quero queria
cara mano tipo né ne então ent tbm tb mesmo mesma coisa só dia hoje amanhã ontem agora depois antes sempre nunca
ainda ate pq oq oque qual quais quem cada todo toda todos todas outro outra outros outras só nada algo alguém
gente pessoal galera vez vezes http https www com br ok blz acho bom nem pelo pela tudo assim então pois fica ficar vem vir tipo ver sei seu sua lá aí dá né ah oh eh uai vai vão
""".split())

_EMOJI_RE = re.compile("[\U0001F300-\U0001F3FA\U0001F400-\U0001FAFF☀-➿⭐⭕❤]")
_LAUGH_RE = re.compile(r"(?:\bk{3,}\b|\b(?:ha){2,}h?\b|\b(?:he){2,}\b|\b(?:rs){2,}\b|\b(?:ah){2,}a?\b|😂|🤣)", re.I)
_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)
_WORD_RE = re.compile(r"[a-zà-ÿ]{3,}", re.I)
_NOISE_RE = re.compile(r"^(k+|(ha)+h?|(he)+|(rs)+|ah+a*h*)$")
# quadradinhos coloridos são o resultado compartilhado de jogos (Termo/Wordle), não "emoji de verdade"
_GAME_SQUARES = set("🟥🟧🟨🟩🟦🟪🟫⬛⬜")


def fmt_int(n: int) -> str:
    """15218 → "15.218" (padrão brasileiro)."""
    return f"{n:,}".replace(",", ".")


def fmt_pct(p: float) -> str:
    """12.4 → "12,4%"; inteiros sem casa decimal (100 → "100%")."""
    return (f"{p:.1f}".rstrip("0").rstrip(".") if p != int(p) else str(int(p))).replace(".", ",") + "%"


def _top(counter: Counter, n: int, **extra) -> list[dict[str, Any]]:
    # desempate alfabético = resultado determinístico
    items = sorted(counter.items(), key=lambda kv: (-kv[1], str(kv[0])))[:n]
    return [{"name": k, "value": v, **extra} for k, v in items]


def has_laugh(text: str) -> bool:
    return bool(_LAUGH_RE.search(text))


def compute_stats(messages: list[Message], top_n: int = 10, min_for_avg: int = 20,
                  laugh_window: timedelta = timedelta(minutes=2), laugh_next: int = 5,
                  extra_stopwords: Iterable[str] = ()) -> dict[str, Any]:
    """Todas as métricas do Wrapped do grupo. `messages` deve estar ordenado por data."""
    real = [m for m in messages if m.kind != "deleted"]
    sent = Counter(m.author for m in messages)
    texts = [m for m in real if m.kind == "text" and m.text.strip()]

    # ── textão: média de caracteres por mensagem de texto (sem links) ──
    chars: dict[str, list[int]] = defaultdict(list)
    for m in texts:
        chars[m.author].append(len(_URL_RE.sub("", m.text).strip()))
    avg = {a: sum(v) / len(v) for a, v in chars.items() if len(v) >= min_for_avg}

    # ── madrugada / horários ──
    owls = Counter(m.author for m in messages if 1 <= m.ts.hour < 5)
    by_weekday = Counter(m.ts.weekday() for m in messages)
    by_hour = Counter(m.ts.hour for m in messages)

    # ── mídia ──
    media = {k: Counter(m.author for m in messages if m.kind == k) for k in ("audio", "sticker", "image", "video")}

    # ── palavras ──
    # nomes dos membros não entram nas "palavras do ano" (ex.: o sobrenome de alguém)
    name_tokens = {t.casefold() for a in sent for t in re.findall(r"[A-Za-zÀ-ÿ]{3,}", a)}
    skip_words = STOPWORDS | {w.casefold() for w in extra_stopwords}
    words: Counter = Counter()
    for m in texts:
        for w in _WORD_RE.findall(_URL_RE.sub(" ", m.text.lower())):
            if w not in skip_words and w not in name_tokens and not _NOISE_RE.match(w):
                words[w] += 1

    # ── emojis: o "assinatura" é o de maior frequência E exclusividade ──
    per_user: dict[str, Counter] = defaultdict(Counter)
    group_emoji: Counter = Counter()
    for m in real:
        for e in _EMOJI_RE.findall(m.text):
            if e in _GAME_SQUARES:
                continue
            per_user[m.author][e] += 1
            group_emoji[e] += 1
    signature: dict[str, dict[str, Any]] = {}
    for a, c in per_user.items():
        emoji, n = max(c.items(), key=lambda kv: (kv[1] * kv[1] / group_emoji[kv[0]], kv[1], kv[0]))
        signature[a] = {"emoji": emoji, "count": n}

    # ── quem faz rir: risadas de OUTROS nas mensagens seguintes (≤ 2 min, até 5 msgs) ──
    triggered: Counter = Counter()
    for i, m in enumerate(messages):
        if m.kind == "deleted":
            continue
        reacted = False
        for nxt in messages[i + 1: i + 1 + laugh_next]:
            if nxt.ts - m.ts > laugh_window:
                break
            if nxt.author != m.author and has_laugh(nxt.text):
                reacted = True
                break
        if reacted:
            triggered[m.author] += 1
    funny = {a: triggered[a] / sent[a] for a in sent if sent[a] >= min_for_avg and triggered[a]}

    active_days = {m.ts.date() for m in messages}
    return {
        "total_messages": len(messages),
        "participants": sorted(sent),
        "active_days": len(active_days),
        "groups": _top(Counter(m.group for m in messages), top_n) if len({m.group for m in messages}) > 1 else [],
        "talkers": _top(sent, top_n),
        "essayists": [
            {"name": k, "value": round(v, 1)} for k, v in sorted(avg.items(), key=lambda kv: (-kv[1], kv[0]))[:top_n]
        ],
        "ghosts": [{"name": k, "value": v} for k, v in sorted(sent.items(), key=lambda kv: (kv[1], kv[0]))[:top_n]],
        "owls": _top(owls, top_n),
        "busiest_weekday": {"name": WEEKDAYS[by_weekday.most_common(1)[0][0]], "value": max(by_weekday.values())}
        if by_weekday else None,
        "busiest_hour": {"name": by_hour.most_common(1)[0][0], "value": max(by_hour.values())} if by_hour else None,
        "audio": _top(media["audio"], top_n),
        "stickers": _top(media["sticker"], top_n),
        "photos": _top(media["image"], top_n),
        "videos": _top(media["video"], top_n),
        "top_words": _top(words, top_n),
        "signature_emoji": [
            {"name": a, **v} for a, v in sorted(signature.items(), key=lambda kv: (-kv[1]["count"], kv[0]))[:top_n]
        ],
        "funniest": [
            {"name": a, "value": triggered[a], "ratio": round(r, 3), "percent": round(r * 100, 1)}
            for a, r in sorted(funny.items(), key=lambda kv: (-kv[1], kv[0]))[:top_n]
        ],
    }


# ── arquétipos SEM IA: título e motivo saem só dos números (nada inventado) ──
def _first(st: dict, key: str) -> dict | None:
    return st[key][0] if st.get(key) else None


def member_archetypes(st: dict[str, Any], n: int = 6) -> list[dict[str, str]]:
    """Um arquétipo por pessoa que lidera algum ranking; o texto só cita números reais do `st`.

    Quem lidera mais rankings vem primeiro. Cada ranking tem um único líder, então nunca há contradição.
    """
    total = st["total_messages"] or 1
    wins: dict[str, list[tuple[str, str]]] = {}

    def add(key: str, title: str, text) -> None:
        top = _first(st, key)
        if top:
            wins.setdefault(top["name"], []).append((title, text(top)))

    add("talkers", "O Dono do Grupo", lambda r: f"{fmt_int(r['value'])} mensagens, {round(r['value'] / total * 100)}% de tudo que foi dito")
    add("essayists", "O Escritor", lambda r: f"{r['value']:.0f} caracteres por mensagem, o maior textão")
    add("owls", "O Corujão", lambda r: f"{fmt_int(r['value'])} mensagens entre 1h e 5h da manhã")
    add("stickers", "O Figurinheiro", lambda r: f"{fmt_int(r['value'])} figurinhas enviadas")
    add("photos", "O Fotógrafo", lambda r: f"{fmt_int(r['value'])} fotos enviadas")
    add("funniest", "O Humorista", lambda r: f"{fmt_pct(r['percent'])} das mensagens renderam risada")
    add("signature_emoji", "O Emoji Fixo", lambda r: f"{r['emoji']} usado {fmt_int(r['count'])} vezes")
    add("ghosts", "O Misterioso", lambda r: f"só {fmt_int(r['value'])} mensagens no ano")
    ranked = sorted(wins.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:n]
    return [{"name": name, "title": ts[0][0], "reason": "; ".join(f"{t}: {x}" if i else x for i, (t, x) in enumerate(ts[:3])) + "."}
            for name, ts in ranked]
