#!/usr/bin/env python3
"""
Popula a tabela letroso_dictionary no Supabase a partir do dictionary_new.txt.

Uso:
  SUPABASE_URL=https://epqtcrpdeikjhdqzdxox.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<anon_ou_service_key> \
  python3 scripts/seed_letroso_dictionary.py

Usa a RPC seed_letroso_dictionary (SECURITY DEFINER), então funciona com anon key.
Após a seed, rode no SQL editor: DROP FUNCTION seed_letroso_dictionary(text[]);
"""

import os
import sys
import unicodedata
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
API_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DICT_PATH = os.path.join(os.path.dirname(__file__), "..", "dictionary_new.txt")
BATCH_SIZE = 2000


def normalize(w: str) -> str:
    w = unicodedata.normalize("NFD", w)
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    w = w.upper()
    w = "".join(c for c in w if c.isalpha() and c.isascii())
    return w


def main():
    if not SUPABASE_URL or not API_KEY:
        print("Erro: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    print("Lendo e normalizando dicionário...")
    seen: set[str] = set()
    words: list[str] = []
    with open(DICT_PATH, encoding="utf-8", errors="ignore") as f:
        for line in f:
            w = normalize(line.strip())
            if 3 <= len(w) <= 10 and w not in seen:
                seen.add(w)
                words.append(w)

    print(f"Total de palavras únicas (3-10 letras): {len(words):,}")

    headers = {
        "apikey": API_KEY,
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    rpc_endpoint = f"{SUPABASE_URL}/rest/v1/rpc/seed_letroso_dictionary"

    total = len(words)
    for i in range(0, total, BATCH_SIZE):
        batch = words[i : i + BATCH_SIZE]
        r = requests.post(rpc_endpoint, headers=headers, json={"p_words": batch}, timeout=30)
        if r.status_code not in (200, 204):
            print(f"\nErro no batch {i}: {r.status_code} — {r.text[:300]}")
            sys.exit(1)
        pct = min(100, round((i + len(batch)) / total * 100))
        print(f"  {i + len(batch):,}/{total:,} ({pct}%)", end="\r")

    print(f"\nConcluído! {total:,} palavras inseridas.")
    print("\nNão esqueça de rodar no SQL editor do Supabase:")
    print("  DROP FUNCTION seed_letroso_dictionary(text[]);")


if __name__ == "__main__":
    main()
