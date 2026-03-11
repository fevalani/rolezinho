import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BirthdayProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  birthday: string; // "MM-DD"
}

interface BirthdayEntry extends BirthdayProfile {
  /** Dias até o próximo aniversário (0 = hoje, negativo não ocorre) */
  daysUntil: number;
  /** Data do próximo aniversário como Date */
  nextDate: Date;
  isToday: boolean;
  /** Idade que fará no próximo aniversário */
  age: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna dias até o próximo aniversário e a idade que fará. */
function computeNextBirthday(birthday: string): {
  daysUntil: number;
  nextDate: Date;
  age: number;
} {
  const now = new Date();
  const todayY = now.getFullYear();
  const [yyyy, mm, dd] = birthday.split("-").map(Number);

  let next = new Date(todayY, mm - 1, dd);
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  if (next < todayMidnight) {
    next = new Date(todayY + 1, mm - 1, dd);
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntil = Math.round(
    (next.getTime() - todayMidnight.getTime()) / msPerDay,
  );

  // Idade que fará no próximo aniversário
  const age = next.getFullYear() - yyyy;

  return { daysUntil, nextDate: next, age };
}

function formatBirthday(birthday: string): string {
  // birthday = "YYYY-MM-DD"
  const [, mm, dd] = birthday.split("-");
  const months = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${parseInt(dd)} de ${months[parseInt(mm) - 1]}`;
}

function daysLabel(days: number): string {
  if (days === 0) return "Hoje! 🎉";
  if (days === 1) return "Amanhã";
  if (days <= 7) return `Em ${days} dias`;
  if (days <= 30) return `Em ${days} dias`;
  const months = Math.floor(days / 30);
  if (months === 1) return "Em 1 mês";
  return `Em ${months} meses`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AniversariosPage() {
  const { profile: myProfile } = useAuth();
  const navigate = useNavigate();

  const [entries, setEntries] = useState<BirthdayEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, birthday")
        .not("birthday", "is", null)
        .order("birthday", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const list: BirthdayEntry[] = (data ?? [])
        .filter((p): p is BirthdayProfile => Boolean(p.birthday))
        .map((p) => {
          const { daysUntil, nextDate, age } = computeNextBirthday(p.birthday);
          return {
            ...p,
            daysUntil,
            nextDate,
            isToday: daysUntil === 0,
            age,
          };
        })
        .sort((a, b) => a.daysUntil - b.daysUntil);

      setEntries(list);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayBirthdays = entries.filter((e) => e.isToday);
  const upcoming = entries.filter((e) => !e.isToday);

  return (
    <div className="py-5 px-5 min-h-[calc(100dvh-52px)]">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-[var(--gold-dark)] hover:text-[var(--gold)] text-sm font-medium transition-colors"
          >
            ← Voltar
          </button>
          <h1
            className="text-lg text-[var(--gold)] tracking-wide"
            style={{ fontFamily: "var(--font-display)" }}
          >
            🎂 Aniversários
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="spinner" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-5xl">🎂</span>
            <p className="text-[var(--text-secondary)]">
              Nenhum aniversário cadastrado ainda.
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              Vá em <strong>Meu Perfil</strong> e adicione seu aniversário!
            </p>
            <button
              onClick={() => navigate("/profile")}
              className="mt-2 py-2 px-5 rounded-lg text-sm font-semibold text-[var(--bg-abyss)] bg-gradient-to-br from-[var(--gold-dark)] to-[var(--gold)] hover:-translate-y-0.5 transition-all"
            >
              Ir para o perfil
            </button>
          </div>
        ) : (
          <>
            {/* Banner de hoje */}
            {todayBirthdays.length > 0 && (
              <div className="rounded-2xl overflow-hidden border border-[rgba(201,165,90,0.3)] bg-gradient-to-br from-[rgba(201,165,90,0.12)] to-[rgba(201,165,90,0.04)]">
                <div className="px-4 py-3 border-b border-[rgba(201,165,90,0.15)] flex items-center gap-2">
                  <span className="text-xl">🎉</span>
                  <span
                    className="text-sm font-bold text-[var(--gold)] uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Hoje tem aniversário!
                  </span>
                </div>
                <div className="flex flex-col divide-y divide-[rgba(201,165,90,0.08)]">
                  {todayBirthdays.map((e) => (
                    <BirthdayRow
                      key={e.id}
                      entry={e}
                      isMe={e.id === myProfile?.id}
                      highlight
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Próximos aniversários */}
            {upcoming.length > 0 && (
              <div className="flex flex-col gap-1">
                <h2
                  className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-semibold px-1 mb-1"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Próximos
                </h2>
                <div className="rounded-xl overflow-hidden border border-[rgba(201,165,90,0.08)] bg-[var(--bg-card)]">
                  {upcoming.map((e, i) => (
                    <div
                      key={e.id}
                      className={
                        i < upcoming.length - 1
                          ? "border-b border-[rgba(201,165,90,0.06)]"
                          : ""
                      }
                    >
                      <BirthdayRow entry={e} isMe={e.id === myProfile?.id} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA se o usuário não cadastrou */}
            {!entries.find((e) => e.id === myProfile?.id) && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-[rgba(201,165,90,0.2)] bg-[rgba(201,165,90,0.04)]">
                <span className="text-2xl">🎈</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-secondary)] font-medium">
                    Seu aniversário não está aqui!
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Adicione no seu perfil para aparecer na lista.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/profile")}
                  className="text-xs font-semibold text-[var(--gold-dark)] hover:text-[var(--gold)] transition-colors shrink-0"
                >
                  Adicionar →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponente: linha de aniversariante ───────────────────────────────────

function BirthdayRow({
  entry,
  isMe,
  highlight = false,
}: {
  entry: BirthdayEntry;
  isMe: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${highlight ? "hover:bg-[rgba(201,165,90,0.04)]" : "hover:bg-[var(--bg-elevated)]"} transition-colors`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar url={entry.avatar_url} name={entry.display_name} size="md" />
        {entry.isToday && (
          <span className="absolute -bottom-1 -right-1 text-base leading-none">
            🎂
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {entry.display_name}
          </span>
          {isMe && (
            <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-[rgba(201,165,90,0.12)] text-[var(--gold-dark)] font-semibold uppercase tracking-wide shrink-0">
              Você
            </span>
          )}
          <div className="h-5 rounded-xs flex justify-center items-center">
            {entry.isToday ? `· ${entry.age} anos hoje! 🎉` : ""}
          </div>
        </div>
        <span className="text-sm text-[var(--text-muted)]">
          {formatBirthday(entry.birthday)}
          {" · "}
          <span className="font-medium">
            {entry.isToday ? `` : `${entry.age} anos`}
          </span>
        </span>
      </div>

      {/* Badge de tempo */}
      <div
        className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
          entry.isToday
            ? "bg-[rgba(201,165,90,0.2)] text-[var(--gold)]"
            : entry.daysUntil <= 7
              ? "bg-[rgba(58,186,122,0.12)] text-[var(--green)]"
              : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
        }`}
      >
        {daysLabel(entry.daysUntil)}
      </div>
    </div>
  );
}
