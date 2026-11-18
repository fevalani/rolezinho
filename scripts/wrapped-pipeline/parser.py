"""Módulo 1 — leitura e limpeza das exportações (WhatsApp `_chat.txt`, Telegram `result.json`).

100% offline: só `zipfile`, `json`, `re` e `pathlib` da biblioteca padrão.
"""
from __future__ import annotations

import json
import re
import zipfile
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

from models import Message

# ── formatos de cabeçalho ──────────────────────────────────────────────
_TIME = r"(\d{1,2}):(\d{2})(?::(\d{2}))?\s?(?:([AaPp])\.?[Mm]\.?)?"
_DATE = r"(\d{1,2})/(\d{1,2})/(\d{2,4})"
# Android: "12/03/2026 14:32 - Nome: texto"   |   iOS: "[12/03/2026 14:32:05] Nome: texto"
ANDROID_RE = re.compile(rf"^{_DATE}[ ,]+{_TIME}\s+-\s+(.*)$")
IOS_RE = re.compile(rf"^\[{_DATE}[ ,]+{_TIME}\]\s+(.*)$")

# caracteres invisíveis que o WhatsApp injeta (LRM, RLM, embeddings, NNBSP, NBSP)
_INVISIBLE = dict.fromkeys(map(ord, "‎‏‪‫‬‭‮﻿"), None)


def clean_line(line: str) -> str:
    return line.rstrip("\r\n").replace(" ", " ").replace(" ", " ").translate(_INVISIBLE)


# ── mensagens do sistema (sem autor) ───────────────────────────────────
# Aplicado só ao trecho ANTES do 1º ": " — assim "Fulano: ela saiu cedo" continua sendo mensagem.
_SYSTEM_RE = re.compile(
    r"(criou o grupo|criou este grupo|adicionou|foi adicionad|saiu$|saiu do grupo|removeu|foi removid|"
    r"mudou o (assunto|ícone|icone|código|codigo|n[úu]mero)|alterou|entrou usando|entrou com|"
    r"c[óo]digo de seguran[çc]a|fixou uma mensagem|as mensagens e as chamadas|messages and calls|"
    r"\b(mudou|alterou|adicionou|removeu|saiu|entrou|criou|fixou|desafixou|ativou|desativou|promoveu|rebaixou|bloqueou|"
    r"mudaram|alteraram|configura[çc][õo]es do grupo)\b|^[-–—~]\s|"
    r"you were added|created group|changed the|left$|joined using|added you|sua mensagem|"
    r"ligação|chamada (de|perdida)|missed (voice|video) call|agora é admin|agora você é admin)",
    re.I,
)
_DELETED_RE = re.compile(
    r"^(esta mensagem foi apagada|você apagou esta mensagem|mensagem apagada|this message was deleted|you deleted this message)\.?$",
    re.I,
)

# ── mídia ──────────────────────────────────────────────────────────────
_EXT_KIND = {
    "jpg": "image", "jpeg": "image", "png": "image", "heic": "image", "gif": "video",
    "webp": "sticker",
    "opus": "audio", "ogg": "audio", "mp3": "audio", "m4a": "audio", "aac": "audio", "amr": "audio", "wav": "audio",
    "mp4": "video", "mov": "video", "3gp": "video", "mkv": "video",
}
_FILE_RE = re.compile(r"([\w\-. ()]+?\.(?:%s|pdf|docx?|xlsx?|pptx?|zip|vcf|txt))" % "|".join(_EXT_KIND), re.I)
_ATTACH_RE = re.compile(r"(?:\(arquivo anexado\)|\(file attached\)|<anexo:\s*(.+?)>|<attached:\s*(.+?)>)", re.I)
_OMITTED = [  # (regex, kind)
    (re.compile(r"(imagem|foto|image|photo)\s+(ocultada|omitida|omitted)|<(imagem|foto|image|photo) (ocultada|omitida|omitted)>", re.I), "image"),
    (re.compile(r"(figurinha|sticker)\s+(ocultada|omitida|omitted)", re.I), "sticker"),
    (re.compile(r"(áudio|audio)\s+(ocultado|omitido|omitted)", re.I), "audio"),
    (re.compile(r"(vídeo|video|gif)\s+(ocultado|omitido|omitted)", re.I), "video"),
    (re.compile(r"(documento|document)\s+(ocultado|omitido|omitted)", re.I), "doc"),
    (re.compile(r"<(mídia oculta|media omitted)>", re.I), "media"),
]


def _kind_from_filename(name: str) -> str:
    base = name.split("/")[-1].upper()
    ext = base.rsplit(".", 1)[-1].lower() if "." in base else ""
    if base.startswith(("PTT-", "AUD-")):
        return "audio"
    if base.startswith("STK-"):
        return "sticker"
    if base.startswith(("VID-", "GIF-")):
        return "video"
    if base.startswith("IMG-") or "-PHOTO-" in base:
        return "image"
    return _EXT_KIND.get(ext, "doc")


