#!/usr/bin/env python3
"""Gera o JSON de estatísticas do chat para o app (/estatisticas).

    python3 run_insights.py --input ../wrapped-pipeline/raw_data --slug 2026 --no-ai          # só números, segundos
    python3 run_insights.py --input ../wrapped-pipeline/raw_data --slug 2026                    # + temas (Ollama)
    python3 run_insights.py ... --upload                                                       # grava no Supabase

Uso contínuo: solte o export novo em raw_data/ e rode de novo. As estatísticas são recalculadas
(leva segundos) e a IA só trabalha nas conversas ainda não rotuladas (cache em output/.ai_cache).
Agende com cron / Agendador de Tarefas se quiser.

--upload usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (variáveis de ambiente, NUNCA no repositório).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "wrapped-pipeline"))
sys.path.insert(0, str(HERE))

import ai_curator  # noqa: E402
import insights  # noqa: E402
import parser as chat_parser  # noqa: E402
import topics  # noqa: E402
from build_wrapped import DEFAULT_EXCLUDE, hide_phone_authors, load_config  # noqa: E402


def build(args: argparse.Namespace, cfg: Optional[dict] = None, now: Optional[datetime] = None) -> dict[str, Any]:
    cfg = cfg or {}
    log = (lambda *a: print(*a, file=sys.stderr)) if not args.quiet else (lambda *a: None)
    inp = Path(args.input)
    aliases = chat_parser.load_aliases(Path(args.aliases) if args.aliases else (inp / "aliases.json" if inp.is_dir() else None))
    messages, _media = chat_parser.load_input(inp, {"dmy": True, "mdy": False}.get(args.date_order))
    messages = chat_parser.apply_aliases(messages, aliases)
    excluded = {x.casefold() for x in (*DEFAULT_EXCLUDE, *(cfg.get("exclude_authors") or []), *(args.exclude or []))}
    messages = hide_phone_authors([m for m in messages if m.author.casefold() not in excluded])
    if args.year:
        messages = chat_parser.filter_period(messages, year=args.year)
    if not messages:
        raise SystemExit("Nenhuma mensagem encontrada. Confira --input/--year (e --date-order).")
    messages.sort(key=lambda m: m.ts)
    log(f"✔ {len(messages)} mensagens")

    result = insights.compute_insights(messages, cfg.get("stopwords") or [])
    log(f"✔ estatísticas: {len(result['people'])} pessoas, {result['conversations']} conversas")

    if not args.no_ai:
        mcfg = cfg.get("model") or {}
        client = ai_curator.OllamaClient(args.model or mcfg.get("name") or ai_curator.DEFAULT_MODEL,
                                         args.ollama_url or mcfg.get("url") or ai_curator.DEFAULT_URL, timeout=args.timeout,
                                         cache_dir=None if args.no_cache else Path(args.out).parent / ".ai_cache")
        result["topics"] = topics.analyze_topics(client, insights.conversations(messages), args.max_blocks, log)
        log(f"✔ temas ({client.cache_hits} do cache)")

    now = now or datetime.now(timezone.utc)
    return {"slug": args.slug or str(result["periodEnd"] or "")[:4], "title": args.title,
            "generatedAt": now.isoformat(timespec="seconds"), **result}


def upload(data: dict[str, Any], is_active: bool, env=os.environ) -> None:
    """Upsert em chat_stats_snapshots via REST do Supabase (chave de serviço só no ambiente local)."""
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para usar --upload.")
    slug = data["slug"]
    body = json.dumps({"slug": slug, "config": {k: v for k, v in data.items() if k != "slug"}, "is_active": is_active,
                       "updated_at": data["generatedAt"]}).encode()
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/chat_stats_snapshots?on_conflict=slug", data=body, method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates"})
    try:
        urllib.request.urlopen(req, timeout=30).read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Supabase recusou o upload (HTTP {e.code}): {e.read().decode(errors='replace')[:300]}") from e


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input", required=True, help="pasta (ou .zip) com a exportação do WhatsApp/Telegram")
    p.add_argument("--year", type=int, help="só este ano (padrão: o histórico inteiro)")
    p.add_argument("--slug", help="identificador da edição no app (padrão: ano da última mensagem)")
    p.add_argument("--title", default="Estatísticas do grupo")
    p.add_argument("--config", help="wrapped_config.json (padrão: o do pipeline do Wrapped, se existir)")
    p.add_argument("--aliases")
    p.add_argument("--exclude", action="append")
    p.add_argument("--date-order", choices=["auto", "dmy", "mdy"], default="auto")
    p.add_argument("--no-ai", action="store_true", help="só estatísticas, sem temas (não precisa de Ollama)")
    p.add_argument("--model")
    p.add_argument("--ollama-url")
    p.add_argument("--timeout", type=int, default=900)
    p.add_argument("--max-blocks", type=int, default=300, help="máx. de conversas rotuladas pela IA")
    p.add_argument("--no-cache", action="store_true")
    p.add_argument("--out", default=str(HERE / "output" / "chat_stats.json"))
    p.add_argument("--upload", action="store_true", help="grava no Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)")
    p.add_argument("--active", action="store_true", help="com --upload: marca a edição como ativa")
    p.add_argument("--quiet", action="store_true")
    return p


def main(argv: Optional[list[str]] = None) -> int:
    args = make_parser().parse_args(argv)
    default_cfg = HERE.parent / "wrapped-pipeline" / "wrapped_config.json"
    cfg = load_config(Path(args.config) if args.config else (default_cfg if default_cfg.exists() else None))
    data = build(args, cfg)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✔ {out}", file=sys.stderr)
    if args.upload:
        upload(data, args.active)
        print(f"✔ enviado ao Supabase (slug {data['slug']}); escolha quem vê em /admin/estatisticas", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
