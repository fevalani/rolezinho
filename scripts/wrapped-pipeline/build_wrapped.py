#!/usr/bin/env python3
"""Módulo 5 — orquestra o pipeline e gera `wrapped_output.json` no schema do frontend.

Uso:  python build_wrapped.py --input ./raw_data --year 2026 --model qwen3-vl:8b-instruct
      python build_wrapped.py --input ./raw_data --year 2026 --dry-run      # sem Ollama
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import ai_curator
import highlights
import imgprivacy
import photo_curation
import takeout as takeout_mod
import parser as chat_parser
import stats as stats_mod
from models import Message
from photo_curation import Analysis

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent


_PHONE_RE = re.compile(r"\+?\(?\d[\d\s().-]{8,}\d")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
DEFAULT_EXCLUDE = ("Meta AI",)  # robô do WhatsApp: não é um participante


def scrub(s: str) -> str:
    """Nada de telefone nem e-mail no JSON final (ele vai para o app)."""
    return _EMAIL_RE.sub("[e-mail]", _PHONE_RE.sub("[número]", s))


def hide_phone_authors(messages: list[Message]) -> list[Message]:
    """Contato sem nome salvo aparece como número: vira "Participante N" (use aliases.json para pôr o nome)."""
    phones = list(dict.fromkeys(m.author for m in messages if _PHONE_RE.fullmatch(m.author.strip())))
    if not phones:
        return messages
    names = {p: f"Participante {i}" for i, p in enumerate(phones, 1)}
    return [replace(m, author=names[m.author]) if m.author in names else m for m in messages]


def cut(s: str, n: int) -> str:
    """Respeita os limites do parseEdition do frontend (título 100, descrição 400, rótulos 80)."""
    s = " ".join(scrub(str(s)).split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def ranking(title: str, rows: list[dict], sub, description: Optional[str] = None, n: int = 5,
            image: Optional[str] = None) -> Optional[dict]:
    rows = rows[:n]
    if not rows:
        return None
    slide = {
        "type": "custom_ranking", "title": cut(title, 100),
        **({"description": cut(description, 400)} if description else {}),
        "items": [{"rank": i, "label": cut(r["name"], 80), "sublabel": cut(sub(r), 80)} for i, r in enumerate(rows, 1)],
    }
    if image:  # foto ilustrando o vencedor (1º lugar)
        slide["items"][0]["imageUrl"] = image
    return slide


# Slides que o PRÓPRIO APP monta com os dados dele (jogos, músicas, Cultura, dados, bolão, agenda).
# No modo "Grupo" mostram quem mais fez cada coisa; no modo "Você", os números da pessoa (ou somem, se não houver).
APP_SLIDES = {
    "none": [],
    "default": ["summary", "top_members", "top_players", "games", "top_music", "top_music_members",
                "top_cultura_members", "top_dice_members", "top_bolao_members"],
}
APP_SLIDES["all"] = APP_SLIDES["default"] + ["top_cultura", "dice", "bolao", "agenda", "top_agenda_members", "peak_weekday"]


def fmt_date(ts: datetime) -> str:
    return f"{ts:%d/%m/%Y}"


def assemble_edition(*, slug: str, year: int, title: str, subtitle: str, st: dict[str, Any],
                     events: list[dict], archetypes: list[dict], photos: list[dict],
                     limits: Optional[dict[str, int]] = None, is_active: bool = False,
                     winner_images: Optional[dict[str, str]] = None, jokes: Optional[list[dict]] = None,
                     app_slides: Optional[list[str]] = None) -> dict[str, Any]:
    """Monta o JSON do frontend. `events`: {start,title,summary,pearls}; `archetypes`: {name,title,reason};
    `photos`: {url,caption,category,author,date}. Só entra slide que tem conteúdo."""
    img = winner_images or {}
    lim = {"events": 6, "pearls": 6, "archetypes": 6, "photo_slides": 12, **(limits or {})}
    slides: list[Optional[dict]] = [
        {"type": "intro", "title": cut(title, 100),
         "description": cut(f"{st['total_messages']:,} mensagens de {len(st['participants'])} pessoas em {st['active_days']} dias.".replace(",", "."), 400)},
        {"type": "highlight", "title": f"{st['total_messages']:,} mensagens".replace(",", "."),
         "description": cut(f"O grupo bateu papo em {st['active_days']} dias diferentes de {year}.", 400)},
        ranking("Os Grupos Mais Agitados", st["groups"], lambda r: f"{r['value']} mensagens"),
        ranking("As Palestrinhas", st["talkers"], lambda r: f"{r['value']} mensagens", image=img.get("talkers")),
        ranking("Os Reis do Textão", st["essayists"], lambda r: f"{r['value']:.0f} caracteres por mensagem", image=img.get("essayists")),
        ranking("Os Fantasmas", st["ghosts"], lambda r: f"só {r['value']} mensagens", image=img.get("ghosts")),
        ranking("As Corujas do Grupo", st["owls"], lambda r: f"{r['value']} mensagens de madrugada (1h–5h)",
                "Quem estava acordado quando todo mundo dormia.", image=img.get("owls")),
    ]
    if st["busiest_weekday"] and st["busiest_hour"]:
        slides.append({
            "type": "highlight", "title": f"{st['busiest_weekday']['name'].capitalize()}, {st['busiest_hour']['name']}h",
            "description": cut(f"{st['busiest_weekday']['name'].capitalize()} foi o dia mais movimentado "
                               f"({st['busiest_weekday']['value']} mensagens) e {st['busiest_hour']['name']}h o horário de pico "
                               f"({st['busiest_hour']['value']} mensagens).", 400)})
    slides += [
        ranking("Os Sommeliers de Áudio", st["audio"], lambda r: f"{r['value']} áudios", image=img.get("audio")),
        ranking("Os Reis da Figurinha", st["stickers"], lambda r: f"{r['value']} figurinhas", image=img.get("stickers")),
        ranking("Os Fotógrafos", st["photos"], lambda r: f"{r['value']} fotos", image=img.get("photos")),
        ranking("As Palavras do Ano", st["top_words"], lambda r: f"{r['value']} vezes"),
        ranking("O Emoji de Cada Um", st["signature_emoji"], lambda r: f"{r['emoji']} · {r['count']} vezes", image=img.get("signature_emoji")),
        ranking("Quem Faz o Grupo Rir", st["funniest"], lambda r: f"{r['value']} mensagens que viraram risada", image=img.get("funniest")),
    ]
    # estatísticas do app (a tela monta com os dados reais; títulos padrão em pt-BR)
    slides += [{"type": "auto_user_stats", "metricKey": k} for k in app_slides or []]
    for ev in events[: lim["events"]]:
        slides.append({"type": "highlight", "title": cut(ev["title"], 100),
                       "description": cut(f"{fmt_date(ev['start'])}{' · ' + ev['group'] if ev.get('group') else ''} — {ev['summary']}", 400),
                       **({"imageUrl": ev["image"]} if ev.get("image") else {})})
    pearls, seen = [], set()
    for ev in events:
        for p in ev.get("pearls", []):
            key = " ".join(p["quote"].casefold().split())
            if key not in seen:  # a mesma frase pode vir de dois picos
                seen.add(key)
                pearls.append((p, ev["start"]))
    for p, when in pearls[: lim["pearls"]]:
        slides.append({"type": "quote", "title": cut(p["quote"], 100), "description": cut(f"— {p['author']}, {fmt_date(when)}", 400)})
    for a in archetypes[: lim["archetypes"]]:
        slides.append({"type": "highlight", "title": cut(f"{a['name']}: {a['title']}", 100), "description": cut(a["reason"], 400)})
    for j in jokes or []:  # piadas com foto (ou só a legenda, se a foto não for publicada)
        d = f"{j['name']} · {j['date']}"
        slides.append({"type": "media", "title": cut(j["caption"], 100), "description": cut(d, 400), "imageUrl": j["url"]}
                      if j.get("url") else {"type": "highlight", "title": cut(j["caption"], 100), "description": cut(d, 400)})
    for ph in photos[: lim["photo_slides"]]:
        slides.append({"type": "media", "title": cut(ph["caption"], 100), "imageUrl": ph["url"],
                       "description": cut(f"{ph['category']} · {ph['author']} · {ph['date']}", 400)})

    final = [s for s in slides if s]
    for i, s in enumerate(final, 1):
        s["position"] = i
    return {"slug": slug, "pageTitle": cut(title, 80), "subtitle": cut(subtitle, 160), "isActive": is_active,
            "slides": [{"position": s.pop("position"), **s} for s in final]}


def copy_photos(selected: list[dict], dest: Path, url_base: str, caps: dict[Any, dict]) -> list[dict]:
    """Copia só as fotos escolhidas, com nomes limpos (foto-01.jpg), e devolve os dados dos slides."""
    out = []
    for i, p in enumerate(selected, 1):
        name = f"foto-{i:02d}{p['path'].suffix.lower()}"
        try:
            imgprivacy.copy_clean(p["path"], dest / name)  # sem GPS/EXIF
        except ValueError as e:
            print(f"! foto ignorada (não consegui limpar os metadados): {e}", file=sys.stderr)
            continue
        cap = caps.get(id(p), {})
        m: Message = p["message"]
        out.append({"url": f"{url_base}/{name}", "caption": cap.get("caption") or f"Foto de {m.author}",
                    "category": cap.get("category") or "Rolê", "author": m.author, "date": fmt_date(m.ts)})
    return out


PRIORITY = ["talkers", "essayists", "ghosts", "owls", "audio", "stickers", "photos", "funniest", "signature_emoji"]


def winner_names(st: dict) -> set[str]:
    """Quem é 1º lugar em alguma categoria: só deles precisamos de foto (poupa análises de visão, que são lentas)."""
    return {st[c][0]["name"] for c in PRIORITY if st.get(c)}


def run_takeout(args: argparse.Namespace, cfg: dict, st: dict, messages: list[Message], peaks: list[dict], events: list[dict],
                client: Optional["ai_curator.OllamaClient"], vision: bool, dest: Path, url_base: str,
                log) -> tuple[dict[str, str], list[dict], dict[int, str]]:
    """Fotos do Google Fotos → (foto por vencedor, slides de piada, foto por evento). Só as escolhidas são copiadas.

    Dois usos, ambos opcionais: ilustrar o MOMENTO (foto tirada perto de um pico de conversa) e, se
    `people_groups` estiver no config, ilustrar o VENCEDOR de uma categoria com uma foto dele.
    """
    tk = cfg.get("takeout") or {}
    path = args.takeout or tk.get("path")
    groups = tk.get("people_groups") or {}
    if args.no_takeout or not path or not Path(path).exists():
        return {}, [], {}
    known = {a.casefold() for a in st["participants"]}
    silent = [m for m in groups if m.casefold() not in known]
    if silent:  # perfil do app que não fala nos grupos: nunca ganha ranking, então não gasta análise de foto
        log(f"• takeout: sem mensagens no chat (ignorados como vencedores): {', '.join(silent)}")
    groups = {m: g for m, g in groups.items() if m.casefold() in known}
    period = cfg.get("period") or {}
    photos = takeout_mod.filter_period(
        takeout_mod.load_takeout(Path(path)), args.year or period.get("year"),
        datetime.fromisoformat(period["start"]) if period.get("start") else None,
        datetime.fromisoformat(period["end"]) if period.get("end") else None)

    weak = sum(1 for p in photos if p.date_source == "mtime")
    if weak:
        log(f"! takeout: {weak} fotos sem data de captura (sem json/EXIF/nome): usei a data do arquivo, que pode estar errada")
    # Pessoas de fora dos grupos: fotos com elas nunca são analisadas nem publicadas.
    avoid = {x.casefold() for x in tk.get("exclude_people", [])}
    if avoid:
        kept = [p for p in photos if not ({n.casefold() for n in p.people} & avoid)]
        if len(kept) != len(photos):
            log(f"• takeout: {len(photos) - len(kept)} fotos com pessoas de fora dos grupos foram descartadas")
        photos = kept
    windows = [(p["start"], p["end"]) for p in peaks]
    margin = float(tk.get("moment_margin_hours", 2))
    flat: dict[Path, tuple[takeout_mod.TakeoutPhoto, tuple[str, ...]]] = {}
    if groups:
        champions = {m: g for m, g in groups.items() if m in winner_names(st)}
        log(f"• takeout: fotos só para quem ganha alguma categoria ({len(champions)} de {len(groups)} pessoas)")
        for items in takeout_mod.candidates(photos, champions, int(tk.get("candidates_per_member", 4))).values():
            for ph, ms in items:
                flat[ph.path] = (ph, ms)
    for ph in takeout_mod.moment_candidates(photos, windows, int(tk.get("candidates_per_moment", 3)), margin,
                                            int(tk.get("extra_candidates", 6))):
        flat.setdefault(ph.path, (ph, ()))
    cap = int(tk.get("max_analyzed", 30))
    items = list(flat.values())[:cap]
    log(f"✔ takeout: {len(photos)} fotos no período; {len(items)} candidatas "
        f"({'momento + pessoas' if groups else 'por momento'})")

    analyses: list[Analysis] = []
    for i, (ph, ms) in enumerate(items, 1):
        res = None
        if client and vision:
            log(f"  foto takeout {i}/{len(items)}…")
            t0 = time.monotonic()
            res = ai_curator.curate_takeout_photo(client, ph.path, ms)
            log(f"    ok em {time.monotonic() - t0:.0f}s")
        if res:
            analyses.append(Analysis(ph, ms, res["caption"], res["funny_score"], res["theme"],
                                     bool(res["sensitive"]) and tk.get("skip_sensitive", True)))
        else:
            analyses.append(Analysis(ph, ms))

    max_pub = int(tk.get("max_published", 8))
    shown = events[: args.events]
    ev_pick = (photo_curation.pick_event_photos([(e["start"], e["end"]) for e in shown], analyses, margin, max_pub)
               if client else {})  # sem IA não há eventos nem filtro de conteúdo sensível
    winners = [(c, st[c][0]["name"]) for c in PRIORITY if st.get(c)] if groups else []
    # "momento" de cada pessoa = os dias em que ela mais falou no chat (a foto dela perto deles ganha)
    per_day: Counter = Counter((m.author, m.ts.date()) for m in messages)
    moments: dict[str, list[datetime]] = {}
    for (who, day), _ in per_day.most_common():
        if len(moments.setdefault(who, [])) < 5:
            moments[who].append(datetime(day.year, day.month, day.day, 12))
    chosen, jokes = photo_curation.pick_illustrations(
        winners, analyses, max(0, max_pub - len(ev_pick)), int(tk.get("joke_slides", 3)) if client else 0,
        exclude=set(ev_pick.values()), moments=moments, moment_days=float(tk.get("moment_days", 2)))

    publish = bool(tk.get("publish", True)) and not args.no_copy_media
    winner_images: dict[str, str] = {}
    event_images: dict[int, str] = {}
    joke_slides: list[dict] = []
    n = 0

    def publish_one(a: Analysis, prefix: str) -> Optional[str]:
        nonlocal n
        n += 1
        name = f"{prefix}-{n:02d}{a.photo.path.suffix.lower()}"
        try:
            imgprivacy.copy_clean(a.photo.path, dest / name)
        except ValueError as e:
            print(f"! foto ignorada (não consegui limpar os metadados): {e}", file=sys.stderr)
            return None
        return f"{url_base}/{name}"

    for k, a in ev_pick.items():
        if publish and (url := publish_one(a, "ilustra")):
            event_images[k] = url
    for cat, a in chosen.items():
        if publish and (url := publish_one(a, "ilustra")):
            winner_images[cat] = url
    for a in jokes:
        url = publish_one(a, "piada") if publish else None
        who = " e ".join(a.members) if a.members else "O grupo"
        joke_slides.append({"url": url, "caption": a.caption or "Foto do rolê", "name": who, "date": fmt_date(a.photo.taken)})
    total = len(event_images) + len(winner_images) + len(joke_slides)
    log(f"✔ takeout: {len(event_images)} fotos de eventos, {len(winner_images)} de vencedores, {len(joke_slides)} de piada"
        + ("" if not client else f" ({'copiadas sem metadados para ' + str(dest) if publish else 'SEM publicar'})")
        + ("" if client or total else " — a escolha das fotos só acontece com a IA (sem --dry-run)"))
    return winner_images, joke_slides, event_images


def load_config(path: Optional[Path]) -> dict:
    """wrapped_config.json: config da IA que monta o Wrapped (modelo, período, fotos). Opcional."""
    if not path or not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _speed(client: "ai_curator.OllamaClient") -> str:
    """" · 4.2 tokens/s" da última chamada; avisa se o modelo 'pensou' mesmo com think=false."""
    st = client.last_stats
    out = ""
    if st.get("eval_count") and st.get("eval_duration"):
        out = f" · {st['eval_count'] / (st['eval_duration'] / 1e9):.1f} tokens/s"
    if client.thinking_seen:
        out += " · ! o modelo ainda 'pensa' (qwen3-vl:8b-instruct costuma ser bem mais rápido)"
    return out


def member_facts(name: str, st: dict) -> str:
    def val(key: str) -> int:
        return next((r["value"] for r in st[key] if r["name"] == name), 0)
    emo = next((r for r in st["signature_emoji"] if r["name"] == name), None)
    return (f"{val('talkers')} mensagens, {val('audio')} áudios, {val('stickers')} figurinhas, {val('photos')} fotos, "
            f"{val('owls')} de madrugada" + (f", emoji favorito {emo['emoji']}" if emo else ""))


def run(args: argparse.Namespace, cfg: Optional[dict] = None) -> dict[str, Any]:
    cfg = cfg or {}
    mcfg = cfg.get("model") or {}
    args.model = args.model or mcfg.get("name") or ai_curator.DEFAULT_MODEL
    args.ollama_url = args.ollama_url or mcfg.get("url") or ai_curator.DEFAULT_URL
    args.no_vision = args.no_vision or mcfg.get("vision") is False
    log = (lambda *a: print(*a, file=sys.stderr)) if not args.quiet else (lambda *a: None)
    aliases = chat_parser.load_aliases(Path(args.aliases) if args.aliases else
                                       (Path(args.input) / "aliases.json" if Path(args.input).is_dir() else None))
    day_first = {"dmy": True, "mdy": False}.get(args.date_order)
    messages, media = chat_parser.load_input(Path(args.input), day_first)
    messages = chat_parser.apply_aliases(messages, aliases)
    excluded = {x.casefold() for x in (*DEFAULT_EXCLUDE, *(cfg.get("exclude_authors") or []), *(args.exclude or []))}
    messages = hide_phone_authors([m for m in messages if m.author.casefold() not in excluded])
    year = args.year or (cfg.get("period") or {}).get("year") or (max(m.ts.year for m in messages) if messages else datetime.now().year)
    messages = chat_parser.filter_period(messages, year=year)
    if not messages:
        raise SystemExit(f"Nenhuma mensagem encontrada em {year}. Confira --input/--year (e --date-order).")
    if any(m.author == "Você" for m in messages):
        log('! "Você" é o dono do export: mapeie para o seu nome em raw_data/aliases.json, ex.: {"Seu Nome": ["Você"]}')
    if any(m.author.startswith("Participante ") for m in messages):
        log("! há contatos sem nome salvo (números de telefone): dê um nome a eles no aliases.json (a chave é o número)")
    log(f"✔ {len(messages)} mensagens de {year}; {len(media)} arquivos de mídia indexados")

    st = stats_mod.compute_stats(messages)
    peaks = highlights.find_peaks(messages, args.peak_window, args.top_peaks)
    photos_sel = highlights.select_photos(messages, media, top_n=args.top_photos)
    log(f"✔ {len(peaks)} picos de conversa, {len(photos_sel)} fotos engajadas")

    events: list[dict] = []
    archetypes: list[dict] = []
    caps: dict[Any, dict] = {}
    client: Optional[ai_curator.OllamaClient] = None
    vision = False
    if not args.dry_run:
        client = ai_curator.OllamaClient(args.model, args.ollama_url, timeout=args.timeout,
                                         cache_dir=None if args.no_cache else Path(args.out).parent / ".ai_cache")
        if not args.quiet:
            client.on_progress = lambda n: print(".", end="", file=sys.stderr, flush=True)  # 1 ponto = 25 trechos gerados
        vision = client.has_vision() and not args.no_vision
        log(f"✔ Ollama: {args.model} ({'com' if vision else 'sem'} visão)")
        for i, peak in enumerate(peaks, 1):
            log(f"  evento {i}/{len(peaks)}…")
            t0 = time.monotonic()
            ev = ai_curator.curate_event(client, peak)
            log(f"    ok em {time.monotonic() - t0:.0f}s" + _speed(client))
            events.append({"start": peak["start"], "end": peak["end"], "count": peak["count"], "group": peak["group"], **ev})
        events.sort(key=lambda e: -e["count"])  # os mais "explosivos" primeiro (recorte vai pelos limites)
        by_author: dict[str, list[Message]] = {}
        for m in messages:
            by_author.setdefault(m.author, []).append(m)
        for t in st["talkers"][: args.archetypes]:
            log(f"  arquétipo de {t['name']}…")
            t0 = time.monotonic()
            a = ai_curator.curate_archetype(client, t["name"], member_facts(t["name"], st),
                                            ai_curator.sample_messages(by_author[t["name"]]))
            log(f"    ok em {time.monotonic() - t0:.0f}s")
            archetypes.append({"name": t["name"], **a})
        if vision:
            for i, p in enumerate(photos_sel, 1):
                log(f"  foto {i}/{len(photos_sel)}…")
                res = ai_curator.curate_photo(client, p["path"], p["message"].author)
                if res:
                    caps[id(p)] = res
    else:
        log("• dry-run: Ollama não foi chamado (sem eventos, pérolas, arquétipos e legendas da IA)")

    slug = args.slug or str(year)
    dest = Path(args.media_dest) if args.media_dest else REPO_ROOT / "public" / "wrapped" / slug / "media"
    url_base = f"/wrapped/{slug}/media"
    if not args.no_copy_media:
        imgprivacy.clean_media_dir(dest)  # nada de foto de execução anterior sobrando
    winner_images, jokes, event_images = run_takeout(args, cfg, st, messages, peaks, events, client, vision, dest, url_base, log)
    for k, url in event_images.items():
        events[k]["image"] = url
    photo_slides: list[dict] = []
    if not args.no_copy_media and photos_sel:
        # só as fotos que viram slide são copiadas
        chosen = photos_sel[: args.photo_slides]
        photo_slides = copy_photos(chosen, dest, url_base, caps)
        log(f"✔ {len(photo_slides)} fotos copiadas para {dest}")

    return assemble_edition(
        slug=slug, year=year, title=args.title or f"Wrapped {year} — O Grupo", subtitle=args.subtitle,
        st=st, events=events, archetypes=archetypes, photos=photo_slides,
        limits={"events": args.events, "pearls": args.pearls, "archetypes": args.archetypes, "photo_slides": args.photo_slides},
        winner_images=winner_images, jokes=jokes, app_slides=APP_SLIDES[args.app_slides],
    )


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Pipeline local/offline do Wrapped do grupo.")
    p.add_argument("--input", required=True, help="pasta (ou .zip) com a exportação do WhatsApp/Telegram")
    p.add_argument("--year", type=int, help="ano (padrão: o mais recente do chat)")
    p.add_argument("--config", help="wrapped_config.json (padrão: o da pasta, se existir)")
    p.add_argument("--model", help="modelo Ollama (config model.name, env WRAPPED_MODEL)")
    p.add_argument("--ollama-url", help="só localhost é aceito")
    p.add_argument("--takeout", help="pasta/zip do Google Takeout (config takeout.path)")
    p.add_argument("--no-takeout", action="store_true", help="ignora as fotos do Google Fotos")
    p.add_argument("--timeout", type=int, default=900, help="segundos por chamada ao modelo (CPU lenta: aumente)")
    p.add_argument("--exclude", action="append", help="autor a ignorar (pode repetir; padrão: Meta AI)")
    p.add_argument("--no-cache", action="store_true", help="refaz todas as chamadas à IA (padrão: reaproveita output/.ai_cache)")
    p.add_argument("--app-slides", choices=sorted(APP_SLIDES), default="default",
                   help="slides com dados do app (jogos, músicas, Cultura, dados, bolão…): none | default | all")
    p.add_argument("--no-vision", action="store_true", help="não analisa fotos (modelo só texto)")
    p.add_argument("--dry-run", action="store_true", help="só estatísticas e seleção de picos/fotos; não chama o Ollama")
    p.add_argument("--aliases", help="aliases.json (padrão: <input>/aliases.json)")
    p.add_argument("--date-order", choices=["auto", "dmy", "mdy"], default="auto")
    p.add_argument("--slug", help="padrão: o ano")
    p.add_argument("--title")
    p.add_argument("--subtitle", default="Tudo o que rolou no grupo este ano")
    p.add_argument("--out", default=str(HERE / "output" / "wrapped_output.json"))
    p.add_argument("--media-dest", help="padrão: <repo>/public/wrapped/<slug>/media")
    p.add_argument("--no-copy-media", action="store_true")
    p.add_argument("--peak-window", type=int, default=60, help="minutos por janela de pico")
    p.add_argument("--top-peaks", type=int, default=15)
    p.add_argument("--top-photos", type=int, default=30)
    p.add_argument("--events", type=int, default=6, help="eventos nos slides")
    p.add_argument("--pearls", type=int, default=6)
    p.add_argument("--archetypes", type=int, default=6)
    p.add_argument("--photo-slides", type=int, default=12)
    p.add_argument("--quiet", action="store_true")
    return p


def main(argv: Optional[list[str]] = None) -> int:
    args = make_parser().parse_args(argv)
    # sem --config, só o uso por linha de comando (argv=None) procura o wrapped_config.json padrão
    default_cfg = HERE / "wrapped_config.json" if argv is None else None
    edition = run(args, load_config(Path(args.config) if args.config else default_cfg))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(edition, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.quiet:
        print(f"✔ {len(edition['slides'])} slides → {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
