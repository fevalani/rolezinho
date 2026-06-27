import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Avatar } from "@/components/Avatar";
import type {
  UserPredictionDetail,
  LeaderboardEntry,
  RoundLeaderboard,
  BolaoPoolMember,
  BolaoPool,
} from "./bolaoService";
import {
  computePositionEvolution,
  computeScoreTypeRankings,
  computeEfficiency,
  computeRoundHeroes,
  computePredictionProfile,
  computeMatchInsights,
  computeH2H,
  type RankedStatUser,
} from "./statsUtils";

// ─── Paleta de cores para linhas do gráfico ──────────────────────
const LINE_COLORS = [
  "#C9A55A", "#60A5FA", "#34D399", "#F87171", "#A78BFA",
  "#FBBF24", "#F472B6", "#2DD4BF", "#FB923C", "#94A3B8",
];

// ─── Componentes auxiliares ──────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

function MiniPodium({ entries }: { entries: RankedStatUser[] }) {
  const medals = ["🥇", "🥈", "🥉"];
  const top3 = entries.slice(0, 3).filter((e) => e.count > 0);
  if (top3.length === 0) {
    return <p className="text-xs text-[var(--text-muted)] text-center py-2">Sem dados</p>;
  }
  return (
    <div className="space-y-1.5">
      {top3.map((e, i) => (
        <div key={e.userId} className="flex items-center gap-2">
          <span className="text-sm w-5 shrink-0 text-center">{medals[i]}</span>
          <Avatar url={e.avatarUrl} name={e.displayName} size="xs" />
          <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{e.displayName}</span>
          <span className="text-xs font-bold text-[var(--gold)] shrink-0">{e.count}</span>
        </div>
      ))}
    </div>
  );
}

interface ScoreTypeCardProps {
  emoji: string;
  title: string;
  entries: RankedStatUser[];
}

function ScoreTypeCard({ emoji, title, entries }: ScoreTypeCardProps) {
  return (
    <div className="shrink-0 w-44 bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-base">{emoji}</span>
        <span className="text-xs font-semibold text-[var(--text-secondary)] truncate">{title}</span>
      </div>
      <MiniPodium entries={entries} />
    </div>
  );
}

