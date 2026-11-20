# Backlog — implementações a fazer

Itens combinados e ainda não feitos. Ao implementar, mova para a doc do módulo e apague daqui.

## Entrada com biometria (APK)

Decidido em 20/11/2026: **sem tela de bloqueio**. A sessão continua persistida; a biometria só
substitui digitar a senha quando o login aparece (depois de logout ou sessão expirada).

- Primeiro login com e-mail e senha; depois uma pergunta única: "Usar biometria nas próximas vezes?".
- Credenciais guardadas só no Keystore do Android, protegidas pela biometria (nunca em `localStorage`).
- Tela de login mostra "Entrar com biometria" quando há credencial guardada; um toque faz `signInWithPassword`.
- Interruptor no Perfil, por aparelho (estilo `DevModeCard`); desligar apaga a credencial.
- Se a senha mudou e a credencial falha: apagar a credencial e voltar ao login normal.
- Só no APK (esconder no PWA/navegador). Plugin sugerido: `capacitor-native-biometric`.
- Exige **APK novo** (`deploy:android`); as telas sobem por OTA, mas o botão fica escondido até o APK novo.
- Estrutura: `biometricLogic.ts` (regras puras), `biometricService.ts` (plugin), plugin mockado em
  `src/test/setup.ts`, telas no `pages.smoke.test.tsx` + testes de comportamento.

## Conquistas e troféus entre os módulos (entram no Wrapped)

Ideia de 20/11/2026: selos calculados a partir dos dados que já existem em Bolão, Arena, Letreco,
Letroso, Sudoku, Word500, Fronteiras e Ranking de Campeões.

- Exemplos: "7 dias seguidos no Letreco", "placar exato no Bolão", "dobrou a banca na Arena".
- Selos aparecem no Perfil; o Wrapped ganha um capítulo (story) com as conquistas do ano.
- Regra de cada selo em `achievementsLogic.ts` (pura, testável); leitura dos dados em `achievementsService.ts`.
- Decidir na hora: calcular sob demanda a partir das tabelas ou gravar os selos numa tabela (migration em `supabase/`).

## Auditoria de segurança/performance — itens restantes

Ver tabela de status em `auditoria-seguranca-performance.md` (S-04, S-08, S-12, S-13, S-14, S-16,
P-02 a P-07, resto do P-09; S-02 só parcial).
