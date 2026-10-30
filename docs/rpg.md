# Recurso de RPG — Guia de funcionamento

Mesas, fichas D&D 5.5e e sessões ao vivo. Este guia descreve o estado atual do código para quem for editá-lo (inclusive via prompt).

## 1. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `src/features/rpg/rpgTypes.ts` | Interfaces TS, constantes D&D em PT-BR (raças, classes, perícias, alinhamentos) e `getModifier`/`formatModifier` |
| `src/features/rpg/rpgService.ts` | Todas as chamadas ao Supabase e as assinaturas realtime, sem hooks nem cache |
| `src/features/rpg/RpgHomePage.tsx` | `/rpg`: lista de mesas e fichas, modais de criar mesa, entrar por código e criar ficha |
| `src/features/rpg/RpgTablePage.tsx` | `/rpg/mesa/:tableId`: tela da mesa com abas Feed, Dado e Aventura |
| `src/features/rpg/RpgSheetView.tsx` | Ficha com 5 abas. Exporta `RpgSheetView` (reusável) e `RpgSheetPage` (rota `/rpg/ficha/:sheetId`) |
| `supabase/rpg_schema.sql` | Tabelas, RLS, realtime e 2 RPCs. Único SQL do recurso, sem migrations incrementais |

Pontos de contato:
- `src/App.tsx`: 3 rotas dentro de `ProtectedRoute` e `AppShell`.
- `src/lib/types.ts`: card "RPG" na Home (`enabled: true`) e `DICE_TYPES`/`DICE_CONFIG` reaproveitados da feature de dados.
- `src/styles/global.css`: classe `.input-field`, usada só na ficha.

## 2. Modelo de dados

- **`rpg_tables`**: mesa, com `master_id`, `invite_code` (6 caracteres gerados no banco), `is_active` (sessão em andamento) e `session_count`.
- **`rpg_table_members`**: (mesa, usuário), com `total_sessions` e `total_minutes`. O mestre também entra como membro (feito em `createTable`).
- **`rpg_sheets`**: ficha. Colunas escalares para identidade, atributos e HP; JSONB para o resto:
  - `saving_throws`: `{strength: bool, ...}`
  - `skill_proficiencies` / `skill_expertise`: `{"Atletismo": bool}`
  - `equipment`: `EquipmentEntry[]`
  - `currency`: `{cp, sp, ep, gp, pp}`
  - `spells`: `{cantrips, level1..level9: [{name, prepared}]}`
  - `spell_slots`: `{level1..level9: {max, used}}` (sem truques)
  - `attacks`: `AttackEntry[]`
  - `features`: `FeatureEntry[]`
- **`rpg_sheet_table_link`**: ficha ligada a uma mesa. `UNIQUE(table_id, user_id)`: uma ficha por jogador por mesa.
- **`rpg_feed_posts`**: posts do mestre (texto ou imagem). Os tipos `video` e `system` existem, mas nada os usa.
- **`rpg_table_rolls`**: rolagens (`dice_type`, `results[]`, `total`, `is_master`).
- **`rpg_library_entries`**: título e conteúdo livres, editáveis pelo mestre, com `sort_order`.
- **`rpg_sessions`**: histórico de sessões (início, fim e duração).
- **RPCs**: `increment_member_stats` e `increment_table_session_count` (`SECURITY DEFINER`).

Campo novo na ficha exige três mudanças em sincronia: coluna no SQL (um `ALTER TABLE` novo, pois não há migration), `RpgSheet` em `rpgTypes.ts` e a UI da aba correspondente.

## 3. Fluxos

### Home
- Carrega mesas e fichas em paralelo.
- `fetchMyTables` faz duas queries (mesas onde sou mestre e onde sou membro) e deduplica por id.
- "Entrar" procura a mesa pelo código e insere o membro. O erro `23505` (já é membro) vira "Você já está nessa Mesa!" e a tela navega mesmo assim.
- Excluir ficha usa `confirm()` nativo e só existe aqui.

