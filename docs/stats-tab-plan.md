# Aba Estatísticas — Plano de Implementação

## Visão Geral

Nova aba **"Stats"** no `BolaoDetailPage`, posicionada entre Classificação e Info.  
Toda a computação é feita **client-side** a partir de dados já carregados no snapshot (`allUserPredictions`, `leaderboard`, `rounds`), sem novas queries ao banco.  
Exceção: evolução de posição requer ordenar palpites por data de partida, já disponível em `UserPredictionDetail.utc_date`.

---

## Dependência Nova

Instalar **Recharts** (MIT, ~180 kB gzip) para o gráfico de evolução de posição:

```
npm install recharts
```

Todos os outros widgets são CSS/Tailwind puro — sem dependência adicional.

---

## Dados Disponíveis (já no cliente)

| Fonte | O que temos |
|---|---|
| `allUserPredictions` (Map userId → UserPredictionDetail[]) | Por usuário: match_id, pred_home, pred_away, points_earned, round_label, utc_date, score_home, score_away |
| `leaderboard` (LeaderboardEntry[]) | total_points, exact_scores, predictions_made por usuário |
| `roundLeaderboards` (RoundLeaderboard[]) | pontos por rodada por usuário |
| `rounds` (RoundGroup[]) | partidas com status, times, scores |
| `members` (BolaoPoolMember[]) | display_name, avatar_url |

**Tipos de pontos inferíveis** (usando `calculatePoints` já exportado):

| Tipo | Condição detectável |
|---|---|
| 🎯 Cravada (15 pts) | `pred_home === score_home && pred_away === score_away` |
| 🤝 Empate acertado | `score_home === score_away && pred acertou empate` |
| ✅ Gols do Vencedor | vencedor correto + gols do vencedor certos |
| ➗ Saldo correto | vencedor correto + saldo de gols certo |
| 📌 Só vencedor | vencedor correto, resto errado |
| ❌ Zero | `points_earned === 0` |

---

## Estatísticas Planejadas

### 1. Evolução de Posição por Partida (gráfico de linhas)
**Fonte dos dados:** `allUserPredictions` ordenado por `utc_date`.  
**Cálculo:** após cada partida com resultado, recalcular o ranking acumulado. A posição de cada participante em cada "tick" vira um ponto na linha.  
**Componente:** `<LineChart>` do Recharts. Eixo X = número da partida jogada (ou data), Eixo Y = posição (invertido: 1 no topo). Uma linha por participante, com a cor do avatar. Tooltip mostra placar da partida e palpite.  
**Interatividade:** hover revela quem está na linha. Clique na legenda isola um participante.

---

### 2. Ranking por Tipo de Pontuação
**Seis sub-rankings em cards horizontais roláveis:**

| # | Ranking | Métrica |
|---|---|---|
| 2a | 🎯 Rei das Cravadas | Nº de placares exatos |
| 2b | ✅ Gols do Vencedor | Nº de acertos de gols do vencedor |
| 2c | ➗ Saldo de Gols | Nº de acertos de saldo |
| 2d | 📌 Só Vencedor | Nº de acertos simples de resultado |
| 2e | 🤝 Empate | Nº de empates acertados |
| 2f | ❌ Mais Erros | Nº de palpites com 0 pontos |

Cada card: pódio de 3 com avatar + nome + contagem.

---

### 3. Aproveitamento (%)
**Fórmula:** `(pontos_earned / pontos_máximos_possíveis) × 100`  
Pontos máximos = nº de partidas com resultado × pontuação máxima da cravada (15 pts, ou valor do bolão custom).  
**Visualização:** barra horizontal de progresso por participante, ordenada por %. Útil para comparar participantes que entraram no bolão em momentos diferentes.

---

### 4. [EXTRA] Herói por Rodada
Maior pontuador de cada rodada. Podium com troféu 🏆 para quem mais ganhou rodadas. Mostra os pontos daquela rodada ao lado do nome.

---

### 5. [EXTRA] Perfil de Palpiteiro
Card por participante (ou só o seu) com DNA de palpites:
- **Gols chutados em média** (ex: 2.3 × 1.1) → estilo "atacante" ou "defensivo"
- **% de partidas palpitadas** (participação)
- **Maior pontuação em uma partida**
- **Sequência atual de pontuações consecutivas** (streak ativo)
- **Maior streak histórica**

---

