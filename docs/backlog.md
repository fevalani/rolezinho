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

## Resultado do Awards no Wrapped

Decidido em 25/11/2026: o resultado do Awards hoje só aparece para os admins do awards. Falta levar os
vencedores ao Wrapped, visíveis só no dia em que o admin liberar.

- Liberação explícita (ex.: botão no painel do awards), imposta no banco: `award_results` (ou uma RPC própria)
  passa a responder a quem vê a edição só depois de liberada.
- Só categorias aprovadas; nunca expor quem votou em quem.

## Conquistas e troféus entre os módulos (entram no Wrapped)

Ideia de 20/11/2026: selos calculados a partir dos dados que já existem em Bolão, Arena, Letreco,
Letroso, Sudoku, Word500, Fronteiras e Ranking de Campeões.

- Exemplos: "7 dias seguidos no Letreco", "placar exato no Bolão", "dobrou a banca na Arena".
- Selos aparecem no Perfil; o Wrapped ganha um capítulo (story) com as conquistas do ano.
- Regra de cada selo em `achievementsLogic.ts` (pura, testável); leitura dos dados em `achievementsService.ts`.
- Decidir na hora: calcular sob demanda a partir das tabelas ou gravar os selos numa tabela (migration em `supabase/`).

## Jogo diário de geometria (Jogos Diários)

Ideia de 21/11/2026, vinda do grupo ("já temos geografia, linguística e raciocínio lógico; que tal geometria plana?").
Foco no **processo** de chegar ao resultado, não na complexidade da conta: de B e C chego a D, de D a E e de E ao A.

Formatos propostos (decidir qual; recomendação: **A**):
- **A. Cadeia de dedução (recomendado):** figura simples (triângulos, paralelas e transversal, polígonos) com alguns ângulos/medidas
  dados e uma incógnita final. O jogador preenche os valores intermediários (B, C, D…) na ordem em que conseguir deduzir; o jogo
  valida cada resposta. Regras usadas: soma dos ângulos = 180°, ângulos opostos pelo vértice, suplementares, triângulo isósceles.
  Níveis = tamanho da cadeia (3, 5 ou 7 passos). Pontua por erros e tempo.
- **B. Escolha a regra:** em cada passo escolher qual propriedade usar antes de dar o valor (mais didático, mais pesado).
- **C. Área em partes:** área de figura composta decompondo em pedaços (visual, mas mais conta que dedução).

Em aberto: formato (A/B/C) e se a resposta é digitada (mais difícil de chutar) ou escolhida entre 4 opções (mais rápida no celular).
Como entra: nova aba em Jogos Diários, tabela `geometria_games` (cópia do esquema de `fronteiras_games`), desafio do dia
determinístico por data (puzzles gerados por script, como o Sudoku, com solução única), ranking diário e geral separado,
começando só no modo desenvolvedor como o Fronteiras. Testes em `src/test/` e entrada no `pages.smoke.test.tsx`.

## Auditoria de segurança/performance — itens restantes

Ver tabela de status em `auditoria-seguranca-performance.md` (S-04, S-08, S-12, S-13, S-14, S-16,
P-02 a P-07, resto do P-09; S-02 só parcial).
