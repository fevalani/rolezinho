# Wrapped do grupo — pipeline local e offline

Lê a exportação do grupo (WhatsApp/Telegram), calcula as estatísticas em Python puro, escolhe os
picos de conversa e as fotos mais engajadas e usa um modelo **local** (Ollama) para resumir eventos,
caçar pérolas, criar arquétipos e legendar fotos. A saída é um `wrapped_output.json` no schema do
Wrapped do app.

- **Sem dependências:** só a biblioteca padrão do Python 3.10+ (`requirements.txt` está vazio de propósito).
- **Sem internet:** a única chamada de rede é HTTP para o Ollama em `localhost`. O cliente **recusa**
  qualquer outro host (`--ollama-url http://outro-host` dá erro).

## ⚠️ Privacidade — leia antes

| O quê | Onde fica | Git |
| --- | --- | --- |
| Conversas, áudios, fotos brutas | `scripts/wrapped-pipeline/raw_data/` | **ignorado** |
| `wrapped_output.json` (tem trechos de conversa) | `scripts/wrapped-pipeline/output/` | **ignorado** |
| Fotos curadas | `public/wrapped/<ano>/media/` | **ignorado** |

**Atenção com as fotos curadas:** tudo que está em `public/` é servido **sem login** na web
depois do `deploy:web`. Quem tiver a URL vê a foto. As fotos são privadas do grupo, então só faça o
deploy se o grupo topar; a alternativa é rodar com `--no-copy-media` e não ter slides de foto. Revise
também os textos (resumos, pérolas, arquétipos) antes de publicar: a IA pode errar e o conteúdo é
conversa privada. As pérolas são conferidas por código (só entram frases literais do trecho), mas o
humor dos resumos e dos arquétipos é com você.

## 1. Instalar o Ollama e o modelo