### 6. [EXTRA] Partida Mais Polêmica vs Consenso
- **Mais polêmica:** partida onde houve maior variância de palpites entre participantes (todos chutaram coisas diferentes)
- **Maior consenso:** partida onde mais participantes chutaram o mesmo placar
- **Partida mais cara:** onde mais pontos foram deixados na mesa (erros coletivos)
- **Partida mais generosa:** maior total de pontos distribuídos

---

### 7. [EXTRA] Confronto Direto H2H
Seletor de dois participantes: mostra quem ganhou mais rodadas entre si, diferença de pontos acumulados, e placar de "duelos" rodada a rodada.

---

### 8. [EXTRA] Palpite mais Ousado
Quem mais apostou em goleadas (soma dos gols do palpite > X). Ranking de "goleadeiros" — palpiteiros que apostam placar alto.

---

### 9. [EXTRA] Melhor Performance por Fase
Pontuação média por fase do campeonato (Grupos / Dezesseis-avos / Oitavas etc.) — revela quem melhora conforme o mata-mata fica mais difícil.

---

### 10. [EXTRA] Pontual vs Atrasado (se implementável)
Se `bolao_predictions` tiver `created_at`, mostrar quem palpita com mais antecedência vs quem deixa para última hora. Curiosidade social.

---

## Arquitetura de Implementação

### Arquivos novos
```
src/features/bolao/BolaoStatsTab.tsx   ← componente principal da aba
src/features/bolao/statsUtils.ts       ← funções puras de cálculo
```

### Alterações em arquivos existentes
```
BolaoDetailPage.tsx
  - type Tab: adicionar "stats"
  - Tabs: adicionar ["stats", "Stats"] entre classificacao e info
  - Renderizar <BolaoStatsTab> quando activeTab === "stats"
  - Passar: allUserPredictions, leaderboard, roundLeaderboards, rounds, members, pool
```

### `statsUtils.ts` — funções principais
```ts
computePositionEvolution(allUserPredictions, members)
  → { matchLabel: string; positions: Record<userId, number> }[]

computeScoreTypeRankings(allUserPredictions, pool)
  → { exact, winnerGoals, saldo, winner, draw, zero }
     (cada um: { userId, displayName, avatarUrl, count }[])

computeEfficiency(allUserPredictions, leaderboard, pool)
  → { userId, displayName, avatarUrl, pct: number, pts: number, max: number }[]

computeRoundHeroes(roundLeaderboards, members)
  → { round_label, userId, displayName, points }[]

computePredictionProfile(allUserPredictions, userId)
  → { avgGoals, maxPts, streak, topStreak, participationPct }

computeMatchInsights(allUserPredictions, rounds)
  → { mostControversial, mostConsensus, mostExpensive, mostGenerous }
```

### `BolaoStatsTab.tsx` — estrutura de seções
```tsx
<BolaoStatsTab ...>
  <Section title="Evolução de Posição">
    <PositionEvolutionChart />
  </Section>
  <Section title="Rankings por Tipo">
    <ScoreTypeCards />        {/* scroll horizontal */}
  </Section>
  <Section title="Aproveitamento">
    <EfficiencyBars />
  </Section>
  <Section title="Herói por Rodada">
    <RoundHeroList />
  </Section>
  <Section title="Curiosidades">
    <MatchInsights />
  </Section>
  <Section title="Confronto Direto">
    <H2HSelector />
  </Section>
</BolaoStatsTab>
```

---

## Ordem de Implementação

1. `npm install recharts` + verificar types
2. `statsUtils.ts` — funções de cálculo (testável isoladamente)
3. `BolaoStatsTab.tsx` — esqueleto + passar props
4. Implementar stat por stat:
   - Evolução de posição (maior impacto visual, faz primeiro)
   - Rankings por tipo
   - Aproveitamento
   - Herói por rodada
   - Curiosidades de partidas
   - Confronto direto (mais complexo, por último)
5. Adicionar aba no `BolaoDetailPage.tsx`

---

## Questões Pendentes (decidir antes de implementar)

1. **Gráfico de evolução**: mostrar todos os participantes simultaneamente ou ter um seletor para filtrar? (Acima de 6 pessoas fica poluído)
2. **Aproveitamento**: base de cálculo inclui partidas TBD (sem resultado) ou só as já finalizadas?
3. **Ranking por tipo**: mostrar pódio de 3 ou top 5?
4. **H2H**: implementar na v1 ou deixar para depois?
5. **Score type detection**: para bolões com modelo `classic`, o tipo de pontuação não está gravado no banco (só `points_earned`). Precisamos inferir comparando pred vs resultado. Confirmar que `score_home/score_away` estão disponíveis em `allUserPredictions` — sim, estão.
