# letroso-words.mjs

Lista a palavra do dia do Letroso (data → palavra) para qualquer intervalo de datas.

## Requisitos

- Node 18+ (sem dependências, não precisa de `npm install`)
- Rodar a partir da raiz do repositório

## Uso

```bash
node scripts/letroso-words.mjs [inicio] [fim]
```

| Argumento | Formato      | Padrão          |
|-----------|--------------|-----------------|
| `inicio`  | `YYYY-MM-DD` | hoje (America/Sao_Paulo) |
| `fim`     | `YYYY-MM-DD` | `inicio` + 30 dias |

### Exemplos

```bash
# hoje + 30 dias
node scripts/letroso-words.mjs

# um intervalo específico
node scripts/letroso-words.mjs 2026-10-23 2026-10-29

# um único dia
node scripts/letroso-words.mjs 2026-10-29 2026-10-29

# salvar em arquivo
node scripts/letroso-words.mjs 2026-01-01 2026-12-31 > palavras-2026.tsv
```

## Saída

Uma linha por dia, separada por TAB (`data<TAB>palavra`):

```
2026-10-27	TORRADA
2026-10-28	VIBRANTES
2026-10-29	DITADO
```

## Como funciona

Espelha `getLetrosoWordOfDay` em `src/features/letreco/letrosoLogic.ts`:

1. Lê `src/features/letreco/words_letroso.txt`, normaliza (sem acento, maiúsculas), remove duplicadas e mantém palavras de 3 a 10 letras.
2. Embaralha a lista com `mulberry32` e seed fixo `0x4f3a`.
3. A palavra do dia é a posição `diasDesdeEpoch % totalDePalavras` na ordem embaralhada.

## Limitações

- **Lista alterada:** se o `words_letroso.txt` mudou (palavras adicionadas ou removidas), o mapeamento muda e datas passadas deixam de bater com o que os jogadores viram. Para consultar datas antigas, rode o script com a versão antiga do arquivo (`git log -p src/features/letreco/words_letroso.txt`).
- **Lógica duplicada:** o script não importa `letrosoLogic.ts` (ele usa `?raw` do Vite). Se o algoritmo ou o seed mudarem no app, atualize o script também.
- **Modo prática:** usa `Math.random()` e não é reproduzível.

## Conferindo com o banco

As partidas ganhas ficam em `letroso_games`; o último palpite é a palavra do dia:

```sql
select game_date, guesses[array_length(guesses,1)] as palavra
from letroso_games
where status = 'won'
group by game_date, 2
order by game_date;
```