def classify_media(body: str) -> tuple[str, Optional[str], str]:
    """Devolve (kind, arquivo, texto_restante) para o corpo de uma mensagem."""
    b = body.strip()
    if _DELETED_RE.match(b):
        return "deleted", None, ""
    m = _ATTACH_RE.search(b)
    if m:
        fname = (m.group(1) or m.group(2) or "").strip()
        if not fname:  # Android: "IMG-...jpg (arquivo anexado)"
            fm = _FILE_RE.search(b[: m.start()])
            fname = fm.group(1).strip() if fm else ""
        if fname:
            rest = (b[: m.start()].replace(fname, "") + b[m.end():]).strip()
            return _kind_from_filename(fname), fname, rest
    for rx, kind in _OMITTED:
        om = rx.search(b)
        if om and len(b) - len(om.group(0)) < 40:  # a mensagem é basicamente o marcador
            return kind, None, (b[: om.start()] + b[om.end():]).strip()
    return "text", None, b


# ── WhatsApp ───────────────────────────────────────────────────────────
def _detect_day_first(lines: Iterable[str]) -> bool:
    """dd/mm (padrão BR) a menos que o arquivo prove mm/dd (2º número > 12)."""
    for line in lines:
        m = ANDROID_RE.match(line) or IOS_RE.match(line)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if a > 12:
                return True
            if b > 12:
                return False
    return True


def _build_ts(m: re.Match, day_first: bool) -> Optional[datetime]:
    a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    day, month = (a, b) if day_first else (b, a)
    year = y + 2000 if y < 100 else y
    hh, mm, ss = int(m.group(4)), int(m.group(5)), int(m.group(6) or 0)
    ampm = m.group(7)
    if ampm:
        hh = hh % 12 + (12 if ampm.lower() == "p" else 0)
    try:
        return datetime(year, month, day, hh, mm, ss)
    except ValueError:
        return None


def parse_whatsapp_text(content: str, day_first: Optional[bool] = None) -> list[Message]:
    """Interpreta o texto de um `_chat.txt`. Linhas sem cabeçalho continuam a mensagem anterior."""
    lines = [clean_line(l) for l in content.split("\n")]
    if day_first is None:
        day_first = _detect_day_first(lines)

    raw: list[tuple[datetime, str, list[str]]] = []  # (ts, "Autor: corpo", linhas)
    for line in lines:
        m = ANDROID_RE.match(line) or IOS_RE.match(line)
        ts = _build_ts(m, day_first) if m else None
        if m and ts:
            raw.append((ts, m.group(8), []))
        elif raw:
            raw[-1][2].append(line)  # multilinha

    out: list[Message] = []
    for ts, first, extra in raw:
        rest = "\n".join([first, *extra]).rstrip()
        head, sep, body = rest.partition(": ")
        if not sep:  # "Fulano:" sem texto (mídia/linha vazia) ou aviso do sistema
            if rest.endswith(":") and not _SYSTEM_RE.search(rest):
                head, body = rest[:-1], ""
            else:
                continue
        author = head.strip()
        if not author or len(author) > 80 or _SYSTEM_RE.search(author):
            continue
        kind, fname, text = classify_media(body)
        out.append(Message(ts=ts, author=author, text=text, kind=kind, media_file=fname))
    return out


# ── Telegram ───────────────────────────────────────────────────────────
def _tg_text(t) -> str:
    if isinstance(t, str):
        return t
    if isinstance(t, list):
        return "".join(p if isinstance(p, str) else str(p.get("text", "")) for p in t)
    return ""


def parse_telegram_json(data: dict) -> list[Message]:
    msgs = data.get("messages")
    if msgs is None and isinstance(data.get("chats"), dict):  # export de conta inteira
        msgs = [m for c in data["chats"].get("list", []) for m in c.get("messages", [])]
    out: list[Message] = []
    for m in msgs or []:
        if m.get("type") != "message" or not m.get("from"):
            continue
        try:
            ts = datetime.fromisoformat(m["date"])
        except (KeyError, ValueError):
            continue
        text = _tg_text(m.get("text"))
        mt = m.get("media_type")
        if m.get("photo"):
            kind, f = "image", m["photo"]
        elif mt == "sticker":
            kind, f = "sticker", m.get("file")
        elif mt in ("voice_message", "audio_file"):
            kind, f = "audio", m.get("file")
        elif mt in ("video_file", "video_message", "animation"):
            kind, f = "video", m.get("file")
        elif m.get("file"):
            kind, f = "doc", m.get("file")
        else:
            kind, f = "text", None
        if kind == "sticker" and not text:
            text = m.get("sticker_emoji", "") or ""
        out.append(Message(ts=ts, author=str(m["from"]), text=text, kind=kind, media_file=f))
    return out


