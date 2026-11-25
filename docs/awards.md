# Awards

Ferramenta para o grupo montar as categorias e os indicados de um awards e, depois, votar. Fica na Home (card ao lado do Wrapped) e em `/awards`. Código em `src/features/awards/`; banco em `supabase/awards_migration.sql` (**pendente: rodar no SQL Editor**).

## Fases (`awards_editions.phase`, trocada pelo admin em `/admin/awards`)
| Fase | O que acontece |
|---|---|
| `hidden` | Só o admin vê (prévia). Nasce assim. |
| `nominations` | Todos indicam categorias e nomes. |
| `voting` | Cédula aberta: 1 voto por categoria, editável até fechar. |
| `closed` | Resultado por categoria (vencedor + ranking). |

## Quem vê
`awards_editions.audience`: `all` (todos, padrão) ou `selected` (só quem o admin marcou em `/admin/awards`, tabela `awards_viewers`). Vale para a edição, categorias, indicados, indicar, votar e resultado, tudo no banco (`awards_can_view`). O admin sempre vê. Com `selected` e ninguém marcado, só o admin vê. Enquanto a fase for `hidden`, só o admin vê, qualquer que seja a audiência.

## Regras
- **Limites por pessoa** (impostos nas RPCs): 5 categorias por edição e 5 indicados por categoria. Admin isento. Apagar o próprio item libera a vaga. Constantes em `awardsTypes.ts`.
- Indicado = texto e/ou imagem (um dos dois é obrigatório). Imagem é comprimida no cliente (`src/lib/imageUpload.ts`, webp ≤ 1200 px) e vai para o bucket público `awards/<uid>/…`.
- Dono edita/apaga o que criou só na fase de indicação; admin sempre.
- Na cédula só entram categorias com 2 ou mais indicados.
- Ninguém vê quem votou em quem; a contagem (`award_results`) só sai para o admin ou depois de `closed`.

## Telas
- `AwardsPage` (`/awards`): grade de categorias + "Indicar nova categoria"; na votação, botão "Votar · x/y"; fechada, resultado.
- `AwardsCategoryPage` (`/awards/c/:id`): grade de indicados + "Indicar mais um".
- `AwardsBallotPage` (`/awards/votar`): cédula passo a passo (pontos de progresso, avanço automático opcional, revisão final).
- `AwardsAdminPage` (`/admin/awards`).

## Ideias futuras
- Revelação do resultado em stories (reaproveitando o motor do Wrapped).
- Aprovação prévia de sugestões, se a moderação a posteriori não bastar.