### Mesa (`RpgTablePage`)
- `load()` busca a mesa com até 3 tentativas e 600ms de espera (atraso de RLS logo após criar). Depois busca em paralelo membros, feed, biblioteca, fichas da mesa, meu vínculo e minhas fichas.
- **Feed**:
  - Mostra posts e rolagens ao vivo, ordenados por data.
  - Só o mestre vê o compositor (texto e uma imagem). A imagem vai para o bucket `public-assets`, em `rpg-feed/{tableId}/{timestamp}.{ext}`.
  - Editar e excluir aparecem só para o autor do post.
  - O botão flutuante ⚙️ (`MasterSessionButton`) aparece só para o mestre e só nesta aba: iniciar/pausar sessão e descansos curto/longo.
- **Dado**:
  - Escolha de dado e quantidade (1 a 10).
  - A rolagem é gerada no cliente com `Math.random` e gravada no banco.
  - O botão fica desabilitado se `!table.is_active`, para todos, inclusive o mestre.
  - Rolagem do mestre grava `is_master = true` (secreta).
- **Aventura**, com 3 sub-seções:
  - **Personagens**: o não-mestre vincula uma ficha existente e a abre em modo editável. Abaixo, lista de aventureiros com ficha resumida, sessões e horas.
  - **Biblioteca**: CRUD para o mestre, leitura para os demais.
  - **Mestre** (só mestre): iniciar/pausar sessão, descansos e transferir mestragem.

### Sessão
- `startSession`: `is_active = true` e insere linha em `rpg_sessions`.
- `pauseSession`: `is_active = false`, fecha a sessão aberta calculando os minutos e chama as duas RPCs de contadores.

### Descansos (`applyRest`)
- **Curto**: cada ficha vinculada recupera `max(1 + modCON, 1)` de HP e 1 dado de vida. Não considera o tipo do dado.
- **Longo**: HP vai ao máximo, recupera `max(floor(level/2), 1)` dados de vida e zera os `used` dos espaços de magia.

### Ficha (`RpgSheetView`)
- Props: `sheetId`, `onBack`, `readonly`. Só edita se for o dono e `!readonly`.
- Estado local (`sheet`) com botão "Salvar" visível quando `dirty`. Não há autosave. O `save` envia o objeto inteiro para `updateSheet`.
- Abas: Principal, Combate, Magia, Inventário e Traços, cada uma um componente no mesmo arquivo.
- Cálculos feitos na UI:
  - Modificador: `floor((x-10)/2)`.
  - Salvaguardas: mod + bônus de proficiência se marcada.
  - Perícias: clique cicla nada → proficiente → expertise → nada (expertise dobra o bônus).
  - Dados de vida disponíveis: `level - hit_dice_used`.
  - Iniciativa: se for `0`, exibe o mod de DES.
- Componentes de edição no fim do arquivo: `EditableText`, `EditableNumber`, `SelectOrText`, `StatBox`, `Field`, `SectionTitle`, `AbilityBlock`.
- Listas (ataques, habilidades, magias, itens) usam o padrão "+ Adicionar" com formulário inline.

## 4. Permissões (RLS)

- **Mesas**: membros e mestre veem; só o mestre atualiza/exclui.
- **Fichas**: o dono faz tudo; membros de uma mesa onde a ficha está vinculada só leem.
- **Feed e biblioteca**: membros leem. Escrita do feed por `author_id = auth.uid()`; da biblioteca por "é mestre da mesa".
- **Rolagens**: qualquer membro insere e vê as não-secretas, além das próprias secretas.

A UI restringe mais que o banco (ex.: só o mestre vê o compositor, mas a policy aceitaria insert de qualquer autor).

## 5. Realtime

- `feed:{id}`: INSERT e DELETE em `rpg_feed_posts`.
- `rolls:{id}`: INSERT em `rpg_table_rolls`. Descarta `is_master`, busca o perfil, mantém até 20 itens e remove cada um após 60s por `setTimeout` no cliente.

A "efemeridade" das rolagens é só visual: as linhas nunca são apagadas do banco.

## 6. Problemas conhecidos