# ── aliases / filtros ──────────────────────────────────────────────────
def load_aliases(path: Optional[Path]) -> dict[str, str]:
    """`aliases.json`: {"Nome canônico": ["apelido", "nome antigo", "+55 11 9...."]} → mapa inverso."""
    if not path or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    pend = [k for k in data if k.strip().upper().startswith("PREENCHER")]
    if pend:
        raise ValueError(f"aliases.json ainda tem entradas a preencher: {pend}")
    return {alias.strip().casefold(): canon for canon, aliases in data.items() for alias in aliases}


def apply_aliases(messages: list[Message], aliases: dict[str, str]) -> list[Message]:
    if not aliases:
        return messages
    return [
        replace(m, author=aliases.get(m.author.casefold(), m.author))
        for m in messages
    ]


def filter_period(messages: list[Message], year: Optional[int] = None,
                  start: Optional[datetime] = None, end: Optional[datetime] = None) -> list[Message]:
    return [
        m for m in messages
        if (year is None or m.ts.year == year)
        and (start is None or m.ts >= start)
        and (end is None or m.ts < end)
    ]


# ── descoberta de arquivos ─────────────────────────────────────────────
def safe_extract(zip_path: Path, dest: Path) -> Path:
    """Extrai o zip recusando caminhos que escapem do destino (zip-slip)."""
    target = dest / zip_path.stem
    target.mkdir(parents=True, exist_ok=True)
    root = target.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            out = (target / info.filename).resolve()
            if root != out and root not in out.parents:
                raise ValueError(f"Entrada suspeita no zip: {info.filename}")
        zf.extractall(target)
    return target


def media_key(group: str, filename: str) -> str:
    """Chave do índice de mídia. Inclui o grupo: `IMG-20260312-WA0001.jpg` se repete entre grupos."""
    return f"{group}|{filename.replace(chr(92), '/').split('/')[-1].lower()}"


def stale_extraction(f: Path, base: Path, live: set[str]) -> bool:
    """Arquivo em `_extracted/<zip>` de um zip que não existe mais (você trocou/apagou o .zip): não deve ser lido."""
    try:
        parts = f.relative_to(base).parts
    except ValueError:
        return False
    return len(parts) > 1 and parts[0] == "_extracted" and parts[1] not in live


def build_media_index(root: Path, group: str = "") -> dict[str, Path]:
    """(grupo, basename) → caminho, para achar `IMG-…jpg` citado no chat daquele grupo."""
    idx: dict[str, Path] = {}
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() not in (".txt", ".json", ".html", ".zip"):
            idx.setdefault(media_key(group, p.name), p)
    return idx


def group_name(f: Path, input_root: Path) -> str:
    """Nome do grupo: pasta/zip de origem; `_chat.txt` solto usa o nome da pasta."""
    name = f.stem if f.parent == input_root else f.parent.name
    if name.lower() in ("_chat", "result"):
        name = f.parent.name
    return re.sub(r"^(conversa do whatsapp com|whatsapp chat with)\s+", "", name, flags=re.I).strip()


def load_input(input_path: Path, day_first: Optional[bool] = None) -> tuple[list[Message], dict[str, Path]]:
    """Lê arquivo/pasta de entrada (zips são extraídos em `<pasta>/_extracted`).

    Vários chats (ex.: 12 grupos de uma comunidade) são unidos; cada mensagem guarda o seu `group`
    e a mídia é indexada por grupo. Com um chat só, `group` fica vazio.
    """
    input_path = input_path.resolve()
    if input_path.is_file() and input_path.suffix.lower() != ".zip":
        files, root = [input_path], input_path.parent
    else:
        root = input_path
        if input_path.is_file():
            roots = [safe_extract(input_path, input_path.parent / "_extracted")]
        elif input_path.is_dir():
            roots = [safe_extract(z, input_path / "_extracted") for z in sorted(input_path.glob("*.zip"))] + [input_path]
        else:
            raise FileNotFoundError(f"Entrada não encontrada: {input_path}")
        files = []
        live = {z.stem for z in input_path.glob("*.zip")} if input_path.is_dir() else {input_path.stem}
        for r in roots:
            for f in sorted(r.rglob("*")):
                if stale_extraction(f, input_path if input_path.is_dir() else input_path.parent, live):
                    continue
                if f.is_file() and f not in files and (f.suffix.lower() == ".txt" or f.name.lower() == "result.json"):
                    files.append(f)

    parsed: list[tuple[Path, list[Message]]] = []
    for f in files:
        if f.suffix.lower() == ".txt":
            ms = parse_whatsapp_text(f.read_text(encoding="utf-8-sig", errors="replace"), day_first)
        else:
            ms = parse_telegram_json(json.loads(f.read_text(encoding="utf-8")))
        if ms:  # ignora .txt que não são chats (README, etc.)
            parsed.append((f, ms))

    messages: list[Message] = []
    media: dict[str, Path] = {}
    multi = len(parsed) > 1
    for f, ms in parsed:
        g = group_name(f, root) if multi else ""
        messages.extend(replace(m, group=g) for m in ms)
        media.update({k: v for k, v in build_media_index(f.parent, g).items() if k not in media})
    messages.sort(key=lambda m: m.ts)
    return messages, media
