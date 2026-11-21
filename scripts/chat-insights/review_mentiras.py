#!/usr/bin/env python3
"""Revisa, um a um, os casos de mentira encontrados pela IA. Só os que você aprovar vão para o app.

    python3 review_mentiras.py            # pergunta cada caso ainda sem decisão
    python3 review_mentiras.py --list     # mostra o que já foi aprovado/rejeitado e quantos faltam

Respostas: s = aprovar · n = rejeitar · p = pular (pergunta de novo depois) · q = salvar e sair.
A decisão fica em ../wrapped-pipeline/raw_data/mentiras_aprovadas.json (ignorado pelo git).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Callable, Optional

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import mentiras  # noqa: E402

DEFAULT_CANDIDATES = HERE / "output" / "mentiras_candidatas.json"
DEFAULT_DECISIONS = HERE.parent / "wrapped-pipeline" / "raw_data" / "mentiras_aprovadas.json"
OUTCOME_TEXT = {"admitted": "admitiu que era mentira", "proven_false": "o chat provou que era falso"}


def show(ep: dict, n: int, total: int, out: Callable[[str], None] = print) -> None:
    out(f"\n── caso {n}/{total} · {ep['date']} · {OUTCOME_TEXT.get(ep['outcome'], ep['outcome'])}")
    out(f"  {ep['claimant']} disse:     “{ep['claim']}”")
    out(f"  {ep['contester']} contestou: “{ep['contest']}”")
    out(f"  desfecho:  “{ep['resolution']}”")


def review(candidates: list[dict], decisions: dict, ask: Callable[[str], str] = input,
           out: Callable[[str], None] = print) -> dict:
    """Pergunta cada caso pendente e devolve as decisões atualizadas (muda `decisions` no lugar)."""
    todo = mentiras.pending(candidates, decisions)
    skipped: list[dict] = []
    for n, ep in enumerate(todo, 1):
        show(ep, n, len(todo), out)
        while True:
            a = ask("  aprovar? [s]im / [n]ão / [p]ular / [q]uit: ").strip().lower()[:1]
            if a in ("s", "n", "p", "q"):
                break
        if a == "q":
            break
        if a == "s":
            decisions["approved"].append(ep)
        elif a == "n":
            decisions["rejected"].append(ep["id"])
        else:
            skipped.append(ep)
    out(f"\n✔ {len(decisions['approved'])} aprovados · {len(decisions['rejected'])} rejeitados · {len(mentiras.pending(candidates, decisions))} sem decisão")
    return decisions


def main(argv: Optional[list[str]] = None, ask: Callable[[str], str] = input) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--candidates", default=str(DEFAULT_CANDIDATES))
    ap.add_argument("--decisions", default=str(DEFAULT_DECISIONS))
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args(argv)
    cpath, dpath = Path(args.candidates), Path(args.decisions)
    candidates = json.loads(cpath.read_text(encoding="utf-8")) if cpath.exists() else []
    decisions = mentiras.load_decisions(dpath)
    if args.list:
        print(f"{len(decisions['approved'])} aprovados · {len(decisions['rejected'])} rejeitados · {len(mentiras.pending(candidates, decisions))} sem decisão")
        for n, ep in enumerate(decisions["approved"], 1):
            show(ep, n, len(decisions["approved"]))
        return 0
    if not candidates:
        print("Nenhum caso candidato. Rode run_insights.py com a IA (sem --no-ai) para gerar.", file=sys.stderr)
        return 1
    review(candidates, decisions, ask)
    mentiras.save_decisions(dpath, decisions)
    return 0


if __name__ == "__main__":
    sys.exit(main())
