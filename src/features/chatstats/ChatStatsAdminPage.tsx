import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/lib/useAdmin";
import { fetchAppUsers, type AppUser } from "@/features/wrapped/wrappedService";
import {
  deleteChatStats,
  fetchChatStatsList,
  fetchChatStatsViewerCounts,
  fetchChatStatsViewers,
  saveChatStats,
  saveChatStatsViewers,
} from "./chatStatsService";
import { parseChatStats } from "./chatStatsLogic";
import type { ChatStats } from "./chatStatsTypes";

interface Panel {
  slug: string;
  users: AppUser[];
  selected: Set<string>;
  filter: string;
}

export function ChatStatsAdminPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();
  const [list, setList] = useState<ChatStats[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [json, setJson] = useState("");
  const [active, setActive] = useState(true);
  const [messages, setMessages] = useState<{ kind: "error" | "warn" | "ok"; text: string }[]>([]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [panelMsg, setPanelMsg] = useState("");

  const reload = useCallback(async () => {
    const [l, c] = await Promise.all([fetchChatStatsList(), fetchChatStatsViewerCounts()]);
    setList(l);
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

  if (adminLoading) return null;
  if (!isAdmin) return <p className="p-6 text-center text-(--text-secondary)">Acesso restrito ao administrador.</p>;

  const onSave = async () => {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      return setMessages([{ kind: "error", text: `JSON inválido: ${(e as Error).message}` }]);
    }
    const { stats, errors, warnings } = parseChatStats(raw);
    const msgs = [
      ...errors.map((text) => ({ kind: "error" as const, text })),
      ...warnings.map((text) => ({ kind: "warn" as const, text })),
    ];
    if (!stats) return setMessages(msgs);
    const { error } = await saveChatStats({ ...stats, isActive: active });
    if (error) return setMessages([...msgs, { kind: "error", text: `Erro ao salvar: ${error}` }]);
    setMessages([...msgs, { kind: "ok", text: `Snapshot "${stats.slug}" salvo. Escolha quem pode ver em "Quem vê".` }]);
    reload();
  };

  const onDelete = async (slug: string) => {
    if (!window.confirm(`Excluir o snapshot "${slug}"?`)) return;
    await deleteChatStats(slug);
    if (panel?.slug === slug) setPanel(null);
    reload();
  };

  const toggleActive = async (s: ChatStats) => {
    await saveChatStats({ ...s, isActive: !s.isActive });
    reload();
  };

  const openViewers = async (slug: string) => {
    setPanelMsg("");
    const [users, ids] = await Promise.all([fetchAppUsers(), fetchChatStatsViewers(slug)]);
    setPanel({ slug, users, selected: new Set(ids), filter: "" });
  };

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
    const { error } = await saveChatStatsViewers(panel.slug, [...panel.selected]);
    setPanelMsg(error ? `Erro ao salvar: ${error}` : `Lista salva: ${panel.selected.size} pessoa(s) podem ver.`);
    if (!error) reload();
  };

  return (
    <div className="max-w-[640px] mx-auto px-5 py-6 flex flex-col gap-4">
      <h1 className="text-xl text-(--text-primary)" style={{ fontFamily: "var(--font-display)" }}>
        Estatísticas do chat
      </h1>
      <p className="text-xs text-(--text-muted)">
        Gere o JSON com <code>scripts/chat-insights/run_insights.py</code> (ou use <code>--upload</code> para enviar direto).
        Só aparece no app para quem estiver marcado e com o modo desenvolvedor ligado.
      </p>

      <ul className="flex flex-col gap-2">
        {list.length === 0 && <li className="text-sm text-(--text-muted)">Nenhum snapshot salvo.</li>}
        {list.map((s) => (
          <li key={s.slug} className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-(--bg-card) border border-[rgba(255,255,255,0.06)]">
            <span className="flex-1 min-w-[12rem]">
              <span className="font-semibold text-(--text-primary)">{s.title}</span>
              <span className="block text-xs text-(--text-muted)">
                {s.slug} · {s.isActive ? "ativo" : "rascunho"} · {s.totalMessages} mensagens · {counts[s.slug] ?? 0}{" "}
                {(counts[s.slug] ?? 0) === 1 ? "pessoa vê" : "pessoas veem"}
              </span>
            </span>
            <button className="text-sm text-(--gold)" onClick={() => openViewers(s.slug)}>Quem vê</button>
            <button className="text-sm text-(--gold)" onClick={() => toggleActive(s)}>{s.isActive ? "Desativar" : "Ativar"}</button>
            <button className="text-sm text-(--gold)" onClick={() => navigate(`/estatisticas/${s.slug}`)}>Ver</button>
            <button className="text-sm text-(--red)" onClick={() => onDelete(s.slug)}>Excluir</button>
          </li>
        ))}
      </ul>

      {panel && (
        <section aria-label={`Quem vê ${panel.slug}`} className="flex flex-col gap-3 p-4 rounded-xl bg-(--bg-card) border border-[rgba(201,165,90,0.25)]">
          <h2 className="text-base text-(--text-primary)">Quem pode ver “{panel.slug}”</h2>
          <p className="text-xs text-(--text-muted)">Ninguém marcado = ninguém além de você (admin).</p>
          <input
            aria-label="Buscar usuário"
            placeholder="Buscar pelo nome…"
            value={panel.filter}
            onChange={(ev) => setPanel({ ...panel, filter: ev.target.value })}
            className="w-full p-2 rounded-lg bg-(--bg-elevated) text-(--text-primary) border border-[rgba(255,255,255,0.08)]"
          />
          <div className="flex gap-3 text-sm">
            <button className="text-(--gold)" onClick={() => setMany(panel.users.map((u) => u.id), true)}>Selecionar todos</button>
            <button className="text-(--gold)" onClick={() => setMany(panel.users.map((u) => u.id), false)}>Limpar</button>
            <span className="ml-auto text-(--text-muted)">{panel.selected.size} de {panel.users.length}</span>
          </div>
          <ul className="flex flex-col max-h-72 overflow-y-auto">
            {shownUsers.length === 0 && <li className="text-sm text-(--text-muted)">Nenhum usuário encontrado.</li>}
            {shownUsers.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-3 py-2 cursor-pointer text-(--text-primary)">
                  <input type="checkbox" checked={panel.selected.has(u.id)} onChange={() => setMany([u.id], !panel.selected.has(u.id))} />
                  {u.displayName}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <button onClick={onSaveViewers} className="px-4 py-2 rounded-full font-semibold bg-(--gold) text-(--bg-abyss)">Salvar quem vê</button>
            <button onClick={() => setPanel(null)} className="text-sm text-(--text-secondary)">Fechar</button>
            <span role="status" className="text-sm text-(--text-secondary)">{panelMsg}</span>
          </div>
        </section>
      )}

      <label className="text-sm text-(--text-secondary)" htmlFor="chatstats-json">JSON do snapshot</label>
      <textarea
        id="chatstats-json"
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder="Cole aqui o conteúdo de chat_stats.json"
        spellCheck={false}
        rows={14}
        className="w-full p-3 rounded-xl bg-(--bg-card) text-(--text-primary) border border-[rgba(255,255,255,0.08)]"
        style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
      />
      <label className="flex items-center gap-2 text-sm text-(--text-secondary)">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo (visível a quem está na lista)
      </label>
      <button onClick={onSave} className="self-start px-5 py-2.5 rounded-full font-semibold bg-(--gold) text-(--bg-abyss)">
        Validar e salvar
      </button>
      <ul className="flex flex-col gap-1" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className="text-sm" style={{ color: m.kind === "error" ? "var(--red)" : m.kind === "ok" ? "var(--green)" : "var(--gold)" }}>
            {m.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
