"""Leitura do Google Takeout (Google Fotos) e seleção de fotos por pessoa e período.

Estrutura do Takeout: `Takeout/Google Fotos/<álbum>/IMG_1234.jpg` + `IMG_1234.jpg.json` (ou
`….supplemental-metadata.json`). O json traz `photoTakenTime`, `description` e, para rostos
NOMEADOS no Google Fotos, `people: [{name}]`. A identificação do rosto é do Google — nada aqui
reconhece rostos. Coordenadas (`geoData`) nunca são lidas.
"""
from __future__ import annotations

import json
import re
import struct
from collections import Counter
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from parser import safe_extract, stale_extraction

IMG_EXTS = (".jpg", ".jpeg", ".png")
BRT = timezone(timedelta(hours=-3))  # Brasil sem horário de verão desde 2019
_SUPPL = ".supplemental-metadata"
_AUTO_ALBUM_RE = re.compile(r"^(photos from|fotos de)\s+\d{4}$", re.I)


@dataclass(frozen=True)
class TakeoutPhoto:
    path: Path
    taken: datetime                 # horário local (BRT), sem fuso
    people: tuple[str, ...] = ()    # nomes dos rostos marcados no Google Fotos
    albums: tuple[str, ...] = ()
    description: str = ""
    size: int = 0
    date_source: str = "json"       # json | exif | nome | mtime (mtime = pouco confiável)


def _json_bases(directory: Path) -> dict[str, Path]:
    """base do nome da foto → json. Tira `.json` e o sufixo `.supplemental-metadata` (que o Takeout trunca)."""
    out: dict[str, Path] = {}
    for j in directory.glob("*.json"):
        base = j.name[: -len(".json")]
        for k in range(len(_SUPPL), 2, -1):
            if base.endswith(_SUPPL[:k]):
                base = base[: -k]
                break
        out.setdefault(base, j)
    return out


def find_sidecar(img: Path, bases: dict[str, Path]) -> Optional[Path]:
    name = img.name
    stem, _, ext = name.rpartition(".")
    cands = [name, name[:46]]  # o Takeout trunca o nome do json em 46 caracteres
    if (m := re.match(r"^(.*)-(edited|editado)$", stem, re.I)):
        cands.append(f"{m.group(1)}.{ext}")
    if (m := re.match(r"^(.*)\((\d+)\)$", stem)):
        cands.append(f"{m.group(1)}.{ext}({m.group(2)})")
    return next((bases[c] for c in cands if c in bases), None)


def _read_meta(j: Optional[Path]) -> dict[str, Any]:
    if not j:
        return {}
    try:
        return json.loads(j.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _exif_datetime(path: Path) -> Optional[datetime]:
    """Data de captura do EXIF (DateTimeOriginal → Digitized → DateTime), sem Pillow. Só lê o início do JPEG."""
    try:
        with path.open("rb") as f:
            head = f.read(262_144)
    except OSError:
        return None
    if head[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 4 <= len(head) and head[i] == 0xFF and head[i + 1] != 0xDA:
        n = struct.unpack(">H", head[i + 2:i + 4])[0]
        if head[i + 1] == 0xE1 and head[i + 4:i + 10] == b"Exif\x00\x00":
            return _tiff_datetime(head[i + 10:i + 2 + n])
        i += 2 + n
    return None


def _tiff_datetime(t: bytes) -> Optional[datetime]:
    e = {b"II": "<", b"MM": ">"}.get(t[:2])
    if not e or len(t) < 8:
        return None

    def ifd(off: int) -> dict[int, tuple[int, int, int]]:  # tag → (tipo, contagem, valor/offset)
        out: dict[int, tuple[int, int, int]] = {}
        if off + 2 > len(t):
            return out
        for k in range(struct.unpack(e + "H", t[off:off + 2])[0]):
            ent = t[off + 2 + 12 * k: off + 14 + 12 * k]
            if len(ent) < 12:
                break
            tag, typ, cnt = struct.unpack(e + "HHI", ent[:8])
            out[tag] = (typ, cnt, struct.unpack(e + "I", ent[8:12])[0])
        return out

    def text(ent: Optional[tuple[int, int, int]]) -> Optional[datetime]:
        if not ent or ent[0] != 2 or ent[1] < 19 or ent[2] + 19 > len(t):
            return None
        try:
            return datetime.strptime(t[ent[2]:ent[2] + 19].decode("ascii"), "%Y:%m:%d %H:%M:%S")
        except (UnicodeDecodeError, ValueError):
            return None

    ifd0 = ifd(struct.unpack(e + "I", t[4:8])[0])
    exif = ifd(ifd0[0x8769][2]) if 0x8769 in ifd0 else {}
    return text(exif.get(0x9003)) or text(exif.get(0x9004)) or text(ifd0.get(0x0132))


_NAME_DATE_RE = re.compile(r"(?<!\d)(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])(?!\d)(?:[-_ at]*(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2}))?")


def _name_datetime(name: str) -> Optional[datetime]:
    """IMG_20260314_231500.jpg, PXL_20260314_…, WhatsApp Image 2026-03-14 at 23.15.00.jpeg…"""
    m = _NAME_DATE_RE.search(name)
    if not m:
        return None
    try:
        h = [int(x) for x in m.groups()[3:]] if m.group(4) else [12, 0, 0]
        return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), *h)
    except ValueError:
        return None


