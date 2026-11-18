import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isAdminUser } from "@/lib/admin";
import {
  deleteEdition,
  fetchAppUsers,
  fetchEditions,
  fetchViewerCounts,
  fetchViewers,
  saveEdition,
  saveViewers,
  type AppUser,
} from "./wrappedService";
import { SAMPLE_EDITION_JSON, isEditionLive, parseEdition } from "./wrappedLogic";
import type { WrappedEdition } from "./wrappedTypes";

interface ViewersPanel {
  slug: string;
  users: AppUser[];
  selected: Set<string>;
  filter: string;
}

export function WrappedAdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editions, setEditions] = useState<WrappedEdition[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [json, setJson] = useState(SAMPLE_EDITION_JSON);
  const [messages, setMessages] = useState<{ kind: "error" | "warn" | "ok"; text: string }[]>([]);
  const [panel, setPanel] = useState<ViewersPanel | null>(null);
  const [panelMsg, setPanelMsg] = useState("");

  const reload = useCallback(async () => {
    const [e, c] = await Promise.all([fetchEditions(), fetchViewerCounts()]);
    setEditions(e);
    setCounts(c);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial assíncrona
    reload();
  }, [reload]);

  const shownUsers = useMemo(() => {
    if (!panel) return [];
    const q = panel.filter.trim().toLocaleLowerCase("pt-BR");
    return q ? panel.users.filter((u) => u.displayName.toLocaleLowerCase("pt-BR").includes(q)) : panel.users;
  }, [panel]);

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
    setMessages([...msgs, { kind: "ok", text: `Edição "${edition.slug}" salva. Escolha quem pode ver em "Quem vê".` }]);
    reload();
  };

  const onDelete = async (slug: string) => {
    if (!window.confirm(`Excluir a edição "${slug}"?`)) return;
    await deleteEdition(slug);
    if (panel?.slug === slug) setPanel(null);
    reload();
  };

  const openViewers = async (slug: string) => {
    setPanelMsg("");
    const [users, ids] = await Promise.all([fetchAppUsers(), fetchViewers(slug)]);
    setPanel({ slug, users, selected: new Set(ids), filter: "" });
  };

  const toggle = (id: string) =>
    setPanel((p) => {
      if (!p) return p;
      const selected = new Set(p.selected);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...p, selected };
    });

  const setMany = (ids: string[], on: boolean) =>
    setPanel((p) => {
      if (!p) return p;
      const selected = new Set(p.selected);
      for (const id of ids) {
        if (on) selected.add(id);
        else selected.delete(id);
      }
      return { ...p, selected };
    });

  const onSaveViewers = async () => {
    if (!panel) return;
    const { error } = await saveViewers(panel.slug, [...panel.selected]);
    setPanelMsg(error ? `Erro ao salvar: ${error}` : `Lista salva: ${panel.selected.size} pessoa(s) podem ver.`);
    if (!error) reload();
  };

  return (
    <div className="max-w-[640px] mx-auto px-5 py-6 flex flex-col gap-4">
      <h1 className="text-xl text-(--text-primary)" style={{ fontFamily: "var(--font-display)" }}>
        Wrapped — edições
      </h1>

      <ul className="flex flex-col gap-2">
        {editions.length === 0 && <li className="text-sm text-(--text-muted)">Nenhuma edição salva.</li>}
        {editions.map((e) => (
          <li key={e.slug} className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-(--bg-card) border border-[rgba(255,255,255,0.06)]">
            <span className="flex-1 min-w-[12rem]">
              <span className="font-semibold text-(--text-primary)">{e.pageTitle}</span>
              <span className="block text-xs text-(--text-muted)">
                {e.slug} · {!e.isActive ? "rascunho" : isEditionLive(e) ? "no ar" : "agendada/encerrada"}
                {(e.startsAt || e.endsAt) && ` · ${e.startsAt ?? "…"} a ${e.endsAt ?? "…"}`} · {e.slides.length} slides ·{" "}
                {counts[e.slug] ?? 0} {(counts[e.slug] ?? 0) === 1 ? "pessoa vê" : "pessoas veem"}
              </span>
            </span>
            <button className="text-sm text-(--gold)" onClick={() => openViewers(e.slug)}>
              Quem vê
            </button>
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

      {panel && (
        <section aria-label={`Quem vê a edição ${panel.slug}`} className="flex flex-col gap-3 p-4 rounded-xl bg-(--bg-card) border border-[rgba(201,165,90,0.25)]">
          <h2 className="text-base text-(--text-primary)">Quem pode ver “{panel.slug}”</h2>
          <p className="text-xs text-(--text-muted)">
            Só quem estiver marcado vê o Wrapped (você, admin, sempre vê). Ninguém marcado = ninguém além de você.
          </p>
          <input
            aria-label="Buscar usuário"
            placeholder="Buscar pelo nome…"
            value={panel.filter}
            onChange={(ev) => setPanel({ ...panel, filter: ev.target.value })}
            className="w-full p-2 rounded-lg bg-(--bg-elevated) text-(--text-primary) border border-[rgba(255,255,255,0.08)]"
          />
          <div className="flex gap-3 text-sm">
            <button className="text-(--gold)" onClick={() => setMany(panel.users.map((u) => u.id), true)}>
              Selecionar todos
            </button>
            <button className="text-(--gold)" onClick={() => setMany(panel.users.map((u) => u.id), false)}>
              Limpar
            </button>
            <span className="ml-auto text-(--text-muted)">{panel.selected.size} de {panel.users.length}</span>
          </div>
          <ul className="flex flex-col max-h-72 overflow-y-auto">
            {shownUsers.length === 0 && <li className="text-sm text-(--text-muted)">Nenhum usuário encontrado.</li>}
            {shownUsers.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-3 py-2 cursor-pointer text-(--text-primary)">
                  <input type="checkbox" checked={panel.selected.has(u.id)} onChange={() => toggle(u.id)} />
                  {u.displayName}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <button onClick={onSaveViewers} className="px-4 py-2 rounded-full font-semibold bg-(--gold) text-(--bg-abyss)">
              Salvar quem vê
            </button>
            <button onClick={() => setPanel(null)} className="text-sm text-(--text-secondary)">
              Fechar
            </button>
            <span role="status" className="text-sm text-(--text-secondary)">{panelMsg}</span>
          </div>
        </section>
      )}

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
