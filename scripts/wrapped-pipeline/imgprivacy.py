"""Remove metadados (GPS, câmera, XMP, miniaturas) de fotos antes de publicá-las.

Sem Pillow: edita os segmentos do JPEG / chunks do PNG direto. O único dado de EXIF mantido
é a orientação (senão a foto aparece deitada), reescrita num EXIF mínimo.
"""
from __future__ import annotations

import shutil
import struct
from pathlib import Path

_PNG_SIG = b"\x89PNG\r\n\x1a\n"
_PNG_DROP = {b"eXIf", b"tEXt", b"iTXt", b"zTXt", b"tIME"}


def _orientation(exif: bytes) -> int:
    """Lê a tag Orientation (0x0112) de um bloco TIFF/EXIF; 1 = normal."""
    e = {b"II": "<", b"MM": ">"}.get(exif[:2])
    if not e or len(exif) < 8:
        return 1
    off = struct.unpack(e + "I", exif[4:8])[0]
    if off + 2 > len(exif):
        return 1
    for i in range(struct.unpack(e + "H", exif[off:off + 2])[0]):
        ent = exif[off + 2 + 12 * i: off + 14 + 12 * i]
        if len(ent) < 12:
            break
        tag, typ, _ = struct.unpack(e + "HHI", ent[:8])
        if tag == 0x0112 and typ == 3:
            v = struct.unpack(e + "H", ent[8:10])[0]
            return v if 1 <= v <= 8 else 1
    return 1


def _orientation_app1(o: int) -> bytes:
    tiff = b"II*\x00" + struct.pack("<I", 8) + struct.pack("<H", 1) + struct.pack("<HHIHH", 0x0112, 3, 1, o, 0) + struct.pack("<I", 0)
    body = b"Exif\x00\x00" + tiff
    return b"\xff\xe1" + struct.pack(">H", 2 + len(body)) + body


def strip_jpeg(data: bytes) -> bytes:
    if data[:2] != b"\xff\xd8":
        raise ValueError("não é JPEG")
    out, i, orient = [b"\xff\xd8"], 2, 1
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            raise ValueError("JPEG malformado")
        m = data[i + 1]
        if m == 0xDA:  # início dos dados da imagem: copia SÓ até o fim (EOI) da imagem principal
            end = data.find(b"\xff\xd9", i)  # em dados comprimidos, 0xFF é sempre seguido de 0x00 ou RSTn; FFD9 = fim
            # Depois do EOI podem vir imagens embutidas (mapa de ganho HDR/MPF, miniaturas) com EXIF/GPS próprios: descartadas.
            out.append(data[i:end + 2] if end != -1 else data[i:])
            break
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        seg = data[i:i + 2 + length]
        if len(seg) < 2 + length:
            raise ValueError("JPEG truncado")
        if m == 0xE1 and seg[4:10] == b"Exif\x00\x00":
            orient = _orientation(seg[10:])
        elif m == 0xE2 and not seg[4:16].startswith(b"ICC_PROFILE"):
            pass  # APP2 que não é perfil de cor (MPF aponta para imagens embutidas, FlashPix…): descartado
        elif m in (0xE1, 0xED, 0xFE) or 0xE3 <= m <= 0xEF:
            pass  # XMP, Photoshop/IPTC, comentários, APP3..15: descartados
        else:
            out.append(seg)  # APP0 (JFIF), APP2 (ICC), tabelas, quadro...
        i += 2 + length
    else:
        raise ValueError("JPEG sem dados de imagem")
    if orient != 1:
        out.insert(1, _orientation_app1(orient))
    return b"".join(out)


def strip_png(data: bytes) -> bytes:
    if data[:8] != _PNG_SIG:
        raise ValueError("não é PNG")
    out, i = [_PNG_SIG], 8
    while i + 8 <= len(data):
        n = struct.unpack(">I", data[i:i + 4])[0]
        kind, end = data[i + 4:i + 8], i + 12 + n
        if end > len(data):
            raise ValueError("PNG truncado")
        if kind not in _PNG_DROP:
            out.append(data[i:end])
        i = end
    return b"".join(out)


def clean_bytes(data: bytes, suffix: str) -> bytes:
    s = suffix.lower()
    if s in (".jpg", ".jpeg"):
        return strip_jpeg(data)
    if s == ".png":
        return strip_png(data)
    raise ValueError(f"formato não suportado para publicar: {suffix}")


def copy_clean(src: Path, dst: Path) -> None:
    """Copia a foto sem metadados. Levanta ValueError (e não copia) se não conseguir limpar."""
    cleaned = clean_bytes(src.read_bytes(), src.suffix)
    dst.write_bytes(cleaned)


def clean_media_dir(dest: Path) -> None:
    """Apaga as fotos geradas por execuções anteriores (foto-/ilustra-/piada-NN) — nada fica esquecido."""
    if dest.exists():
        for f in dest.iterdir():
            if f.is_file() and f.stem.rsplit("-", 1)[0] in ("foto", "ilustra", "piada"):
                f.unlink()
    dest.mkdir(parents=True, exist_ok=True)


__all__ = ["strip_jpeg", "strip_png", "clean_bytes", "copy_clean", "clean_media_dir", "shutil"]
