# Awards

Ferramenta para o grupo montar as categorias e os indicados de um awards e, depois, votar. Fica na Home (card ao lado do Wrapped) e em `/awards`. Código em `src/features/awards/`; banco em `supabase/awards_migration.sql` (já rodada em produção; idempotente, não apaga dados).

## Fases (`awards_editions.phase`, trocada por um admin do awards)
| Fase | O que acontece |
|---|---|
| `hidden` | Só admins veem (prévia). Nasce assim. |
| `nominations` | Cada pessoa indica as próprias categorias e os nomes delas. |
| `voting` | Cédula com as categorias **aprovadas**: 1 voto por categoria, editável até fechar. |
| `closed` | Resultado só para admins do awards; o grupo vê o aviso de que sai no Wrapped. |

## Papéis
| Papel | Quem é | Pode |
|---|---|---|
| Admin do app | `app_admins` | Tudo; é o único que cria/apaga edição e monta a lista de admins do awards |
| Admin do awards | admin do app ou `awards_admins` (por edição) | Ver tudo, aprovar, editar/apagar qualquer item, trocar fase, escolher quem vê, ver o resultado; sem limites |
| Pessoa que vê | `audience = 'all'`, ou listada em `awards_viewers` | Indicar nas próprias categorias e votar |

Admin do awards gerencia pela engrenagem em `/awards` (`/awards/gerenciar`); o admin do app também tem `/admin/awards`.

## Quem vê a edição
`awards_editions.audience`: `all` (todos, padrão) ou `selected` (só quem está em `awards_viewers`). Vale no banco (`awards_can_view`). Admins do awards sempre veem. Com a fase `hidden`, só admins, qualquer que seja a audiência.

## O que cada um vê
- Pessoa comum: só as categorias que **ela criou**, com todos os indicados delas, inclusive os que outras pessoas indicaram antes desta regra. Quem indicou numa categoria alheia deixa de ver a categoria e a indicação (nada é apagado).
- Na votação, as categorias aprovadas (com todos os indicados) aparecem para todos que veem a edição, **só na cédula**; a grade continua mostrando as próprias.
- Admin do awards: todas, com as abas **Todas** e **Aprovadas** (e **Resultado** quando encerrada).

## Regras (impostas por RLS/RPC; a tela só reflete)
- **Limites por pessoa:** 5 categorias por edição e 10 indicados por categoria. Contam só os itens que a própria pessoa criou. Admin do awards isento. Apagar libera a vaga. Constantes em `awardsTypes.ts`.
- **Dono da categoria**, na fase de indicação: adiciona, edita e apaga qualquer indicado dela; renomeia/apaga a categoria **enquanto não aprovada**. Ninguém indica em categoria alheia (exceto admin).
- **Aprovação** (`set_award_category_approval`): só admin do awards, reversível. Só aprovada recebe voto; na cédula entram as aprovadas com 2 ou mais indicados.
- O app só atualiza direto as colunas de conteúdo (`title`, `description`, `image_url`, `position`, `label`); dono e aprovação não são graváveis por `update`.
- Indicado = texto e/ou imagem. Imagem comprimida no cliente (`src/lib/imageUpload.ts`, webp ≤ 1200 px), bucket público `awards/<uid>/…`.
- Ninguém vê quem votou em quem; a contagem (`award_results`) só sai para admins do awards.

## Telas
- `AwardsPage` (`/awards`): grade de categorias + "Indicar nova categoria"; na votação, botão "Votar · x/y"; abas e botões de aprovação para admins.
- `AwardsCategoryPage` (`/awards/c/:id`): grade de indicados + "Indicar mais um"; aprovar (admins).
- `AwardsBallotPage` (`/awards/votar`): cédula passo a passo (pontos de progresso, avanço automático opcional, revisão final).
- `AwardsManagePage` (`/awards/gerenciar`) e `AwardsAdminPage` (`/admin/awards`), ambas com `AwardsEditionPanel`.

## Ideias futuras
- Resultado no Wrapped quando for liberado (ver `backlog.md`).
