/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  fetchEvents,
  createEvent,
  deleteEvent,
  upsertRsvp,
  removeRsvp,
  subscribeAgenda,
  formatEventDate,
  formatTime,
  parseLocalDate,
  todayStr,
  type AgendaEvent,
  type RsvpStatus,
  type CreateEventPayload,
} from "./agendaService";

// ─── helpers ────────────────────────────────────────────────────

function formatFullDate(dateStr: string, timeStr: string | null): string {
  const label = formatEventDate(dateStr);
  const time = formatTime(timeStr);
  return time ? `${label} · ${time}` : label;
}

/** Days from today (negative = past) */
function daysFromToday(dateStr: string): number {
  const today = parseLocalDate(todayStr());
  const ev = parseLocalDate(dateStr);
  return Math.round((ev.getTime() - today.getTime()) / 86_400_000);
}

function DaysChip({ dateStr }: { dateStr: string }) {
  const days = daysFromToday(dateStr);
  if (days < 0) return null;
  if (days === 0)
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(201,165,90,0.18)] text-(--gold) tracking-wide">
        HOJE
      </span>
    );
  if (days === 1)
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(201,165,90,0.1)] text-(--gold-dark) tracking-wide">
        AMANHÃ
      </span>
    );
  return (
    <span className="text-[10px] text-(--text-muted) px-1.5 py-0.5 rounded-full bg-[rgba(255,255,255,0.04)]">
      em {days}d
    </span>
  );
}

// ─── RsvpRow ────────────────────────────────────────────────────