Instale o Ollama (https://ollama.com) e baixe o modelo **uma vez, com internet**; depois disso tudo
roda offline.

```bash
ollama pull qwen3-vl:8b-instruct   # padrão do pipeline (testado: ~15 tok/s numa CPU Ryzen 5)
# NÃO use qwen3-vl:8b (sem "-instruct"): ele "pensa" e ignora think=false, ficando muito lento / com resposta vazia
ollama serve                  # se ainda não estiver rodando
```

Modelo **sem visão** também funciona: o pipeline detecta (`/api/show`) e pula a análise de fotos,
usando legenda genérica. Dá para forçar com `--no-vision`.

Para trabalhar 100% desconectado, depois do `ollama pull` o modelo fica em `~/.ollama/models`;
para levar a outra máquina, copie essa pasta.

## 2. Colocar os dados

1. WhatsApp → grupo → **Exportar conversa → Incluir mídia** (sem mídia não há fotos nem áudios para contar).
2. Solte o `.zip` em `scripts/wrapped-pipeline/raw_data/`. O zip é extraído em `raw_data/_extracted/`
   (com proteção contra caminhos maliciosos). Também vale uma pasta já extraída, com o `_chat.txt`.
3. Telegram: exporte em JSON e solte a pasta com o `result.json` (e as fotos) em `raw_data/`.
4. **Vários grupos (comunidade):** exporte cada grupo e solte todos os `.zip` na mesma pasta. O WhatsApp
   não tem exportação em lote. O pipeline une tudo, guarda de qual grupo veio cada mensagem
   (nome do zip), analisa os picos de cada grupo separadamente e indexa as fotos por grupo
   (o mesmo `IMG-20260312-WA0001.jpg` pode existir em vários grupos). Os rankings somam a comunidade
   inteira e aparece um ranking "Os Grupos Mais Agitados". Se alguém tem nomes diferentes em grupos
   diferentes (contato salvo vs. nome do perfil), junte no `aliases.json`.
5. **De-para chat → app (recomendado antes da 1ª rodada):** o chat mostra apelidos, "Você" e números de
   telefone; o app tem os nomes dos perfis. Gere a lista do app e responda ao assistente:

   ```sql
   -- Supabase → SQL Editor (um nome por linha; copie o resultado para raw_data/app_names.txt)
   select display_name from profiles order by display_name;
   ```

   ```bash
   python3 map_authors.py --input ./raw_data --app-names ./raw_data/app_names.txt --year 2026            # relatório
   python3 map_authors.py --input ./raw_data --app-names ./raw_data/app_names.txt --year 2026 --interactive  # pergunta e grava
   ```

   Para cada autor ainda sem par, ele mostra o nº de mensagens, os grupos, o período e algumas falas de exemplo
   (para você reconhecer quem é), sugere nomes do app por semelhança (*Gui* → *Guilherme Oliveira*) e você escolhe
   pelo número, digita um nome, dá Enter para pular ou `q` para salvar e sair. O resultado vai para
   `raw_data/aliases.json` (telefone aparece mascarado na tela; a chave gravada é o número inteiro, e o arquivo
   fica no `raw_data/`, que o git ignora). Com isso os rankings do Wrapped saem com os nomes do app.
6. `raw_data/aliases.json` também pode ser escrito à mão, para unir quem trocou de nome ou aparece com número:

```json
{ "Ana": ["Ana Souza", "+55 11 91234-5678", "aninha"], "Beto": ["Beto antigo"] }
```

Formatos aceitos: Android (`12/03/2026 14:32 - Nome: texto`) e iOS (`[12/03/2026 14:32:05] Nome: texto`),
mensagens multilinhas, avisos do sistema ignorados, mídia (`IMG-`, `PTT-`, `STK-`, `VID-`, `<anexo: …>`,
`<Mídia oculta>`). A data é lida como dia/mês; se o arquivo for mês/dia, o pipeline detecta sozinho ou use `--date-order mdy`.

## 3. Rodar

```bash
cd scripts/wrapped-pipeline

# teste rápido, sem IA (parser, estatísticas, picos, seleção e cópia de fotos)
python3 build_wrapped.py --input ./raw_data --year 2026 --dry-run

# completo
python3 build_wrapped.py --input ./raw_data --year 2026 --model qwen3-vl:8b-instruct
```

Saída: `output/wrapped_output.json` e as fotos em `public/wrapped/2026/media/foto-01.jpg…`.

Opções úteis: `--slug`, `--title`, `--subtitle`, `--aliases`, `--top-peaks 15`, `--peak-window 60`
(minutos), `--top-photos 30`, `--events 6`, `--pearls 6`, `--archetypes 6`, `--photo-slides 12`,
`--no-copy-media`, `--no-vision`, `--out`, `--media-dest`. Cada chamada ao modelo valida o JSON
(Structured Outputs do Ollama, com retry se vier inválido).

## 4. Levar para o app

1. Abra `/wrapped-admin` (só admin), cole o conteúdo de `wrapped_output.json`, ajuste o que quiser
   (por exemplo `startsAt`/`endsAt`, `isActive: true`) e clique em **Validar e salvar**.
2. O editor mostra avisos para slides descartados. Só existe o Wrapped comum (do grupo, sem versão por pessoa);
   misture com os automáticos (`auto_user_stats`) se quiser.
3. Fotos: `npm run deploy:web` publica `public/wrapped/` (ver o aviso de privacidade acima).

## Fotos do Google Fotos (Takeout) — opcional

As fotos ilustram o **momento**, não as pessoas: a foto tirada perto de cada pico de conversa vira a imagem
daquele evento, e algumas viram slides de piada. As fotos **ficam só no seu PC**: tudo é analisado
localmente, e **só as poucas escolhidas** (no máx. `max_published`, padrão 8) são copiadas para
`public/wrapped/<ano>/media/`, **sem GPS nem EXIF** (só a orientação é mantida). O resto nunca sai de
`raw_photos/`.

1. Crie um álbum no Google Fotos com as fotos do ano e baixe (⋮ → *Fazer download de tudo*, ou
   takeout.google.com → só *Google Fotos* → o álbum). Álbuns compartilhados em que as fotos são de outras
   pessoas **não entram** no Takeout. Solte o(s) `.zip` em `scripts/wrapped-pipeline/raw_photos/`.
2. Rode com `--takeout ./raw_photos` (ou ponha `takeout.path` no `wrapped_config.json`). O período vem de
   `--year` / `period` — fotos de outros anos são descartadas.

Como a escolha funciona (precisa do Ollama, não é feita no `--dry-run`):

- **Candidatas:** as maiores fotos tiradas até ±2 h de cada pico (`moment_margin_hours`), mais algumas
  espalhadas pelo ano (`extra_candidates`), no máx. `max_analyzed` fotos analisadas.
- **Análise:** o modelo dá legenda, nota de graça (1–10), tema e marca fotos **sensíveis** (nudez, documentos,
  telas com dados, crianças, constrangedoras), que **nunca** são usadas. Ele **não reconhece rostos**.
- **Uso:** cada evento ganha a foto mais engraçada tirada perto dele (sem repetir); as demais com nota ≥ 6 viram
  slides de piada. O limite `max_published` vale para tudo.
- **Sem IA (`--dry-run`):** só diz quantas fotos entraram no período e quantas são candidatas — nada é copiado.

**Opcional — foto do vencedor:** com `people_groups` no config (membro do chat → nomes dos rostos no Google
Fotos, que precisam estar nomeados lá, ou álbuns só dessa pessoa), o 1º lugar de cada ranking também ganha uma
foto dele. Sem esse bloco, esse recurso simplesmente não é usado.

`"publish": false` no config analisa e gera só as legendas, sem copiar nenhuma imagem. Cada execução apaga
as fotos geradas antes (`foto-/ilustra-/piada-NN`) e nada além delas. As fotos do WhatsApp (`foto-NN`) são
separadas; use `--photo-slides 0` para não publicar nenhuma.

## Config da IA (`wrapped_config.json`)

Modelo, URL do Ollama, período e regras das fotos ficam num arquivo só (exemplo em
`wrapped_config.example.json`, o real é ignorado pelo git porque tem nomes de pessoas). As flags da
linha de comando (`--model`, `--year`, `--takeout`…) têm prioridade sobre o arquivo.

## Está lento ou travou?

```bash
python check_ollama.py --model qwen3-vl:8b-instruct     # 1–3 min: mede tokens/s, vê se o modelo "pensa" e estima o tempo
```

- O pipeline mostra um ponto a cada 25 trechos gerados e `ok em Ns · X tokens/s` por chamada.
  Se a chamada fica sem nenhum ponto por muito tempo, o modelo está só lendo o prompt (CPU) ou travado.
- `--timeout N` é o tempo **parado** sem receber nada (padrão 900 s), não o tempo total da resposta.
- Se aparecer `! o modelo ainda 'pensa'`, o modelo ignora `think=false` e fica muito mais lento:
  troque por uma variante sem "thinking" (ex.: `qwen3-vl:8b-instruct`, confira o nome no Ollama).
- Respostas são limitadas (`num_predict`) para o modo JSON não gerar sem parar.
- Em CPU, foto (visão) é o passo mais lento. Rode antes só o texto com `--no-takeout` e deixe as fotos para depois,
  com `max_analyzed` pequeno no config.

## O que a pipeline gera

Abertura, total de mensagens, **Palestrinhas** (mais mensagens), **Reis do Textão** (maior média de
caracteres, mín. 20 mensagens), **Fantasmas** (menos mensagens), **Corujas** (1h–5h), dia/hora mais
movimentados, áudios, figurinhas, fotos, palavras do ano (sem stopwords), emoji assinatura (o de maior
frequência *e* exclusividade), **quem faz rir** (risadas dos outros nas até 5 mensagens/2 min seguintes),
os eventos dos picos, pérolas literais, arquétipos e as fotos mais engajadas (respostas de outras
pessoas em 10 min; o horário usado é o da mensagem do chat que cita a foto).

## Limites conhecidos

- O WhatsApp não exporta reações; "engajamento" é contagem de mensagens depois do envio.
- Fotos HEIC e muito grandes (> 8 MB) não vão para o modelo.
- Zero PII no schema do app: o JSON usa nomes como aparecem no chat. Use `aliases.json` para trocar por apelidos.

## Testes

```bash
python3 -m unittest discover -s tests -t .      # 92 testes, usa um Ollama de mentira em localhost
UPDATE_FIXTURE=1 python3 -m unittest discover -s tests -t .   # regera os JSONs de exemplo (dados sintéticos)
```

Os JSONs em `tests/fixtures/` (chat sintético) também são validados pelo frontend em
`src/test/wrappedPipelineOutput.test.ts`.
