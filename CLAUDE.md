# Rolezinho — regras de implementação

App em React 19 + TypeScript + Vite + Supabase (PWA + APK Capacitor), UI em pt-BR.
Visão geral em `docs/estrutura-do-projeto.md`.

## Regras (valem para toda mudança)

1. **Toda mudança vem com teste.** Feature nova, correção de bug ou refatoração só termina com testes em `src/test/` cobrindo o comportamento. Bug corrigido ganha um teste que falhava antes.
2. **Não quebrar o que já existe.** Antes de concluir, rodar e deixar verde:
   - `npm test` (vitest run)
   - `npx tsc -b` e `npm run typecheck:test` (o `tsc -b` ignora `src/test`; o segundo checa testes e `api/`)
   - `npx eslint <arquivos alterados>`
   Se um teste antigo falhar por causa da mudança, a mudança está errada, a não ser que o comportamento tenha mudado de propósito (e então o teste é atualizado explicando o porquê).
3. **Mesma estrutura em todo módulo:** `src/features/<módulo>/` com `<Nome>Page.tsx` (tela), `<nome>Service.ts` (único lugar que fala com o Supabase), `<nome>Types.ts` e `<nome>Logic.ts` (regra pura, sem rede, fácil de testar).
4. **Telas não chamam o Supabase direto**; sempre via service.
5. **Regra de permissão fica no banco** (RLS / RPC `SECURITY DEFINER`), não só no cliente. `ADMIN_EMAILS` só esconde UI.
6. **Chaves de API não vão no cliente** quando der para evitar: use um proxy em `api/`.
7. **Banco versionado:** toda mudança de schema vira um `.sql` em `supabase/` (e é registrada como pendente até ser rodada).
8. Arquivos de tela passando de ~600 linhas devem ser quebrados em componentes/hooks ao serem mexidos.
9. Deploy: `npm run deploy:web`, depois commit e push na `main`. APK só para mudança nativa.

## Como testar

- Infra em `src/test/`: `setup.ts` (mocks globais), `supabaseMock.ts` (Supabase falso), `helpers.tsx` (`loginAs`, `renderWithProviders`).
- Dados do banco falso: `mockDb.tables.<tabela> = [...]`; retorno de RPC: `mockDb.rpcResults.<nome>`; escritas ficam em `mockDb.writes`; erro: `mockDb.errors.<tabela>`.
- Todo componente/tela novo entra em `src/test/pages.smoke.test.tsx` (monta sem quebrar) **e** ganha testes de comportamento (render com dados, interação, estado vazio/erro).
- Lógica pura (`*Logic.ts`, `utils`) é testada direto, sem render.
- Testes não podem depender de rede, relógio real nem de ordem entre arquivos.
