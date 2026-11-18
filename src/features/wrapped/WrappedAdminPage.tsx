import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isAdminUser } from "@/lib/admin";
import { deleteEdition, fetchEditions, saveEdition } from "./wrappedService";
import { SAMPLE_EDITION_JSON, isEditionLive, parseEdition } from "./wrappedLogic";
import type { WrappedEdition } from "./wrappedTypes";

export function WrappedAdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editions, setEditions] = useState<WrappedEdition[]>([]);
  const [json, setJson] = useState(SAMPLE_EDITION_JSON);
  const [messages, setMessages] = useState<{ kind: "error" | "warn" | "ok"; text: string }[]>([]);

  const reload = useCallback(async () => setEditions(await fetchEditions()), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial assíncrona
    reload();
  }, [reload]);

  if (!isAdminUser(user)) {
    return <p className="p-6 text-center text-(--text-secondary)">Acesso restrito ao administrador.</p>;
  }

  const onSave = async () => {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      return setMessages([{ kind: "error", text: `JSON inválido: ${(e as Error).message}` }]);
    }
    const { edition, errors, warnings } = parseEdition(raw);
    const msgs = [
      ...errors.map((text) => ({ kind: "error" as const, text })),
      ...warnings.map((text) => ({ kind: "warn" as const, text })),
    ];
    if (!edition) return setMessages(msgs);
    const { error } = await saveEdition(edition, user!.id);
    if (error) return setMessages([...msgs, { kind: "error", text: `Erro ao salvar: ${error}` }]);
    setMessages([...msgs, { kind: "ok", text: `Edição "${edition.slug}" salva.` }]);
    reload();
  };

  const onDelete = async (slug: string) => {
    if (!window.confirm(`Excluir a edição "${slug}"?`)) return;
    await deleteEdition(slug);
    reload();
  };

  return (
    <div className="max-w-[640px] mx-auto px-5 py-6 flex flex-col gap-4">
      <h1 className="text-xl text-(--text-primary)" style={{ fontFamily: "var(--font-display)" }}>
        Wrapped — edições
      </h1>

      <ul className="flex flex-col gap-2">
        {editions.length === 0 && <li className="text-sm text-(--text-muted)">Nenhuma edição salva.</li>}
        {editions.map((e) => (
          <li key={e.slug} className="flex items-center gap-2 p-3 rounded-xl bg-(--bg-card) border border-[rgba(255,255,255,0.06)]">
            <span className="flex-1 min-w-0">
              <span className="font-semibold text-(--text-primary)">{e.pageTitle}</span>
              <span className="block text-xs text-(--text-muted)">
                {e.slug} · {!e.isActive ? "rascunho" : isEditionLive(e) ? "no ar" : "agendada/encerrada"}
                {(e.startsAt || e.endsAt) && ` · ${e.startsAt ?? "…"} a ${e.endsAt ?? "…"}`} · {e.slides.length} slides
              </span>
            </span>
            <button className="text-sm text-(--gold)" onClick={() => setJson(JSON.stringify(e, null, 2))}>
              Editar
            </button>
            <button className="text-sm text-(--gold)" onClick={() => navigate(`/wrapped/${e.slug}`)}>
              Ver
            </button>
            <button className="text-sm text-(--red)" onClick={() => onDelete(e.slug)}>
              Excluir
            </button>
          </li>
        ))}
      </ul>

      <label className="text-sm text-(--text-secondary)" htmlFor="wrapped-json">
        JSON da edição
      </label>
      <textarea
        id="wrapped-json"
        value={json}
        onChange={(e) => setJson(e.target.value)}
        spellCheck={false}
        rows={18}
        className="w-full p-3 rounded-xl bg-(--bg-card) text-(--text-primary) border border-[rgba(255,255,255,0.08)]"
        style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
      />
      <button
        onClick={onSave}
        className="self-start px-5 py-2.5 rounded-full font-semibold bg-(--gold) text-(--bg-abyss)"
      >
        Validar e salvar
      </button>

      <ul className="flex flex-col gap-1" aria-live="polite">
        {messages.map((m, i) => (
          <li
            key={i}
            className="text-sm"
            style={{ color: m.kind === "error" ? "var(--red)" : m.kind === "ok" ? "var(--green)" : "var(--gold)" }}
          >
            {m.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
