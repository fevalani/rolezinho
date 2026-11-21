import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchChatStats } from "./chatStatsService";
import {
  WEEKDAY_NAMES,
  MENTIRA_OUTCOME,
  buildMentiras,
  buildRankings,
  fmtDate,
  fmtInt,
  fmtMonth,
  fmtPct,
  peakIndex,
  peakSummary,
  topPairs,
} from "./chatStatsLogic";
import type { ChatStats } from "./chatStatsTypes";

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 p-4 rounded-xl bg-(--bg-card) border border-[rgba(255,255,255,0.06)]">
      <h2 className="text-base text-(--text-primary)" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h2>
      {note && <p className="text-xs text-(--text-muted)">{note}</p>}
      {children}
    </section>
  );
}

/** Barras verticais simples (horas, dias da semana, meses). */
function Bars({ values, labels, highlight, ariaLabel }: { values: number[]; labels: string[]; highlight: number; ariaLabel: string }) {
  const max = Math.max(1, ...values);
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-end gap-[3px] h-28">
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${labels[i]}: ${fmtInt(v)}`}>
          <div
            className="w-full rounded-t-sm"
            style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: i === highlight ? "var(--gold)" : "rgba(201,165,90,0.35)" }}
          />
        </div>
      ))}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-(--bg-elevated)">
      <span className="text-lg font-semibold text-(--text-primary)">{value}</span>
      <span className="text-xs text-(--text-muted) text-center">{label}</span>
    </div>
  );
}

function Content({ stats }: { stats: ChatStats }) {
  const rankings = useMemo(() => buildRankings(stats), [stats]);
  const pairs = useMemo(() => topPairs(stats), [stats]);
  const mentiras = useMemo(() => buildMentiras(stats), [stats]);
  const peak = peakSummary(stats);
  const monthValues = stats.byMonth.map((m) => m.messages);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat value={fmtInt(stats.totalMessages)} label="mensagens" />
        <Stat value={fmtInt(stats.activeDays)} label="dias com conversa" />
        <Stat value={fmtInt(stats.conversations)} label="conversas (≥ 3 msgs)" />
        <Stat value={stats.longestStreak ? `${stats.longestStreak.days} dias` : "—"} label="maior sequência seguida" />
      </div>
      <p className="text-xs text-(--text-muted)">
        {stats.periodStart && stats.periodEnd && `${fmtDate(stats.periodStart)} a ${fmtDate(stats.periodEnd)}`}
        {stats.generatedAt && ` · atualizado em ${fmtDate(stats.generatedAt)}`}
      </p>

      <Section title="Quando o grupo fala" note={peak ?? undefined}>
        <Bars values={stats.byHour} labels={stats.byHour.map((_, h) => `${h}h`)} highlight={peakIndex(stats.byHour)} ariaLabel="Mensagens por hora do dia" />
        <p className="text-[0.65rem] text-(--text-muted) flex justify-between"><span>0h</span><span>12h</span><span>23h</span></p>
        <Bars values={stats.byWeekday} labels={WEEKDAY_NAMES} highlight={peakIndex(stats.byWeekday)} ariaLabel="Mensagens por dia da semana" />
        <p className="text-[0.65rem] text-(--text-muted) flex justify-between">
          {WEEKDAY_NAMES.map((d) => <span key={d}>{d.slice(0, 3)}</span>)}
        </p>
      </Section>

      {monthValues.length > 1 && (
        <Section title="Mês a mês">
          <Bars values={monthValues} labels={stats.byMonth.map((m) => fmtMonth(m.month))} highlight={peakIndex(monthValues)} ariaLabel="Mensagens por mês" />
          <p className="text-[0.65rem] text-(--text-muted) flex justify-between">
            <span>{fmtMonth(stats.byMonth[0].month)}</span>
            <span>{fmtMonth(stats.byMonth[stats.byMonth.length - 1].month)}</span>
          </p>
        </Section>
      )}

      {rankings.map((r) => (
        <Section key={r.key} title={r.title} note={r.description}>
          <ol className="flex flex-col gap-1">
            {r.rows.map((row, i) => (
              <li key={row.name} className="flex items-baseline gap-2 text-sm text-(--text-primary)">
                <span className="w-5 text-(--text-muted)">{i + 1}</span>
                <span className="flex-1 truncate">{row.name}</span>
                <span className="text-(--text-secondary)">{row.label}</span>
              </li>
            ))}
          </ol>
        </Section>
      ))}

      {pairs.length > 0 && (
        <Section title="As duplas" note="Quem mais responde um ao outro (nas duas direções).">
          <ul className="flex flex-col gap-1 text-sm text-(--text-primary)">
            {pairs.map((p) => (
              <li key={`${p.a}-${p.b}`} className="flex gap-2">
                <span className="flex-1 truncate">{p.a} ↔ {p.b}</span>
                <span className="text-(--text-secondary)">{fmtInt(p.count)} respostas</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {stats.catchphrases.length > 0 && (
        <Section title="Bordões e piadas internas" note="Trechos que o grupo repete e quem mais usa.">
          <ul className="flex flex-col gap-1 text-sm text-(--text-primary)">
            {stats.catchphrases.slice(0, 10).map((c) => (
              <li key={c.phrase} className="flex gap-2">
                <span className="flex-1 truncate">“{c.phrase}”</span>
                <span className="text-(--text-secondary)">{fmtInt(c.count)}× · {c.topAuthor}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {stats.topWords.length > 0 && (
        <Section title="Palavras mais usadas">
          <p className="text-sm text-(--text-secondary)">
            {stats.topWords.slice(0, 15).map((w) => `${w.word} (${fmtInt(w.count)})`).join(" · ")}
          </p>
        </Section>
      )}

      {mentiras && (
        <Section
          title="Mentiras confirmadas 🤥"
          note="Só entram casos em que alguém contestou e o próprio chat confirmou (admitiu ou foi provado). Cada um foi revisado pelo administrador."
        >
          <ol className="flex flex-col gap-1 text-sm text-(--text-primary)">
            {mentiras.ranking.map((r, i) => (
              <li key={r.name} className="flex items-baseline gap-2">
                <span className="w-5 text-(--text-muted)">{i + 1}</span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-(--text-secondary)">{r.label}</span>
              </li>
            ))}
          </ol>
          <h3 className="text-sm text-(--text-primary) mt-2">Os casos</h3>
          <ul className="flex flex-col gap-3 text-sm">
            {mentiras.episodes.slice(0, 10).map((e, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <span className="text-xs text-(--text-muted)">{fmtDate(e.date)} · {MENTIRA_OUTCOME[e.outcome]}</span>
                <span className="text-(--text-primary)"><b>{e.claimant}:</b> “{e.claim}”</span>
                <span className="text-(--text-secondary)"><b>{e.contester}:</b> “{e.contest}”</span>
                <span className="text-(--text-secondary)">↳ “{e.resolution}”</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {stats.topics && (
        <Section title="Assuntos mais discutidos" note="Cada conversa foi classificada por uma IA local; as contagens são feitas por código.">
          <ul className="flex flex-col gap-1.5">
            {stats.topics.categories.map((c) => (
              <li key={c.name} className="flex flex-col gap-0.5 text-sm text-(--text-primary)">
                <span className="flex justify-between gap-2">
                  <span>{c.name}</span>
                  <span className="text-(--text-secondary)">{fmtPct(c.share)} · {fmtInt(c.conversations)} conversas</span>
                </span>
                <span className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)]">
                  <span className="block h-full rounded-full bg-(--gold)" style={{ width: `${Math.min(100, c.share)}%` }} />
                </span>
              </li>
            ))}
          </ul>
          {stats.topics.byPerson.length > 0 && (
            <>
              <h3 className="text-sm text-(--text-primary) mt-2">Cada um fala mais de…</h3>
              <ul className="flex flex-col gap-1 text-sm text-(--text-secondary)">
                {stats.topics.byPerson.map((p) => (
                  <li key={p.name}>
                    <span className="text-(--text-primary)">{p.name}:</span> {p.categories.map((c) => c.name).join(", ")}
                  </li>
                ))}
              </ul>
            </>
          )}
          {stats.topics.highlights.length > 0 && (
            <>
              <h3 className="text-sm text-(--text-primary) mt-2">Maiores papos</h3>
              <ul className="flex flex-col gap-1 text-sm text-(--text-secondary)">
                {stats.topics.highlights.slice(0, 8).map((h, i) => (
                  <li key={i}>{fmtDate(h.date)} · {h.label} ({fmtInt(h.messages)} msgs)</li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}
    </>
  );
}

export function ChatStatsPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchChatStats(slug).then((s) => {
      if (!alive) return;
      setStats(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  return (
    <div className="max-w-[640px] mx-auto px-5 py-6 flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate("/")} aria-label="Voltar" className="text-(--text-muted)">←</button>
        <h1 className="text-xl text-(--text-primary)" style={{ fontFamily: "var(--font-display)" }}>
          {stats?.title ?? "Estatísticas do chat"}
        </h1>
      </header>
      {loading ? (
        <p className="text-center text-(--text-muted)">Carregando…</p>
      ) : !stats ? (
        <p className="text-center text-(--text-secondary)">
          Nada para mostrar ainda. Se você deveria ver, peça ao administrador para liberar o acesso.
        </p>
      ) : (
        <Content stats={stats} />
      )}
    </div>
  );
}
