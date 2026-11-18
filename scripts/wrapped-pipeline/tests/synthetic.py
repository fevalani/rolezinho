"""Conversa 100% sintética (nada de dado real) usada pelos testes e pelo fixture do frontend."""
from __future__ import annotations

import json
import random
import struct
from datetime import datetime, timedelta
from pathlib import Path

MEMBERS = ["Ana", "Beto", "Caio", "Dani"]
LINES = ["bora pro rolê?", "alguém viu o jogo ontem", "kkkkk morri", "chego em 10 min", "quem leva o gelo",
         "mano isso foi muito engraçado haha", "vou dormir 😴", "to chegando", "manda a localização", "bom dia grupo ☕"]


def build_chat(android: bool = True) -> tuple[str, list[str]]:
    """Devolve (texto do _chat.txt, nomes de fotos citadas)."""
    rnd = random.Random(1)
    rows: list[tuple[datetime, str, str]] = []
    base = datetime(2026, 1, 5, 12, 0)
    for d in range(0, 300, 3):  # baixo volume ao longo do ano
        t = base + timedelta(days=d, minutes=rnd.randint(0, 300))
        for _ in range(rnd.randint(2, 5)):
            t += timedelta(minutes=rnd.randint(1, 20))
            rows.append((t, rnd.choice(MEMBERS[:3] + ["Ana", "Beto"]), rnd.choice(LINES)))
    photos: list[str] = []
    for k, day in enumerate([(2026, 3, 14), (2026, 6, 20), (2026, 9, 5)]):  # 3 explosões
        t = datetime(*day, 21, 0)
        for i in range(45):
            t += timedelta(minutes=1)
            who = MEMBERS[i % 4]
            rows.append((t, who, rnd.choice(LINES) + (" kkkk" if i % 3 == 0 else "") + (" 😂" if i % 5 == 0 else "")))
            if i % 15 == 7:
                name = f"IMG-2026{day[1]:02d}{day[2]:02d}-WA{len(photos):04d}.jpg"
                photos.append(name)
                rows.append((t + timedelta(seconds=5), who, f"{name} (arquivo anexado)"))
    rows.append((datetime(2026, 4, 2, 2, 30), "Caio", "ninguém dorme nesse grupo??"))
    rows.append((datetime(2026, 4, 2, 2, 31), "Caio", "PTT-20260402-WA0001.opus (arquivo anexado)"))
    rows.append((datetime(2026, 4, 2, 2, 31), "Dani", "STK-20260402-WA0002.webp (arquivo anexado)"))
    rows.sort(key=lambda r: r[0])
    out = []
    for ts, who, text in rows:
        out.append(f"{ts:%d/%m/%Y %H:%M} - {who}: {text}" if android else f"[{ts:%d/%m/%Y %H:%M:%S}] {who}: {text}")
    out.insert(0, "05/01/2026 11:59 - As mensagens e as chamadas são protegidas com a criptografia de ponta a ponta.")
    return "\n".join(out) + "\n", photos


GPS_SECRET = b"GPS-SECRET-22.9068S-43.1729W"


def fake_jpeg(orientation: int = 6, marker: bytes = b"") -> bytes:
    """JPEG estruturalmente válido (SOI, JFIF, EXIF com GPS e orientação, SOS, EOI) — não é uma imagem real."""
    jfif = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    tiff = b"MM\x00*" + struct.pack(">I", 8) + struct.pack(">H", 1) + struct.pack(">HHIHH", 0x0112, 3, 1, orientation, 0) + struct.pack(">I", 0)
    body = b"Exif\x00\x00" + tiff + GPS_SECRET
    exif = b"\xff\xe1" + struct.pack(">H", 2 + len(body)) + body
    sos = b"\xff\xda" + struct.pack(">H", 8) + b"\x01\x01\x00\x00\x3f\x00"
    return b"\xff\xd8" + jfif + exif + sos + b"\x12\x34" + marker + b"\xff\xd9"


def write_takeout(dest: Path, ts_by_person: dict | None = None) -> dict[str, Path]:
    """Mini Takeout sintético: álbum "Rolê 2026" + "Fotos de 2026" (mesma foto nos dois) e sidecars."""
    album = dest / "Takeout" / "Google Fotos" / "Rolê 2026"
    auto = dest / "Takeout" / "Google Fotos" / "Fotos de 2026"
    album.mkdir(parents=True, exist_ok=True)
    auto.mkdir(parents=True, exist_ok=True)

    def put(folder: Path, name: str, people: list[str], when: datetime, marker: bytes = b"", sidecar: str = ".json"):
        (folder / name).write_bytes(fake_jpeg(marker=marker) + b"\x00" * 200_000)
        meta = {"title": name, "photoTakenTime": {"timestamp": str(int((when + timedelta(hours=3)).timestamp()) - 0)},
                "people": [{"name": n} for n in people], "geoData": {"latitude": -22.9, "longitude": -43.1}}
        # timestamp é UTC; o loader converte para BRT. `when` já é o horário local desejado.
        meta["photoTakenTime"]["timestamp"] = str(int((when - datetime(1970, 1, 1)).total_seconds()) + 3 * 3600)
        (folder / (name + sidecar)).write_text(json.dumps(meta), encoding="utf-8")

    files = {}
    plan = [  # (nome, pessoas (nomes do Google), quando, marcador, sidecar)
        ("ana_solo.jpg", ["Ana S."], datetime(2026, 3, 14, 23, 30), b"", ".json"),
        ("ana_dia.jpg", ["Ana Souza"], datetime(2026, 5, 2, 15, 0), b"", ".supplemental-metadata.json"),
        ("beto_solo.jpg", ["Beto"], datetime(2026, 6, 20, 21, 0), b"", ".json"),
        ("caio_solo.jpg", ["Caio"], datetime(2026, 9, 5, 22, 0), b"", ".json"),
        ("caio_sensivel.jpg", ["Caio"], datetime(2026, 9, 6, 12, 0), b"SENSITIVE", ".json"),
        ("dani_e_ana.jpg", ["Dani", "Ana S."], datetime(2026, 7, 1, 12, 0), b"DANIFOTO", ".json"),
        ("antiga_2025.jpg", ["Beto"], datetime(2025, 12, 31, 12, 0), b"", ".json"),
        ("desconhecido.jpg", ["Fulano de Tal"], datetime(2026, 4, 1, 12, 0), b"", ".json"),
    ]
    for name, people, when, marker, sc in plan:
        put(album, name, people, when, marker, sc)
        files[name] = album / name
    # a mesma foto também aparece em "Fotos de 2026" (Takeout duplica)
    put(auto, "ana_solo.jpg", ["Ana S."], datetime(2026, 3, 14, 23, 30))
    return files


def write_fixture(dest: Path) -> list[str]:
    """Escreve _chat.txt e fotos falsas (bytes mínimos) em `dest`."""
    dest.mkdir(parents=True, exist_ok=True)
    chat, photos = build_chat()
    (dest / "_chat.txt").write_text(chat, encoding="utf-8")
    for p in photos:
        (dest / p).write_bytes(fake_jpeg(1))
    return photos