function RsvpRow({
  event,
  onRsvp,
}: {
  event: AgendaEvent;
  onRsvp: (status: RsvpStatus | null) => void;
}) {
  const { user } = useAuth();
  if (!user) return null;

  const current = event.my_rsvp;

  const btn = (
    status: RsvpStatus,
    label: string,
    icon: string,
    activeClass: string,
  ) => {
    const isActive = current === status;
    return (
      <button
        onClick={() => onRsvp(isActive ? null : status)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all
          ${isActive ? activeClass : "text-(--text-muted) bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"}`}
      >
        <span className="text-sm leading-none">{icon}</span>
        {label}
        {isActive && <span className="text-[10px] opacity-70">✓</span>}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[rgba(255,255,255,0.05)]">
      <span className="text-xs text-(--text-muted) mr-0.5">Você vai?</span>
      {btn(
        "confirmed",
        "Vou!",
        "✅",
        "text-emerald-400 bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.25)]",
      )}
      {btn(
        "maybe",
        "Talvez",
        "🤔",
        "text-amber-400 bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.25)]",
      )}
    </div>
  );
}

// ─── AvatarStack ────────────────────────────────────────────────

function AvatarStack({
  rsvps,
  status,
}: {
  rsvps: AgendaEvent["rsvps"];
  status: RsvpStatus;
}) {
  const filtered = rsvps.filter((r) => r.status === status).slice(0, 5);
  if (!filtered.length) return null;
  return (
    <div className="flex items-center -space-x-1.5">
      {filtered.map((r) => (
        <div
          key={r.user_id}
          className="w-5 h-5 rounded-full ring-1 ring-[var(--bg-card)]"
        >
          <Avatar
            url={r.profile?.avatar_url ?? null}
            name={r.profile?.display_name ?? "?"}
            size="xs"
          />
        </div>
      ))}
    </div>
  );
}

// ─── EventCard ──────────────────────────────────────────────────

function EventCard({
  event,
  isMe,
  onDelete,
  onRsvp,
}: {
  event: AgendaEvent;
  isMe: boolean;
  onDelete: () => void;
  onRsvp: (status: RsvpStatus | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPast = event.is_past;

  return (
    <div
      className={`rounded-2xl border transition-all
        ${
          isPast
            ? "bg-[var(--bg-primary)] border-[rgba(255,255,255,0.04)] opacity-70"
            : "bg-[var(--bg-card)] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.1)]"
        }`}
    >
      {/* Main row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4"
      >
        <div className="flex items-start gap-3">
          {/* Date column */}
          <div className="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-[rgba(201,165,90,0.07)] border border-[rgba(201,165,90,0.12)]">
            <span className="text-[10px] text-(--gold-dark) uppercase font-bold tracking-wider leading-none">
              {parseLocalDate(event.event_date).toLocaleDateString("pt-BR", {
                month: "short",
              })}
            </span>
            <span className="text-lg font-bold text-(--gold) leading-tight">
              {parseLocalDate(event.event_date).getDate()}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p
                className={`font-semibold text-sm leading-snug ${isPast ? "text-(--text-muted)" : "text-(--text-primary)"}`}
              >
                {event.title}
              </p>
              <DaysChip dateStr={event.event_date} />
            </div>

            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {event.event_time && (
                <span className="flex items-center gap-1 text-xs text-(--text-muted)">
                  <span className="opacity-60">🕐</span>
                  {formatTime(event.event_time)}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1 text-xs text-(--text-muted) truncate max-w-[180px]">
                  <span className="opacity-60">📍</span>
                  {event.location}
                </span>
              )}
            </div>

            {/* RSVP summary */}
            <div className="flex items-center gap-3 mt-2">
              {event.confirmed_count > 0 && (
                <div className="flex items-center gap-1.5">
                  <AvatarStack rsvps={event.rsvps} status="confirmed" />
                  <span className="text-xs text-emerald-400/70">
                    {event.confirmed_count} confirmado
                    {event.confirmed_count !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {event.maybe_count > 0 && (
                <span className="text-xs text-amber-400/60">
                  {event.maybe_count} talvez
                </span>
              )}
              {event.confirmed_count === 0 &&
                event.maybe_count === 0 &&
                !isPast && (
                  <span className="text-xs text-(--text-muted) opacity-50 italic">
                    Nenhuma confirmação ainda
                  </span>
                )}
            </div>
          </div>

          {/* Expand + my RSVP indicator */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {event.my_rsvp === "confirmed" && (
              <span className="text-base">✅</span>
            )}
            {event.my_rsvp === "maybe" && <span className="text-base">🤔</span>}
            <span
              className={`text-xs text-(--text-muted) transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4">
          {event.description && (
            <p className="text-sm text-(--text-secondary) mb-3 leading-relaxed">
              {event.description}
            </p>
          )}

          {/* Creator */}
          <div className="flex items-center gap-1.5 mb-2">
            <Avatar
              url={event.creator?.avatar_url ?? null}
              name={event.creator?.display_name ?? "?"}
              size="xs"
            />
            <span className="text-xs text-(--text-muted)">
              Criado por{" "}
              <span className="text-(--text-secondary)">
                {event.creator?.display_name ?? "?"}
              </span>
            </span>
            <span className="text-xs text-(--text-muted) ml-auto">
              {formatFullDate(event.event_date, event.event_time)}
            </span>
          </div>

          {/* All RSVPs */}
          {event.rsvps.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {event.rsvps.map((r) => (
                <div
                  key={r.user_id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]"
                >
                  <Avatar
                    url={r.profile?.avatar_url ?? null}
                    name={r.profile?.display_name ?? "?"}
                    size="xs"
                  />
                  <span className="text-xs text-(--text-secondary)">
                    {r.profile?.display_name ?? "?"}
                  </span>
                  <span className="text-sm">
                    {r.status === "confirmed" ? "✅" : "🤔"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* RSVP buttons (only future events) */}
          {!isPast && <RsvpRow event={event} onRsvp={onRsvp} />}

          {/* Delete */}
          {isMe && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="mt-3 text-xs text-(--text-muted) hover:text-(--red) transition-colors"
            >
              ✕ Excluir evento
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CreateEventModal ────────────────────────────────────────────

function CreateEventModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (event: AgendaEvent) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Default date = today
  useEffect(() => {
    setDate(todayStr());
  }, []);

  const handleSave = async () => {
    setError("");
    if (!title.trim()) {
      setError("Título obrigatório");
      return;
    }
    if (!date) {
      setError("Data obrigatória");
      return;
    }
    if (!user) return;

    setSaving(true);
    const payload: CreateEventPayload = {
      title: title.trim(),
      location: location.trim() || null,
      event_date: date,
      event_time: time || null,
      description: desc.trim() || null,
    };
    const { data, error: err } = await createEvent(user.id, payload);
    setSaving(false);
    if (err || !data) {
      setError(err ?? "Erro ao criar evento");
      return;
    }
    onCreated(data);
  };

  const inputClass =
    "w-full py-2.5 px-3.5 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-[rgba(201,165,90,0.4)] transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--bg-deep)] rounded-t-3xl sm:rounded-3xl border border-[rgba(255,255,255,0.07)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 shadow-[0_-8px_40px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-base font-bold text-(--text-primary)"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Novo Evento
          </h2>
          <button
            onClick={onClose}
            className="text-(--text-muted) hover:text-(--text-primary) text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Title */}
          <div>
            <label className="text-xs text-(--text-muted) mb-1 block">
              Título *
            </label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Churrasco no Rolezinho"
              maxLength={100}
              className={inputClass}
            />
          </div>

          {/* Date + Time */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-(--text-muted) mb-1 block">
                Data *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </div>
            <div className="w-32">
              <label className="text-xs text-(--text-muted) mb-1 block">
                Hora
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs text-(--text-muted) mb-1 block">
              📍 Local
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Onde vai rolar?"
              maxLength={200}
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-(--text-muted) mb-1 block">
              Descrição
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Detalhes, link de grupo, etc."
              maxLength={500}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && <p className="text-xs text-(--red) px-1">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !date}
            className="mt-1 w-full py-3 rounded-xl font-bold text-sm text-(--bg-abyss) disabled:opacity-40 transition-all"
            style={{
              background:
                "linear-gradient(135deg, var(--gold-dark), var(--gold))",
            }}
          >
            {saving ? "Salvando..." : "Criar evento 📅"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

type Tab = "upcoming" | "past";

export function AgendaPage() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = async () => {
    const data = await fetchEvents(user?.id);
    setEvents(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — re-fetch on any change
  useEffect(() => {
    const ch = subscribeAgenda(() => load());
    return () => {
      ch.unsubscribe();
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRsvp = async (event: AgendaEvent, status: RsvpStatus | null) => {
    if (!user) return;

    // Optimistic
    setEvents((prev) =>
      prev.map((ev) => {
        if (ev.id !== event.id) return ev;
        const filtered = ev.rsvps.filter((r) => r.user_id !== user.id);
        const newRsvps = status
          ? [
              ...filtered,
              {
                id: "temp",
                event_id: ev.id,
                user_id: user.id,
                status,
                updated_at: new Date().toISOString(),
                profile: {
                  id: user.id,
                  display_name: profile?.display_name ?? "",
                  avatar_url: profile?.avatar_url ?? null,
                },
              },
            ]
          : filtered;
        return {
          ...ev,
          rsvps: newRsvps,
          my_rsvp: status,
          confirmed_count: newRsvps.filter((r) => r.status === "confirmed")
            .length,
          maybe_count: newRsvps.filter((r) => r.status === "maybe").length,
        };
      }),
    );

    if (status) {
      await upsertRsvp(user.id, event.id, status);
    } else {
      await removeRsvp(user.id, event.id);
    }
  };

  const handleDelete = async (eventId: string) => {
    const { error } = await deleteEvent(eventId);
    if (error) {
      showToast("Erro ao excluir evento.");
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    showToast("Evento excluído.");
  };

  const upcoming = events.filter((e) => !e.is_past);
  const past = events.filter((e) => e.is_past).reverse(); // mais recente primeiro

  const displayed = tab === "upcoming" ? upcoming : past;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-52px)]">
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <h1
              className="text-xl text-(--gold) leading-none"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Agenda
            </h1>
            <p className="text-sm text-(--text-muted) mt-1.5">
              {upcoming.length > 0
                ? `${upcoming.length} próximo${upcoming.length !== 1 ? "s" : ""} evento${upcoming.length !== 1 ? "s" : ""}`
                : "Nenhum evento próximo"}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-(--gold) transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{
              background: "rgba(201,165,90,0.12)",
              border: "1px solid rgba(201,165,90,0.2)",
            }}
          >
            <span className="text-base leading-none">+</span> Evento
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 mb-4 flex gap-2">
        {(["upcoming", "past"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-xl text-sm font-medium transition-all"
            style={
              tab === t
                ? {
                    background: "rgba(201,165,90,0.18)",
                    color: "var(--gold)",
                    border: "1px solid rgba(201,165,90,0.3)",
                  }
                : {
                    background: "var(--bg-card)",
                    color: "var(--text-muted)",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }
            }
          >
            {t === "upcoming"
              ? `Próximos${upcoming.length ? ` · ${upcoming.length}` : ""}`
              : `Finalizados${past.length ? ` · ${past.length}` : ""}`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-5 pb-8 max-w-[540px] mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-4xl opacity-30">
              {tab === "upcoming" ? "📅" : "📋"}
            </span>
            <p className="text-sm text-(--text-muted) text-center">
              {tab === "upcoming"
                ? "Nenhum evento na agenda ainda."
                : "Nenhum evento finalizado."}
            </p>
            {tab === "upcoming" && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-1 px-4 py-2 rounded-xl text-sm font-bold text-(--gold) transition-all hover:-translate-y-0.5"
                style={{
                  background: "rgba(201,165,90,0.12)",
                  border: "1px solid rgba(201,165,90,0.2)",
                }}
              >
                Criar primeiro evento 📅
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {displayed.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isMe={event.created_by === user?.id}
                onDelete={() => handleDelete(event.id)}
                onRsvp={(status) => handleRsvp(event, status)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateEventModal
          onClose={() => setShowCreate(false)}
          onCreated={(ev) => {
            setEvents((prev) => {
              const next = [...prev, ev].sort((a, b) => {
                if (a.event_date !== b.event_date)
                  return a.event_date.localeCompare(b.event_date);
                return (a.event_time ?? "").localeCompare(b.event_time ?? "");
              });
              return next;
            });
            setShowCreate(false);
            showToast("Evento criado! 📅");
          }}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium text-(--text-primary) shadow-[0_4px_20px_rgba(0,0,0,0.5)] pointer-events-none"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
