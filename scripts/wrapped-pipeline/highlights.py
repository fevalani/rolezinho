"""Módulo 3 — picos de conversa e fotos mais engajadas (para a IA só ver o que importa)."""
from __future__ import annotations

from collections import Counter
from datetime import timedelta
from pathlib import Path
from typing import Any, Optional

from models import Message
from parser import media_key


def _peaks_one(messages: list[Message], window_min: int, top_n: int, min_messages: int) -> list[dict[str, Any]]:
    win = timedelta(minutes=window_min)
    cands: list[tuple[int, int, int]] = []  # (contagem, início, fim_exclusivo)
    j = 0
    for i in range(len(messages)):
        j = max(j, i)
        while j < len(messages) and messages[j].ts - messages[i].ts < win:
            j += 1
        if j - i >= min_messages:
            cands.append((j - i, i, j))
    cands.sort(key=lambda c: (-c[0], messages[c[1]].ts))

    chosen: list[tuple[int, int, int]] = []
    for c in cands:
        if all(abs(messages[c[1]].ts - messages[o[1]].ts) >= 2 * win for o in chosen):
            chosen.append(c)
            if len(chosen) == top_n:
                break
    return [{
        "start": messages[i].ts, "end": messages[j - 1].ts, "count": count, "group": messages[i].group,
        "participants": sorted({m.author for m in messages[i:j]}), "messages": messages[i:j],
    } for count, i, j in chosen]


def find_peaks(messages: list[Message], window_min: int = 60, top_n: int = 15, min_messages: int = 10) -> list[dict[str, Any]]:
    """Top `top_n` janelas de `window_min` minutos com mais mensagens, sem sobreposição.

    Janela deslizante (dois ponteiros) ancorada em cada mensagem; escolha gulosa por densidade,
    descartando janelas a menos de 2× a janela de uma já escolhida. Com vários grupos, cada
    grupo é analisado separado (uma conversa não se mistura com a outra) e vale o top global.
    """
    by_group: dict[str, list[Message]] = {}
    for m in messages:
        by_group.setdefault(m.group, []).append(m)
    peaks = [p for g in by_group.values() for p in _peaks_one(g, window_min, top_n, min_messages)]
    peaks.sort(key=lambda p: (-p["count"], p["start"]))
    return sorted(peaks[:top_n], key=lambda p: p["start"])  # ordem cronológica


def transcript(messages: list[Message], max_msgs: int = 150, max_chars: int = 6000, per_msg: int = 300) -> str:
    """Texto compacto "[HH:MM] Autor: fala" para o prompt (mídia vira [foto]/[áudio]/…)."""
    tags = {"image": "[foto]", "audio": "[áudio]", "sticker": "[figurinha]", "video": "[vídeo]", "doc": "[arquivo]", "media": "[mídia]"}
    lines: list[str] = []
    total = 0
    for m in messages[:max_msgs]:
        if m.kind == "deleted":
            continue
        body = (m.text.strip() or tags.get(m.kind, "")).replace("\n", " ")[:per_msg]
        if not body:
            continue
        line = f"[{m.ts:%H:%M}] {m.author}: {body}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line) + 1
    return "\n".join(lines)


def select_photos(messages: list[Message], media_index: dict[str, Path], window_min: int = 10,
                  top_n: int = 30, exts: tuple[str, ...] = (".jpg", ".jpeg", ".png")) -> list[dict[str, Any]]:
    """Fotos (presentes em disco) que mais geraram mensagens de OUTRAS pessoas nos `window_min` min seguintes.

    O horário usado é o da mensagem do chat que cita o arquivo (mais confiável que o mtime do arquivo).
    """
    win = timedelta(minutes=window_min)
    scored: list[dict[str, Any]] = []
    for i, m in enumerate(messages):
        if m.kind != "image" or not m.media_file:
            continue
        path = media_index.get(media_key(m.group, m.media_file))
        if not path or path.suffix.lower() not in exts:
            continue
        replies: Counter = Counter()
        for nxt in messages[i + 1:]:
            if nxt.ts - m.ts > win:
                break
            if nxt.author != m.author and nxt.kind != "deleted":
                replies[nxt.author] += 1
        engagement = sum(replies.values())
        if engagement:
            scored.append({"message": m, "path": path, "engagement": engagement, "responders": len(replies)})
    scored.sort(key=lambda p: (-p["engagement"], -p["responders"], p["message"].ts))
    return scored[:top_n]
