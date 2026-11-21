# Estatísticas do chat (`/estatisticas`)

Lê a exportação do WhatsApp (mesma pasta `../wrapped-pipeline/raw_data`, mesmos `aliases.json` e `wrapped_config.json`),
calcula estatísticas detalhadas e gera `output/chat_stats.json` para o app. Python 3.10+, só biblioteca padrão.
Visão geral da IA/Ollama: `docs/wrapped-gerador-ia.md`.

```bash
cd scripts/chat-insights
python3 run_insights.py --input ../wrapped-pipeline/raw_data --no-ai      # só números: segundos, sem Ollama
python3 run_insights.py --input ../wrapped-pipeline/raw_data              # + assuntos (Ollama local)
python3 run_insights.py --input ../wrapped-pipeline/raw_data --upload --active   # grava no Supabase
```

## O que sai

- **Sem IA** (`insights.py`): atividade por hora/dia/mês, maior sequência de dias, conversas (silêncio > 3 h separa),
  quem inicia e quem encerra, tempo mediano de resposta, quem responde a quem, taxa de perguntas, textão, risadas,
  corujas, mídia, bordões (trechos de 3 palavras que se repetem) e palavras do ano.
- **Com IA** (`topics.py`): cada conversa grande ganha uma categoria de uma lista fixa + rótulo curto; o código soma por
  categoria, mês e pessoa. A IA nunca conta nada.

Pouco dado vira `null` (mediana exige 20 respostas; taxas exigem 20 mensagens): nada é inventado.

## Uso contínuo

O WhatsApp não tem API: exporte o chat de tempos em tempos e solte o `.zip` em `raw_data/`. A cada rodada as
estatísticas são recalculadas (rápido) e a IA só rotula conversas novas (cache em `output/.ai_cache`).
Dá para agendar (cron / Agendador de Tarefas).

## Subir para o app

- `--upload` precisa de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **no ambiente** (nunca no repositório).
- Ou cole o JSON em `/admin/estatisticas`. Lá você escolhe **quem vê** (tabela `chat_stats_viewers`, regra na RLS).
- No app só aparece com o **modo desenvolvedor** ligado e para quem estiver na lista.

## Privacidade

O JSON tem números por pessoa, rótulos de assunto e bordões — nenhuma mensagem completa. Mesmo assim é conversa privada:
`output/` fica no `.gitignore` e o acesso é controlado no banco. Migration: `supabase/chat_stats_migration.sql` (**pendente**).

## Testes

```bash
python3 -m unittest discover -s tests -t .        # 32 testes (cliente de IA falso, sem rede)
UPDATE_FIXTURE=1 python3 -m unittest discover -s tests -t .   # regera tests/fixtures/expected_no_ai.json
```

O fixture é validado pelo app em `src/test/chatStatsPipelineOutput.test.ts` (contrato Python ↔ frontend).