// ─── Tooltip customizado para o gráfico ──────────────────────────
function EvolutionTooltip({ active, payload, label, members }: {
  active?: boolean;
  payload?: { color: string; dataKey: string; value: number }[];
  label?: string;
  members: BolaoPoolMember[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const profileMap = new Map(members.map((m) => [m.user_id, m.profile]));
  const sorted = [...payload].sort((a, b) => a.value - b.value);
  return (
    <div className="bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.12)] rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-[var(--text-muted)] mb-1.5">Jogo {label}</p>
      {sorted.map((item) => {
        const prof = profileMap.get(item.dataKey);
        return (
          <div key={item.dataKey} className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
            <span className="text-[var(--text-secondary)] truncate max-w-[100px]">
              {prof?.display_name ?? item.dataKey}
            </span>
            <span className="font-bold text-[var(--text-primary)] ml-auto pl-2">{item.value}º</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Seletor H2H ─────────────────────────────────────────────────
function H2HSelector({
  allUserPredictions,
  roundLeaderboards,
  members,
}: {
  allUserPredictions: Map<string, UserPredictionDetail[]>;
  roundLeaderboards: RoundLeaderboard[];
  members: BolaoPoolMember[];
}) {
  const [aId, setAId] = useState(members[0]?.user_id ?? "");
  const [bId, setBId] = useState(members[1]?.user_id ?? "");

  const result = useMemo(
    () => (aId && bId && aId !== bId ? computeH2H(allUserPredictions, roundLeaderboards, members, aId, bId) : null),
    [allUserPredictions, roundLeaderboards, members, aId, bId],
  );

  if (members.length < 2) return <p className="text-xs text-[var(--text-muted)]">Poucos participantes.</p>;

  const selectCls = "flex-1 bg-[var(--bg-card)] border border-[rgba(255,255,255,0.08)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={aId} onChange={(e) => setAId(e.target.value)} className={selectCls}>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.profile.display_name}</option>
          ))}
        </select>
        <span className="text-[var(--text-muted)] text-xs font-bold">vs</span>
        <select value={bId} onChange={(e) => setBId(e.target.value)} className={selectCls}>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.profile.display_name}</option>
          ))}
        </select>
      </div>

      {!result && aId === bId && (
        <p className="text-xs text-[var(--text-muted)] text-center">Selecione dois participantes diferentes.</p>
      )}

      {result && (
        <div className="space-y-2">
          {/* Placar H2H */}
          <div className="flex items-center gap-3 bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
            <div className="flex-1 flex flex-col items-center gap-1">
              <Avatar url={result.userA.avatarUrl} name={result.userA.displayName} size="sm" />
              <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[80px] text-center">{result.userA.displayName}</span>
              <span className="text-xl font-bold text-[var(--gold)]">{result.userA.wins}</span>
              <span className="text-[0.6rem] text-[var(--text-muted)]">vitórias</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[0.6rem] text-[var(--text-muted)]">pts totais</span>
              <span className="text-sm font-bold text-[var(--text-primary)]">{result.userA.pts} – {result.userB.pts}</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1">
              <Avatar url={result.userB.avatarUrl} name={result.userB.displayName} size="sm" />
              <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[80px] text-center">{result.userB.displayName}</span>
              <span className="text-xl font-bold text-[var(--gold)]">{result.userB.wins}</span>
              <span className="text-[0.6rem] text-[var(--text-muted)]">vitórias</span>
            </div>
          </div>

          {/* Detalhe por rodada */}
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
            {result.rounds.map((r) => {
              const aWon = r.ptsA > r.ptsB;
              const bWon = r.ptsB > r.ptsA;
              return (
                <div key={r.label} className="flex items-center px-3 py-1.5 border-b border-[rgba(255,255,255,0.04)] last:border-0">
                  <span className={`text-xs font-bold w-7 text-right ${aWon ? "text-[var(--gold)]" : "text-[var(--text-muted)]"}`}>{r.ptsA}</span>
                  <span className="flex-1 text-[0.65rem] text-[var(--text-muted)] text-center truncate px-2">{r.label}</span>
                  <span className={`text-xs font-bold w-7 ${bWon ? "text-[var(--gold)]" : "text-[var(--text-muted)]"}`}>{r.ptsB}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────

interface Props {
  allUserPredictions: Map<string, UserPredictionDetail[]>;
  leaderboard: LeaderboardEntry[];
  roundLeaderboards: RoundLeaderboard[];
  members: BolaoPoolMember[];
  pool: BolaoPool | null;
  currentUserId: string | null;
}

export function BolaoStatsTab({
  allUserPredictions,
  leaderboard,
  roundLeaderboards,
  members,
  pool,
  currentUserId,
}: Props) {
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const positionData = useMemo(
    () => computePositionEvolution(allUserPredictions, members),
    [allUserPredictions, members],
  );

  const scoreTypes = useMemo(
    () => computeScoreTypeRankings(allUserPredictions, members),
    [allUserPredictions, members],
  );

  const efficiency = useMemo(
    () => computeEfficiency(allUserPredictions, leaderboard, pool),
    [allUserPredictions, leaderboard, pool],
  );

  const heroes = useMemo(
    () => computeRoundHeroes(roundLeaderboards, members),
    [roundLeaderboards, members],
  );

  const insights = useMemo(
    () => computeMatchInsights(allUserPredictions),
    [allUserPredictions],
  );

  // Perfil do usuário atual
  const myProfile = useMemo(() => {
    if (!currentUserId) return null;
    const preds = allUserPredictions.get(currentUserId) ?? [];
    const finishedCount = new Set(
      [...allUserPredictions.values()].flatMap((ps) =>
        ps.filter((p) => p.score_home !== null).map((p) => p.match_id),
      ),
    ).size;
    return computePredictionProfile(preds, finishedCount);
  }, [allUserPredictions, currentUserId]);

  const toggleLine = (userId: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const hasData = positionData.length > 0;

  return (
    <div className="space-y-6 px-4 pb-8 pt-2">
      {/* ── 1. Evolução de Posição ── */}
      <Section title="Evolução de Posição">
        {!hasData ? (
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-6 text-center">
            <p className="text-xs text-[var(--text-muted)]">Nenhuma partida encerrada ainda.</p>
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
            {/* Legenda clicável */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {members.map((m, i) => {
                const color = LINE_COLORS[i % LINE_COLORS.length];
                const hidden = hiddenLines.has(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => toggleLine(m.user_id)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.6rem] transition-opacity ${
                      hidden
                        ? "opacity-30 border-[rgba(255,255,255,0.08)] bg-transparent"
                        : "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.04)]"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[var(--text-secondary)]">{m.profile.display_name}</span>
                  </button>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={positionData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="matchIdx"
                  tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  reversed
                  domain={[1, members.length]}
                  ticks={Array.from({ length: members.length }, (_, i) => i + 1)}
                  tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}º`}
                />
                <Tooltip content={<EvolutionTooltip members={members} />} />
                {members.map((m, i) => (
                  <Line
                    key={m.user_id}
                    type="monotone"
                    dataKey={m.user_id}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={hiddenLines.has(m.user_id) ? 0 : 2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <p className="text-[0.6rem] text-[var(--text-muted)] text-center mt-1">
              Toque na legenda para isolar um participante
            </p>
          </div>
        )}
      </Section>

      {/* ── 2. Rankings por Tipo ── */}
      <Section title="Rankings por Tipo de Pontuação">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          <ScoreTypeCard emoji="🎯" title="Rei das Cravadas" entries={scoreTypes.exact} />
          <ScoreTypeCard emoji="✅" title="Gols do Vencedor" entries={scoreTypes.winnerGoals} />
          <ScoreTypeCard emoji="➗" title="Saldo de Gols" entries={scoreTypes.saldo} />
          <ScoreTypeCard emoji="📌" title="Só Vencedor" entries={scoreTypes.winner} />
          <ScoreTypeCard emoji="🤝" title="Empates" entries={scoreTypes.draw} />
          <ScoreTypeCard emoji="💣" title="Goleadeiros" entries={scoreTypes.bold} />
          <ScoreTypeCard emoji="❌" title="Mais Erros" entries={scoreTypes.zero} />
        </div>
      </Section>

      {/* ── 3. Aproveitamento ── */}
      <Section title="Aproveitamento">
        <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 space-y-2.5">
          {efficiency.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-2">Sem dados</p>
          ) : (
            efficiency.map((e, i) => (
              <div key={e.userId}>
                <div className="flex items-center gap-2 mb-1">
                  <Avatar url={e.avatarUrl} name={e.displayName} size="xs" />
                  <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{e.displayName}</span>
                  <span className="text-xs font-bold text-[var(--gold)]">{e.pct}%</span>
                  <span className="text-[0.6rem] text-[var(--text-muted)]">{e.pts}/{e.max}pts</span>
                </div>
                <div className="h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${e.pct}%`,
                      background: i === 0 ? "var(--gold)" : "rgba(201,165,90,0.45)",
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      {/* ── 4. Herói por Rodada ── */}
      <Section title="Herói por Rodada">
        <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
          {heroes.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">Sem rodadas encerradas.</p>
          ) : (
            heroes.map((h) => {
              return (
                <div
                  key={h.round_label}
                  className="flex items-center gap-2.5 px-3 py-2 border-b border-[rgba(255,255,255,0.04)] last:border-0"
                >
                  <span className="text-sm w-4 shrink-0">🏆</span>
                  <Avatar url={h.hero.avatarUrl} name={h.hero.displayName} size="xs" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">{h.hero.displayName}</p>
                    <p className="text-[0.6rem] text-[var(--text-muted)] truncate">{h.round_label}</p>
                  </div>
                  <span className="text-xs font-bold text-[var(--gold)] shrink-0">{h.hero.points} pts</span>
                </div>
              );
            })
          )}
        </div>

        {/* Troféu: quem ganhou mais rodadas */}
        {heroes.length > 0 && (() => {
          const winsMap = new Map<string, { name: string; avatar: string | null; wins: number }>();
          for (const h of heroes) {
            const cur = winsMap.get(h.hero.userId);
            if (cur) cur.wins++;
            else winsMap.set(h.hero.userId, { name: h.hero.displayName, avatar: h.hero.avatarUrl, wins: 1 });
          }
          const sorted = [...winsMap.values()].sort((a, b) => b.wins - a.wins);
          const top = sorted[0];
          if (!top || top.wins < 2) return null;
          return (
            <div className="bg-[rgba(201,165,90,0.07)] border border-[rgba(201,165,90,0.2)] rounded-xl p-3 flex items-center gap-2">
              <span className="text-xl">👑</span>
              <div>
                <p className="text-xs font-semibold text-[var(--gold)]">{top.name}</p>
                <p className="text-[0.6rem] text-[var(--text-muted)]">venceu {top.wins} rodadas</p>
              </div>
            </div>
          );
        })()}
      </Section>

      {/* ── 5. Meu Perfil ── */}
      {myProfile && currentUserId && (
        <Section title="Meu Perfil de Palpiteiro">
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 space-y-3">
            {/* Estilo */}
            <div className="flex items-center gap-2">
              <span className="text-xl">
                {myProfile.style === "atacante" ? "⚔️" : myProfile.style === "defensivo" ? "🛡️" : "⚖️"}
              </span>
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)] capitalize">{myProfile.style}</p>
                <p className="text-[0.6rem] text-[var(--text-muted)]">
                  Média de palpite: {myProfile.avgHome.toFixed(1)} × {myProfile.avgAway.toFixed(1)}
                </p>
              </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Participação", value: `${myProfile.participationPct}%` },
                { label: "Maior pontuação", value: `${myProfile.maxPts} pts` },
                { label: "Streak atual", value: `${myProfile.streak} seguidas` },
                { label: "Melhor streak", value: `${myProfile.topStreak} seguidas` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg p-2">
                  <p className="text-[0.6rem] text-[var(--text-muted)]">{label}</p>
                  <p className="text-sm font-bold text-[var(--gold)]">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* ── 6. Curiosidades ── */}
      <Section title="Curiosidades das Partidas">
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              emoji: "🔥",
              title: "Mais polêmica",
              subtitle: insights.mostControversial
                ? `${insights.mostControversial.uniquePreds} palpites diferentes`
                : "–",
              label: insights.mostControversial?.label ?? "–",
            },
            {
              emoji: "🎯",
              title: "Maior consenso",
              subtitle: insights.mostConsensus
                ? `${insights.mostConsensus.count}× ${insights.mostConsensus.topPred}`
                : "–",
              label: insights.mostConsensus?.label ?? "–",
            },
            {
              emoji: "🎁",
              title: "Mais generosa",
              subtitle: insights.mostGenerous
                ? `${insights.mostGenerous.totalPts} pts distribuídos`
                : "–",
              label: insights.mostGenerous?.label ?? "–",
            },
            {
              emoji: "💸",
              title: "Mais dolorosa",
              subtitle: insights.mostExpensive
                ? `${insights.mostExpensive.zeroCount} erros`
                : "–",
              label: insights.mostExpensive?.label ?? "–",
            },
          ].map(({ emoji, title, subtitle, label }) => (
            <div
              key={title}
              className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3"
            >
              <div className="text-xl mb-1">{emoji}</div>
              <p className="text-[0.6rem] text-[var(--text-muted)] font-semibold uppercase tracking-wide">{title}</p>
              <p className="text-xs font-medium text-[var(--text-primary)] leading-tight mt-0.5 truncate">{label}</p>
              <p className="text-[0.6rem] text-[var(--gold)] mt-0.5">{subtitle}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 7. Confronto Direto ── */}
      <Section title="Confronto Direto">
        <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
          <H2HSelector
            allUserPredictions={allUserPredictions}
            roundLeaderboards={roundLeaderboards}
            members={members}
          />
        </div>
      </Section>
    </div>
  );
}
