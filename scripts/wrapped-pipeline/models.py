"""Modelos compartilhados do pipeline."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

# Tipos de mensagem: texto, mídia (image/audio/sticker/video/doc/media) ou apagada.
KINDS = ("text", "image", "audio", "sticker", "video", "doc", "media", "deleted")


@dataclass(frozen=True)
class Message:
    ts: datetime              # horário local da exportação (sem fuso)
    author: str               # nome já normalizado (aliases aplicados)
    text: str                 # texto sem o marcador de mídia
    kind: str = "text"
    media_file: Optional[str] = None   # nome/caminho do arquivo citado no chat, se houver
    group: str = ""                    # de qual grupo veio ("" = só um chat)