def _taken(meta: dict, img: Path) -> tuple[datetime, str]:
    """(data, origem): json do Takeout → EXIF → data no nome do arquivo → data de modificação (último recurso)."""
    try:
        ts = int(meta["photoTakenTime"]["timestamp"])
        return datetime.fromtimestamp(ts, tz=BRT).replace(tzinfo=None), "json"
    except (KeyError, TypeError, ValueError, OSError):
        pass
    if (d := _exif_datetime(img)):
        return d, "exif"
    if (d := _name_datetime(img.name)):
        return d, "nome"
    return datetime.fromtimestamp(img.stat().st_mtime), "mtime"


def load_takeout(path: Path) -> list[TakeoutPhoto]:
    """Lê uma pasta (ou .zip) do Takeout; zips são extraídos com proteção contra zip-slip."""
    path = path.resolve()
    roots: list[Path] = []
    if path.is_file() and path.suffix.lower() == ".zip":
        roots.append(safe_extract(path, path.parent / "_extracted"))
    elif path.is_dir():
        roots += [safe_extract(z, path / "_extracted") for z in sorted(path.glob("*.zip"))]
        roots.append(path)
    else:
        raise FileNotFoundError(f"Takeout não encontrado: {path}")

    seen: set[Path] = set()
    merged: dict[tuple, TakeoutPhoto] = {}
    base = path if path.is_dir() else path.parent
    live = {z.stem for z in path.glob("*.zip")} if path.is_dir() else {path.stem}
    for root in roots:
        for img in sorted(root.rglob("*")):
            if stale_extraction(img, base, live):
                continue  # sobra da extração de um zip que você já apagou/trocou
            if not img.is_file() or img.suffix.lower() not in IMG_EXTS or img in seen:
                continue
            seen.add(img)
            meta = _read_meta(find_sidecar(img, _json_bases(img.parent)))
            people = tuple(p["name"].strip() for p in meta.get("people", []) if isinstance(p, dict) and p.get("name"))
            album = "" if _AUTO_ALBUM_RE.match(img.parent.name) else img.parent.name
            taken, src = _taken(meta, img)
            ph = TakeoutPhoto(img, taken, people, (album,) if album else (),
                              str(meta.get("description") or "")[:200], img.stat().st_size, src)
            key = (img.name.lower(), ph.size, ph.taken)  # a mesma foto aparece em álbum + "Fotos de 2026"
            if key in merged:
                old = merged[key]
                merged[key] = replace(old, albums=tuple(dict.fromkeys(old.albums + ph.albums)),
                                      people=tuple(dict.fromkeys(old.people + ph.people)))
            else:
                merged[key] = ph
    return sorted(merged.values(), key=lambda p: (p.taken, p.path.name))


