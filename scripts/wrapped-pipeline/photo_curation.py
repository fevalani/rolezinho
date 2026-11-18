"""Quem ganha foto: escolhe poucas fotos para ilustrar vencedores de categoria e para piadas (lógica pura)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from takeout import TakeoutPhoto

JOKE_MIN_SCORE = 6  # funny_score mínimo (1–10) para virar slide de piada
NIGHT_CATEGORIES = {"owls"}  # "Corujas": prefere foto tirada de madrugada/noite


@dataclass(frozen=True)
class Analysis:
    photo: TakeoutPhoto
    members: tuple[str, ...]
    caption: str = ""
    funny: int = 0           # 0 = não analisada pela IA
    theme: str = ""
    sensitive: bool = False


def _is_night(a: Analysis) -> bool:
    h = a.photo.taken.hour
    return h >= 22 or h < 5


def pick_event_photos(windows: list[tuple[datetime, datetime]], analyses: list[Analysis], margin_h: float = 2.0,
                      max_n: int = 8) -> dict[int, Analysis]:
    """Uma foto por evento (índice em `windows`): a mais engraçada tirada perto do pico, sem repetir."""
    margin = timedelta(hours=margin_h)
    usable = [a for a in analyses if not a.sensitive]
    used: set[int] = set()
    out: dict[int, Analysis] = {}
    for k, (start, end) in enumerate(windows):
        if len(out) >= max_n:
            break
        pool = [(i, a) for i, a in enumerate(usable) if i not in used and start - margin <= a.photo.taken <= end + margin]
        if pool:
            i, a = max(pool, key=lambda ia: (ia[1].funny, ia[1].photo.size, -ia[0]))
            used.add(i)
            out[k] = a
    return out


def pick_illustrations(winners: list[tuple[str, str]], analyses: list[Analysis], max_published: int = 8,
                       joke_slides: int = 3, exclude: Optional[set[Analysis]] = None,
                       moments: Optional[dict[str, list[datetime]]] = None,
                       moment_days: float = 2.0) -> tuple[dict[str, Analysis], list[Analysis]]:
    """`winners`: [(categoria, nome do vencedor)] em ordem de prioridade.

    `moments`: {membro: datas em que ele mais apareceu no chat}. Entre as fotos do vencedor, a tirada perto
    (±`moment_days`) de um desses momentos vence; depois a mais engraçada. Corujas prefere foto noturna antes.

    Devolve ({categoria: foto do vencedor}, [fotos de piada]). Nenhuma foto é usada duas vezes, fotos
    sensíveis nunca entram, e o total respeita `max_published`.
    """
    exclude = exclude or set()
    usable = [a for a in analyses if not a.sensitive and a not in exclude]
    used: set[int] = set()
    chosen: dict[str, Analysis] = {}
    for cat, member in winners:
        if len(used) >= max_published:
            break
        pool = [(i, a) for i, a in enumerate(usable) if member in a.members and i not in used]
        if not pool:
            continue
        near = lambda a: any(abs((a.photo.taken - t).total_seconds()) <= moment_days * 86400 for t in (moments or {}).get(member, []))
        best = max(pool, key=lambda ia: ((_is_night(ia[1]) if cat in NIGHT_CATEGORIES else False), near(ia[1]), ia[1].funny, -ia[0]))
        used.add(best[0])
        chosen[cat] = best[1]
    room = max(0, min(joke_slides, max_published - len(used)))
    jokes = sorted(((i, a) for i, a in enumerate(usable) if i not in used and a.funny >= JOKE_MIN_SCORE),
                   key=lambda ia: (-ia[1].funny, ia[0]))[:room]
    return chosen, [a for _, a in jokes]


def first_member(a: Analysis) -> Optional[str]:
    return a.members[0] if a.members else None
