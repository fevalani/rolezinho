import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useBetaMode } from "@/lib/useBetaMode";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import { fetchAllDuels, createRanking } from "./duelosService";
import {
  DEFAULT_DUEL_ICON,
  DUEL_ICONS,
  type DuelRankingSummary,
} from "./duelosTypes";

function parseItems(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const name = line.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

function RankingCard({
  summary,
  onOpen,
}: {
  summary: DuelRankingSummary;
  onOpen: () => void;
}) {
  const { ranking, itemCount, participantCount, finishedCount, myStatus } =
    summary;
  const badge = {
    not_started: {
      label: "Novo",
      cls: "text-[var(--gold)] bg-[rgba(201,165,90,0.12)]",
    },
    in_progress: {
      label: "Em andamento",
      cls: "text-[var(--text-primary)] bg-[var(--bg-elevated)]",
    },
    finished: {
      label: "Concluído ✓",
      cls: "text-[var(--text-muted)] bg-[var(--bg-elevated)]",
    },
  }[myStatus];
  return (
    <button
      onClick={onOpen}
      className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-start gap-3 text-left w-full hover:border-[rgba(201,165,90,0.2)] transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-[rgba(201,165,90,0.1)] flex items-center justify-center text-xl shrink-0">
        {ranking.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[var(--text-primary)] truncate text-sm">
          {ranking.title}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          {itemCount} itens · {finishedCount} de {participantCount} concluíram
        </p>
      </div>
      <span
        className={`text-[0.65rem] font-semibold px-2 py-1 rounded-lg shrink-0 ${badge.cls}`}
      >
        {badge.label}
      </span>
    </button>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl skeleton shrink-0" />
      <div className="flex-1 flex flex-col gap-2 justify-center">
        <div className="h-3.5 w-2/3 rounded-md skeleton" />
        <div className="h-2.5 w-1/3 rounded-md skeleton" />
      </div>
    </div>
  );
}

function CreateModal({
  isBeta,
  onClose,
  onCreated,
}: {
  isBeta: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(DEFAULT_DUEL_ICON);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = parseItems(text);
  const valid = title.trim() && items.length >= 2;

  const handleCreate = async () => {
    if (!user || !valid) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await createRanking(
      user.id,
      title.trim(),
      icon,
      items,
    );
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (data) {
      if (isBeta) hapticSuccess();
      onCreated(data);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto max-h-[90vh] overflow-y-auto ${
          isBeta ? "glass-panel" : "bg-[var(--bg-deep)]"
        }`}
      >
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Novo duelo
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
              Tema
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Melhores filmes do Nolan"
              maxLength={60}
              autoFocus
              className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
              Emoji
            </label>
            <div className="flex flex-wrap gap-2">
              {DUEL_ICONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setIcon(e)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-all ${
                    icon === e
                      ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)]"
                      : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
              Itens (um por linha, mínimo 2) — {items.length}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={"Item A\nItem B\nItem C"}
              className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)] resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleCreate}
            disabled={loading || !valid}
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Criando…
              </span>
            ) : (
              "Começar a duelar"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export function DuelosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBeta = useBetaMode();
  const [rankings, setRankings] = useState<DuelRankingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setRankings(await fetchAllDuels(userId));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchAllDuels(userId).then((data) => {
      setRankings(data);
      setLoading(false);
    });
  }, [userId]);

  usePullToRefresh(load, isBeta);

  return (
    <div
      className="min-h-screen bg-[var(--bg-abyss)]"
      style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
    >
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Duelos ⚔️
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Monte seu ranking escolhendo entre dois
          </p>
        </div>
        <button
          onClick={() => {
            if (isBeta) hapticTap();
            setShowCreate(true);
          }}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] transition-all"
        >
          + Novo duelo
        </button>
      </div>

      {loading ? (
        isBeta ? (
          <div className="px-4 flex flex-col gap-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="flex items-center justify-center pt-16">
            <div className="spinner" />
          </div>
        )
      ) : rankings.length === 0 ? (
        <div className="px-4">
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-8 text-center">
            <p className="text-2xl mb-2">⚔️</p>
            <p className="text-sm text-[var(--text-muted)]">
              Nenhum duelo criado ainda
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-xs text-[var(--gold)] underline underline-offset-2"
            >
              Criar o primeiro
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {rankings.map((s) => (
            <RankingCard
              key={s.ranking.id}
              summary={s}
              onOpen={() => {
                if (isBeta) hapticTap();
                navigate(`/duelos/${s.ranking.id}`);
              }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          isBeta={isBeta}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/duelos/${id}`);
          }}
        />
      )}
    </div>
  );
}