def filter_period(photos: list[TakeoutPhoto], year: Optional[int] = None,
                  start: Optional[datetime] = None, end: Optional[datetime] = None) -> list[TakeoutPhoto]:
    return [p for p in photos
            if (year is None or p.taken.year == year) and (start is None or p.taken >= start) and (end is None or p.taken < end)]


def members_of(photo: TakeoutPhoto, groups: dict[str, dict[str, list[str]]]) -> tuple[str, ...]:
    """Quais membros do Wrapped aparecem na foto. `groups` junta vários rostos/álbuns do Google numa pessoa."""
    people = {p.casefold() for p in photo.people}
    albums = {a.casefold() for a in photo.albums}
    return tuple(
        member for member, g in groups.items()
        if people & {x.casefold() for x in g.get("google_people", [])} or albums & {x.casefold() for x in g.get("albums", [])}
    )


def candidates(photos: list[TakeoutPhoto], groups: dict[str, dict[str, list[str]]], per_member: int = 6,
               per_day: int = 2) -> dict[str, list[tuple[TakeoutPhoto, tuple[str, ...]]]]:
    """Até `per_member` fotos por pessoa: prefere fotos só dela (rosto único) e com boa qualidade; máx. `per_day` por dia."""
    pool: dict[str, list[tuple[TakeoutPhoto, tuple[str, ...]]]] = {m: [] for m in groups}
    for ph in photos:
        ms = members_of(ph, groups)
        for m in ms:
            pool[m].append((ph, ms))
    out: dict[str, list[tuple[TakeoutPhoto, tuple[str, ...]]]] = {}
    for m, items in pool.items():
        # prefere foto só da pessoa: um único rosto marcado (ou, sem marcação de rostos, um único membro/álbum)
        solo = lambda ph, ms: len(ph.people) == 1 or (not ph.people and len(ms) == 1)
        items.sort(key=lambda it: (-(2 * solo(*it) + (it[0].size > 150_000)), it[0].taken, it[0].path.name))
        days: Counter = Counter()
        chosen = []
        for ph, ms in items:
            if days[ph.taken.date()] < per_day:
                days[ph.taken.date()] += 1
                chosen.append((ph, ms))
            if len(chosen) == per_member:
                break
        out[m] = chosen
    return out


def moment_candidates(photos: list[TakeoutPhoto], windows: list[tuple[datetime, datetime]], per_window: int = 3,
                      margin_h: float = 2.0, extra: int = 10) -> list[TakeoutPhoto]:
    """Fotos do "momento": tiradas perto (±`margin_h` h) de cada pico de conversa, as maiores primeiro,
    mais a melhor foto de cada sessão grande de fotos (até `extra`, para as piadas). Sem reconhecer ninguém."""
    margin = timedelta(hours=margin_h)
    out: dict[Path, TakeoutPhoto] = {}
    for start, end in windows:
        near = [p for p in photos if start - margin <= p.taken <= end + margin]
        for p in sorted(near, key=lambda p: (-p.size, p.taken))[:per_window]:
            out.setdefault(p.path, p)
    # Além dos picos: a melhor foto de cada "sessão" (fotos tiradas no mesmo rolê, gap ≤ 3 h), das maiores
    # para as menores — muitas fotos seguidas indicam um evento de verdade.
    sessions: list[list[TakeoutPhoto]] = []
    for p in sorted(photos, key=lambda p: p.taken):
        if sessions and p.taken - sessions[-1][-1].taken <= timedelta(hours=3):
            sessions[-1].append(p)
        else:
            sessions.append([p])
    added = 0
    for sess in sorted(sessions, key=lambda s: (-len(s), s[0].taken)):
        if added >= extra:
            break
        best = max(sess, key=lambda p: (p.size, -p.taken.timestamp()))
        if best.path not in out:
            out[best.path] = best
            added += 1
    return list(out.values())
