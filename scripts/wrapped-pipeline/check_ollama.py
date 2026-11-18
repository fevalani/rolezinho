#!/usr/bin/env python3
"""Diagnóstico rápido do Ollama (1–3 min): conexão, visão, velocidade e se o modelo "pensa" sem necessidade.

    python check_ollama.py --model qwen3-vl:8b
"""
from __future__ import annotations

import argparse
import sys
import time

import ai_curator as A


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=A.DEFAULT_MODEL)
    ap.add_argument("--ollama-url", default=A.DEFAULT_URL)
    ap.add_argument("--timeout", type=int, default=300)
    args = ap.parse_args(argv)
    c = A.OllamaClient(args.model, args.ollama_url, timeout=args.timeout)
    c.on_progress = lambda n: print(".", end="", flush=True)

    def step(name, prompt, schema, max_tokens):
        print(f"\n▶ {name}…", flush=True)
        t0 = time.monotonic()
        try:
            c.chat_json(prompt, schema, max_tokens=max_tokens, retries=1)
        except A.OllamaError as e:
            print(f"\n  ✗ {e}")
            if c.last_stats.get("thinking_chars"):
                print(f"    (o modelo 'pensou' {c.last_stats['thinking_chars']} caracteres e não sobrou resposta)")
            return None
        dt, st = time.monotonic() - t0, c.last_stats
        gen = st["eval_count"] / (st["eval_duration"] / 1e9) if st.get("eval_count") and st.get("eval_duration") else 0
        pre = st["prompt_eval_count"] / (st["prompt_eval_duration"] / 1e9) if st.get("prompt_eval_count") and st.get("prompt_eval_duration") else 0
        print(f"\n  ✔ {dt:.0f}s  | geração {gen:.1f} tok/s | leitura do prompt {pre:.0f} tok/s ({st.get('prompt_eval_count')} tokens)"
              f"{' | PENSOU ' + str(st['thinking_chars']) + ' caracteres' if st.get('thinking_chars') else ''}")
        return gen, pre

    print(f"Modelo: {args.model} em {args.ollama_url}")
    try:
        print("Visão:", "sim" if c.has_vision() else "não")
    except A.OllamaError as e:
        print("✗", e)
        return 1
    tiny = {"type": "object", "required": ["ok"], "properties": {"ok": {"type": "string", "maxLength": 20}}}
    r1 = step("chamada mínima (JSON)", 'Responda em JSON: {"ok": "sim"}', tiny, 30)
    long_prompt = "Resuma em uma frase.\n" + "\n".join(f"[10:{i % 60:02d}] Ana: mensagem de teste número {i} sobre o churrasco" for i in range(120))
    sch = {"type": "object", "required": ["resumo"], "properties": {"resumo": {"type": "string", "maxLength": 120}}}
    r2 = step("prompt de ~2 mil tokens (como um evento)", long_prompt + '\nResponda em JSON: {"resumo": "..."}', sch, 80)
    print("\n— Leitura —")
    if not r1:
        print("A chamada mínima falhou: o problema é o modelo/servidor, não o pipeline.")
        return 1
    elif c.thinking_seen:
        print("O modelo 'pensa' mesmo com think=false. Isso multiplica o tempo. Tente: ollama pull qwen3-vl:8b-instruct "
              "(e --model qwen3-vl:8b-instruct) ou outro modelo sem 'thinking'.")
    if r1 and r2:
        per_event = 2000 / max(r2[1], 0.1) + 200 / max(r2[0], 0.1)
        print(f"Estimativa por evento/arquétipo: ~{per_event / 60:.1f} min. Fotos (visão) costumam ser várias vezes mais lentas.")
        if r2[0] < 3:
            print("Geração abaixo de 3 tok/s: considere um modelo menor (qwen3-vl:4b) e menos picos (--top-peaks 4).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