1. **Descanso do mestre provavelmente não afeta fichas de outros.** `applyRest` faz `update` em fichas de terceiros, mas a policy de escrita de `rpg_sheets` é só `user_id = auth.uid()`. O Supabase não dá erro, só atualiza 0 linhas. Falta RPC `SECURITY DEFINER` ou policy para o mestre.
2. **Jogadores não veem a sessão iniciar/pausar sem recarregar.** `rpg_tables` está na publication de realtime, mas nenhum cliente a assina.
3. **Os botões de sessão da aba "Mestre" não atualizam a tela.** Só o botão flutuante refaz `fetchTableById`.
4. **Editar posts não aparece ao vivo** para os outros (sem assinatura de UPDATE).
5. **Rolagens secretas do mestre ficam invisíveis até para ele**, e o rótulo "Xdn" do resultado usa a quantidade atual do seletor, não a da rolagem feita.
6. **`proficiency_bonus` não tem UI e não deriva do nível.** Fica em 2 salvo edição no banco.
7. **CD e ataque de magia são digitados à mão.**
8. **Unidades inconsistentes**: velocidade com default 30 (pés) exibida como "m"; peso em kg.
9. **Ficha, casos de borda**:
   - Sem autosave: sair com alterações pendentes perde tudo.
   - O `save` sobrescreve a ficha inteira (último a salvar ganha).
   - `max_hp = 0` gera NaN na barra de HP.
   - Itens de lista usam índice como `key`.
   - HP temporário nunca absorve dano.
10. **Ficha de outros jogadores não é clicável.** A prop `readonly` existe e a RLS permite leitura, mas a UI só mostra resumo.
11. **Mestre não pode vincular ficha** (bloco "Minha Ficha" é `!isMaster`). Não existe desvincular nem trocar a ficha depois de vinculada.
12. **Possível recursão de RLS no schema do repo.** `rpg_table_members` consulta a si mesma em uma policy, e `rpg_tables` e `rpg_table_members` se referenciam. O banco real pode diferir deste arquivo.
13. **Entrar por código pode falhar com o schema do repo.** `joinTableByCode` lê `rpg_tables` antes de ser membro, mas o SELECT só vale para membros e mestre.
14. **O bucket `public-assets` não é criado em nenhum SQL do repo.** Se faltar, o upload de imagem falha em silêncio.
15. **Transferir mestragem**: posts antigos continuam editáveis só pelo mestre anterior (checagem por `author_id`).

## 7. Convenções para editar

- **Stack**: React, TypeScript, React Router, Tailwind v4 com valores arbitrários (`text-(--gold)`, `bg-[var(--bg-card)]`) e Supabase (`@/lib/supabase`). Imports com alias `@/`.
- **Visual**: tema dourado (`--gold`, `--bg-card`, `--bg-elevated`, `--bg-deep`, `--text-muted`, `--red`, `--green`, `--blue`). Títulos com `fontFamily: var(--font-display)`. Mobile-first: `calc(100dvh - 56px)` de altura útil, `var(--safe-bottom)` no rodapé, modais como bottom sheets.
- **Textos**: tudo em PT-BR.
- **Dados**: o serviço devolve dados crus. Perfis são buscados em segunda query e mesclados à mão (`profileMap`). Erros quase sempre só vão para `console.error`, sem toast.
- **Estado**: `useState`/`useEffect` locais, sem biblioteca de estado.
- **Verificação**: não há testes do RPG. Rode `npm run lint` e `npm run build`. Mudanças de schema precisam ser aplicadas manualmente no Supabase.

## 8. Esqueleto de prompt

```
Contexto: app React + TS + Supabase (rolezinho). O recurso de RPG está em
src/features/rpg/ (RpgHomePage, RpgTablePage, RpgSheetView, rpgService,
rpgTypes) e supabase/rpg_schema.sql. Leia esses arquivos e docs/rpg.md
antes de editar.

Objetivo: <o que mudar, em 1-2 frases>

Regras:
- Textos em PT-BR; Tailwind v4 com as variáveis CSS do tema dourado, igual ao código vizinho.
- Chamadas ao Supabase só em rpgService.ts; tipos em rpgTypes.ts.
- Campo novo na ficha: ALTER TABLE em SQL novo (não edite o rpg_schema.sql original), atualizar RpgSheet e a UI da aba correspondente.
- Permissões: RLS de rpg_sheets só deixa o dono escrever; ações do mestre sobre fichas de outros exigem RPC SECURITY DEFINER.
- Não mudar o fluxo de salvar da ficha (estado local + botão Salvar) a menos que o pedido seja esse.
- Ao final: npm run lint && npm run build.

Atenção a problemas conhecidos (seção 6 de docs/rpg.md): <liste os que tocam o pedido>
```
