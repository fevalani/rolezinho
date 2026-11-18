#!/usr/bin/env python3
"""Confere as fotos do Google Fotos ANTES da rodada longa: datas, álbuns, pessoas marcadas e cobertura por membro.

    python photos_report.py --photos ./raw_photos --config ./wrapped_config.json --year 2026
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

import takeout as T


def build_report(photos: list[T.TakeoutPhoto], groups: dict[str, dict]) -> str:
    out = [f"Fotos no período: {len(photos)}"]
    if not photos:
        return "\n".join(out)
    src = Counter(p.date_source for p in photos)
    out.append("Origem da data: " + ", ".join(f"{k} {v}" for k, v in src.most_common()))
    if src.get("mtime"):
        out.append(f"  ! {src['mtime']} fotos sem data de captura (usei a data do arquivo: pouco confiável)")
    months = Counter(p.taken.strftime("%Y-%m") for p in photos)
    out.append("Por mês: " + ", ".join(f"{k} {v}" for k, v in sorted(months.items())))
    albums = Counter(a for p in photos for a in p.albums)
    out.append("Álbuns: " + (", ".join(f"{k} ({v})" for k, v in albums.most_common(15)) or "—"))
    people = Counter(n for p in photos for n in p.people)
    if people:
        out.append("Rostos nomeados no Google Fotos (nos .json): " + ", ".join(f"{k} ({v})" for k, v in people.most_common(20)))
    else:
        out.append("Rostos nomeados: NENHUM. Sem os .json do Takeout (ou sem nomes no Google Fotos) só dá para vincular por álbum.")
    if groups:
        out.append("\nCobertura por membro (fotos em que a pessoa aparece / dias diferentes):")
        for m in groups:
            mine = [p for p in photos if m in T.members_of(p, {m: groups[m]})]
            solo = sum(1 for p in mine if len(T.members_of(p, groups)) == 1)
            flag = "" if len(mine) >= 3 else "   ← poucas fotos: não dá para escolher uma boa"
            out.append(f"  {m:20} {len(mine):4} fotos ({solo} só dela) em {len({p.taken.date() for p in mine})} dias{flag}")
        named = {n.casefold() for g in groups.values() for n in g.get("google_people", [])}
        alb = {a.casefold() for g in groups.values() for a in g.get("albums", [])}
        loose_p = sorted(n for n in people if n.casefold() not in named)
        loose_a = sorted(a for a in albums if a.casefold() not in alb)
        if loose_p:
            out.append("  Rostos no Google que NÃO estão no people_groups: " + ", ".join(loose_p))
        if loose_a:
            out.append("  Álbuns que NÃO estão no people_groups: " + ", ".join(loose_a))
    else:
        out.append("\n(sem people_groups no config: as fotos só ilustram momentos, sem pessoa)")
    return "\n".join(out)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Relatório das fotos (Takeout / download de álbum).")
    ap.add_argument("--photos", default="./raw_photos")
    ap.add_argument("--config", default="./wrapped_config.json")
    ap.add_argument("--year", type=int)
    args = ap.parse_args(argv)
    cfg_path = Path(args.config)
    cfg = json.loads(cfg_path.read_text(encoding="utf-8")) if cfg_path.exists() else {}
    tk = cfg.get("takeout") or {}
    year = args.year or (cfg.get("period") or {}).get("year")
    photos = T.filter_period(T.load_takeout(Path(args.photos)), year=year)
    print(build_report(photos, tk.get("people_groups") or {}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
