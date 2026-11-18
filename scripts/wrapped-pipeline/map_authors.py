#!/usr/bin/env python3
"""De-para: quem é quem no chat do WhatsApp → nome da pessoa no app (aliases.json).

    python map_authors.py --input ./raw_data --app-names ./raw_data/app_names.txt            # só mostra o relatório
    python map_authors.py --input ./raw_data --app-names ./raw_data/app_names.txt --interactive  # pergunta e grava

`app_names.txt` = um nome por linha, exatamente como aparece no app (veja o README). Tudo local/offline.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Callable, Optional

import parser as P
from models import Message

_PHONE_RE = re.compile(r"\+?\(?\d[\d\s().-]{8,}\d")
BOTS = {"meta ai"}  # robôs: não são pessoas


def is_phone(author: str) -> bool:
    return bool(_PHONE_RE.fullmatch(author.strip()))


def mask(author: str) -> str:
    """Telefone aparece mascarado na tela (só os 4 últimos dígitos); a chave gravada é o número inteiro."""
    return re.sub(r"\d(?=(?:\D*\d){4})", "#", author) if is_phone(author) else author


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().casefold()
    return re.sub(r"[^a-z ]+", " ", s).strip()


def score(chat_name: str, app_name: str) -> float:
    """0–1: semelhança entre o nome no chat e no app (apelido que é prefixo do nome conta: Gui → Guilherme)."""
    a, b = norm(chat_name), norm(app_name)
    if not a or not b:
        return 0.0
    ta, tb = a.split(), b.split()
    match = lambda t, others: len(t) >= 3 and any(u.startswith(t) or t.startswith(u) for u in others if len(u) >= 3)
    # cobertura nos dois sentidos: "Gui Pereira" ↔ "Gui", "Gui" ↔ "Guilherme Pereira"
    cover = max(sum(match(t, tb) for t in ta) / len(ta), sum(match(u, ta) for u in tb) / len(tb))
    return max(difflib.SequenceMatcher(None, a, b).ratio(), 0.9 * cover)


def suggest(chat_name: str, app_names: list[str], min_score: float = 0.65) -> list[tuple[str, float]]:
    ranked = sorted(((n, score(chat_name, n)) for n in app_names), key=lambda x: (-x[1], x[0]))
    return [(n, s) for n, s in ranked if s >= min_score][:3]


def collect(messages: list[Message], samples: int = 3) -> dict[str, dict]:
    """Por autor: nº de mensagens, grupos, datas e algumas falas curtas (para você reconhecer quem é)."""
    info: dict[str, dict] = {}
    groups: dict[str, set] = defaultdict(set)
    for m in messages:
        if m.author.casefold() in BOTS:
            continue
        d = info.setdefault(m.author, {"count": 0, "first": m.ts, "last": m.ts, "samples": []})
        d["count"] += 1
        d["last"] = m.ts
        groups[m.author].add(m.group or "(único)")
        if m.kind == "text" and len(d["samples"]) < samples and 12 <= len(m.text.strip()) <= 70 and not _PHONE_RE.search(m.text):
            d["samples"].append(m.text.strip().replace("\n", " "))
    for a, d in info.items():
        d["groups"] = sorted(groups[a])
    return info


def load_names(path: Optional[Path]) -> list[str]:
    if not path or not path.exists():
        return []
    return [l.strip() for l in path.read_text(encoding="utf-8-sig").splitlines() if l.strip() and not l.startswith("#")]


def merge_alias(aliases: dict[str, list[str]], app_name: str, chat_author: str) -> None:
    """aliases: {nome no app: [nomes/números no chat]} (formato do aliases.json)."""
    lst = aliases.setdefault(app_name, [])
    if chat_author not in lst and chat_author != app_name:
        lst.append(chat_author)


def unresolved(info: dict, aliases: dict[str, list[str]], app_names: list[str]) -> list[str]:
    """Autores que precisam de decisão: números, "Você" e nomes que não batem com nenhum nome do app."""
    mapped = {a.casefold() for v in aliases.values() for a in v} | {k.casefold() for k in aliases}
    apps = {n.casefold() for n in app_names}
    out = []
    for a in sorted(info, key=lambda x: -info[x]["count"]):
        if a.casefold() in mapped or a.casefold() in apps:
            continue
        out.append(a)
    return out


def report(info: dict, aliases: dict, app_names: list[str]) -> str:
    rows = []
    todo = set(unresolved(info, aliases, app_names)) if app_names else {a for a in info if is_phone(a) or a == "Você"}
    for a, d in sorted(info.items(), key=lambda kv: -kv[1]["count"]):
        status = "ok" if a not in todo else "?"
        sug = suggest(a, app_names) if a in todo and app_names else []
        hint = f"  → {sug[0][0]} ({sug[0][1]:.0%})" if sug else ""
        rows.append(f"[{status}] {mask(a):28} {d['count']:6} msgs  {len(d['groups'])} grupos{hint}")
    return "\n".join(rows)


def interactive(info: dict, aliases: dict[str, list[str]], app_names: list[str],
                ask: Optional[Callable[[str], str]] = None, out: Callable[[str], None] = print) -> dict[str, list[str]]:
    """Pergunta, para cada autor pendente, quem é no app. Enter pula; 'q' encerra e salva o que já foi respondido."""
    ask = ask or input  # resolvido na hora (não na definição), para poder ser trocado
    todo = unresolved(info, aliases, app_names)
    out(f"{len(todo)} autores para resolver. Enter = pular, q = sair e salvar.\n")
    for a in todo:
        d = info[a]
        out(f"— {mask(a)} · {d['count']} msgs · {d['first']:%d/%m} a {d['last']:%d/%m} · grupos: {', '.join(d['groups'][:4])}")
        for s in d["samples"]:
            out(f"    “{s}”")
        sug = suggest(a, app_names)
        opts = [n for n, _ in sug] + [n for n in app_names if n not in [x for x, _ in sug]]
        for i, n in enumerate(opts[:12], 1):
            out(f"    {i}) {n}" + (f"  ({dict(sug)[n]:.0%})" if n in dict(sug) else ""))
        ans = ask("  quem é? (nº, nome, Enter pula, q sai): ").strip()
        if ans.lower() == "q":
            break
        if not ans:
            continue
        name = opts[int(ans) - 1] if ans.isdigit() and 1 <= int(ans) <= len(opts) else ans
        merge_alias(aliases, name, a)
        out(f"    ✔ {mask(a)} → {name}\n")
    return aliases


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="De-para dos autores do chat com os nomes do app.")
    ap.add_argument("--input", required=True)
    ap.add_argument("--year", type=int)
    ap.add_argument("--app-names", help="arquivo com um nome do app por linha")
    ap.add_argument("--aliases", help="aliases.json (padrão: <input>/aliases.json); é atualizado com --interactive")
    ap.add_argument("--interactive", action="store_true")
    ap.add_argument("--auto", type=float, metavar="MIN", help="aceita sozinho as sugestões com semelhança >= MIN (ex.: 0.85) e grava")
    ap.add_argument("--samples", type=int, default=3, help="falas de exemplo por pessoa (para reconhecer quem é)")
    args = ap.parse_args(argv)

    inp = Path(args.input)
    path = Path(args.aliases) if args.aliases else (inp / "aliases.json" if inp.is_dir() else inp.parent / "aliases.json")
    aliases: dict[str, list[str]] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    msgs, _ = P.load_input(inp)
    msgs = P.filter_period(msgs, year=args.year)
    names = load_names(Path(args.app_names) if args.app_names else None)
    info = collect(P.apply_aliases(msgs, P.load_aliases(path)), args.samples)

    print(report(info, aliases, names))
    if not names:
        print("\n(sem --app-names: só aponto números e 'Você'. Veja no README como gerar o app_names.txt)")
    if args.auto:
        for a in unresolved(info, aliases, names):
            top = suggest(a, names)
            if top and top[0][1] >= args.auto:
                merge_alias(aliases, top[0][0], a)
                print(f"✔ auto: {mask(a)} → {top[0][0]} ({top[0][1]:.0%})")
        path.write_text(json.dumps(aliases, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.interactive:
        interactive(info, aliases, names)
        path.write_text(json.dumps(aliases, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✔ salvo em {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
