# Estatísticas do chat (`/estatisticas`)

Lê a exportação do WhatsApp (mesma pasta `../wrapped-pipeline/raw_data`, mesmos `aliases.json` e `wrapped_config.json`),
calcula estatísticas detalhadas e gera `output/chat_stats.json` para o app. Python 3.10+, só biblioteca padrão.
Visão geral da IA/Ollama: `docs/wrapped-gerador-ia.md`.

```bash
cd scripts/chat-insights
python3 run_insights.py --input ../wrapped-pipeline/raw_data --no-ai      # só números: segundos, sem Ollama
python3 run_insights.py --input ../wrapped-pipeline/raw_data              # + assuntos (Ollama local)
python3 run_insights.py ... --mentiras   # opcional: também acha candidatos de mentira; depois: python3 review_mentiras.py
python3 run_insights.py --input ../wrapped-pipeline/raw_data --no-ai        # regenera o JSON já com os aprovados
python3 run_insights.py --input ../wrapped-pipeline/raw_data --upload --active   # grava no Supabase
```

## O que sai

- **Sem IA** (`insights.py`): atividade por hora/dia/mês, maior sequência de dias, conversas (silêncio > 3 h separa),
  quem inicia e quem encerra, tempo mediano de resposta, quem responde a quem, taxa de perguntas, textão, risadas,
  corujas, mídia, bordões (trechos de 3 palavras que se repetem) e palavras do ano.
- **Mentiras confirmadas** (opcional, `--mentiras`; `mentiras.py` + `review_mentiras.py`): casos em que alguém afirma algo, outra pessoa contesta
  ("mentira!") e o próprio chat confirma (a pessoa admitiu, ou foi provado falso). **Não detecta mentira**: a pesquisa
  (`docs/pesquisa-deteccao-mentira-chat.md`) mostra que não é confiável. Fluxo: (1) o código separa trechos com palavras-gatilho;
  (2) o Ollama só extrai quem afirmou/contestou e como terminou; (3) o código confere que as 3 frases são cópias literais, na
  ordem certa e de autores coerentes (senão descarta); (4) **você aprova cada caso** em `python3 review_mentiras.py` (s/n/p/q).
  Só os aprovados vão para o app, com as 3 frases e a data. Aprovações ficam em `raw_data/mentiras_aprovadas.json` (git ignora)
  e valem nas próximas rodadas, mesmo com `--no-ai`. **No chat testado (nov/2026) rendeu 0 casos** (10 trechos com sinal de
  admissão: 7 disputas, todas piada/sem resolução): "mentira!" no grupo é espanto, não acusação. Por isso é opt-in e a seção some do app
  quando não há caso aprovado. O log mostra o funil e o motivo de cada descarte.
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
- No app é um card normal em "✨ Outros" na Home, mas só abre o conteúdo para quem estiver na lista (RLS); os demais veem estado vazio.

## Privacidade

O JSON tem números por pessoa, rótulos de assunto, bordões e **as frases literais dos casos de mentira que você aprovou** (com telefone/e-mail mascarados). Mesmo assim é conversa privada:
`output/` fica no `.gitignore` e o acesso é controlado no banco. Migration: `supabase/chat_stats_migration.sql` (**pendente**).

## Testes

```bash
python3 -m unittest discover -s tests -t .        # 80 testes (cliente de IA falso, sem rede)
UPDATE_FIXTURE=1 python3 -m unittest discover -s tests -t .   # regera tests/fixtures/expected_no_ai.json
```

O fixture é validado pelo app em `src/test/chatStatsPipelineOutput.test.ts` (contrato Python ↔ frontend).
