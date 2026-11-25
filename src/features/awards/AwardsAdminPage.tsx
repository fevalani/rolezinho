import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/lib/useAdmin";
import { PHASES, PHASE_LABEL } from "./awardsLogic";
import {
  deleteEdition,
  fetchAppUsers,
  fetchContent,
  fetchEditions,
  fetchViewers,
  reorderCategories,
  saveEdition,
  saveViewers,
  setAudience,
  setPhase,
} from "./awardsService";
import type { AwardsAudience, AwardsCategory, AwardsEdition, AwardsPhase, AwardsUser } from "./awardsTypes";

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;
const field =
  "w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]";


/** "Quem vê": todos ou pessoas escolhidas (lista de usuários do app, valendo no banco via RLS). */
function AudiencePanel({ edition, onChanged }: { edition: AwardsEdition; onChanged: () => void }) {
  const [users, setUsers] = useState<AwardsUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [listOpen, setListOpen] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const isSelected = edition.audience === "selected";

  useEffect(() => {
    if (!isSelected) return;
    let alive = true;
    Promise.all([fetchAppUsers(), fetchViewers(edition.slug)]).then(([u, ids]) => {
      if (!alive) return;
      setUsers(u);
      setSelected(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, [isSelected, edition.slug]);

  const shown = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("pt-BR");
    return q ? users.filter((u) => u.displayName.toLocaleLowerCase("pt-BR").includes(q)) : users;
  }, [users, filter]);

  const choose = async (audience: AwardsAudience) => {
    const { error } = await setAudience(edition.slug, audience);
    setMsg(error ? { kind: "error", text: error } : null);
    if (!error) onChanged();
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const save = async () => {
    const { error } = await saveViewers(edition.slug, [...selected]);
    setMsg(error ? { kind: "error", text: error } : { kind: "ok", text: `Salvo: ${selected.size} pessoa(s) podem ver.` });
    if (!error) setListOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-[var(--text-muted)]">Quem vê (depois que sair de “Oculto”)</span>
      <div className="flex gap-1.5" role="group" aria-label="Quem vê">
        {(["all", "selected"] as const).map((a) => (
          <button
            key={a}
            onClick={() => void choose(a)}
            aria-pressed={edition.audience === a}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              edition.audience === a
                ? "bg-[var(--gold)] text-black border-[var(--gold)] font-semibold"
                : "border-[rgba(255,255,255,0.12)] text-[var(--text-muted)]"
            }`}
          >
            {a === "all" ? "Todos" : "Pessoas escolhidas"}
          </button>
        ))}
      </div>

      {isSelected && (
        <div className="flex flex-col gap-2 mt-1">
          <button
            onClick={() => setListOpen((o) => !o)}
            aria-expanded={listOpen}
            className="flex items-center justify-between text-xs text-[var(--gold)] py-1"
          >
            <span>{listOpen ? "Recolher lista de pessoas" : "Mostrar lista de pessoas"}</span>
            <span className="text-[var(--text-muted)]">
              {selected.size} selecionada(s) {listOpen ? "▴" : "▾"}
            </span>
          </button>
          {listOpen && (
            <>
              <input aria-label="Buscar pessoa" placeholder="Buscar pessoa…" value={filter} onChange={(e) => setFilter(e.target.value)} className={field} />
              <div className="flex gap-3 text-xs text-[var(--gold)]">
                <button onClick={() => setMany(shown.map((u) => u.id), true)}>Marcar todos</button>
                <button onClick={() => setMany(shown.map((u) => u.id), false)}>Limpar</button>
              </div>
              <ul className="max-h-60 overflow-y-auto flex flex-col gap-1">
                {shown.map((u) => (
                  <li key={u.id}>
                    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] py-1">
                      <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                      {u.displayName}
                    </label>
                  </li>
                ))}
              </ul>
              <button onClick={() => void save()} className="py-2 rounded-xl font-semibold text-black bg-[var(--gold)] text-sm">
                Salvar quem vê
              </button>
            </>
          )}
          {selected.size === 0 && <p className="text-xs text-[var(--text-muted)]">Sem ninguém marcado, só o admin vê.</p>}
        </div>
      )}
      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={`text-xs ${msg.kind === "error" ? "text-red-400" : "text-[var(--gold)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function EditionRow({ edition, onChanged }: { edition: AwardsEdition; onChanged: () => void }) {
  const [cats, setCats] = useState<AwardsCategory[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCats = useCallback(async () => {
    const { data } = await fetchContent(edition.slug);
    setCats([...data.categories].sort((a, b) => a.position - b.position));
  }, [edition.slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga assíncrona ao abrir
    if (open) void loadCats();
  }, [open, loadCats]);

  const changePhase = async (phase: AwardsPhase) => {
    const { error: err } = await setPhase(edition.slug, phase);
    setError(err);
    if (!err) onChanged();
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cats.length) return;
    const next = [...cats];
    [next[i], next[j]] = [next[j], next[i]];
    setCats(next);
    const { error: err } = await reorderCategories(next.map((c) => c.id));
    setError(err);
  };

  const remove = async () => {
    if (!window.confirm(`Apagar a edição "${edition.title}" com todas as categorias, indicados e votos?`)) return;
    const { error: err } = await deleteEdition(edition.slug);
    setError(err);
    if (!err) onChanged();
  };

  return (
    <li className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{edition.title}</p>
          <p className="text-xs text-[var(--text-muted)]">/{edition.slug}</p>
        </div>
        <button onClick={() => void remove()} aria-label={`Apagar ${edition.title}`} className="p-2 text-[var(--text-muted)]">
          🗑️
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fase">
        {PHASES.map((p) => (
          <button
            key={p}
            onClick={() => void changePhase(p)}
            aria-pressed={edition.phase === p}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              edition.phase === p
                ? "bg-[var(--gold)] text-black border-[var(--gold)] font-semibold"
                : "border-[rgba(255,255,255,0.12)] text-[var(--text-muted)]"
            }`}
          >
            {PHASE_LABEL[p]}
          </button>
        ))}
      </div>

      <AudiencePanel edition={edition} onChanged={onChanged} />

      <button onClick={() => setOpen((o) => !o)} className="text-xs text-[var(--gold)] text-left">
        {open ? "Ocultar categorias" : "Ver e reordenar categorias"}
      </button>
      {open && (
        <ol className="flex flex-col gap-1.5">
          {cats.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
              <span className="flex-1 min-w-0 truncate">{c.title}</span>
              <button onClick={() => void move(i, -1)} disabled={i === 0} aria-label={`Subir ${c.title}`} className="px-2 disabled:opacity-30">
                ↑
              </button>
              <button onClick={() => void move(i, 1)} disabled={i === cats.length - 1} aria-label={`Descer ${c.title}`} className="px-2 disabled:opacity-30">
                ↓
              </button>
            </li>
          ))}
          {!cats.length && <li className="text-xs text-[var(--text-muted)]">Sem categorias.</li>}
        </ol>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

/** /admin/awards: criar edições, trocar a fase e reordenar categorias. Editar/apagar itens: pela própria tela do Awards (admin pode tudo). */
export function AwardsAdminPage() {
  const { isAdmin, loading } = useAdmin();
  const [editions, setEditions] = useState<AwardsEdition[]>([]);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setEditions(await fetchEditions()), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial assíncrona
    void load();
  }, [load]);

  if (loading) return null;
  if (!isAdmin) return <p className="p-4 text-sm text-[var(--text-muted)]">Acesso restrito ao administrador.</p>;

  const create = async () => {
    const s = slug.trim();
    if (!SLUG_RE.test(s)) return setError("Slug inválido: use letras, números e hífen (até 40).");
    if (!title.trim()) return setError("Dê um título.");
    const { error: err } = await saveEdition({ slug: s, title: title.trim(), subtitle: null, phase: "hidden", audience: "all" });
    setError(err);
    if (!err) {
      setSlug("");
      setTitle("");
      await load();
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 max-w-lg mx-auto">
      <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-2">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Nova edição</p>
        <input aria-label="Slug" placeholder="slug (ex: 2026)" value={slug} onChange={(e) => setSlug(e.target.value)} className={field} />
        <input aria-label="Título" placeholder="Título (ex: Awards 2026)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={field} />
        <button onClick={() => void create()} className="py-2 rounded-xl font-semibold text-black bg-[var(--gold)] text-sm">
          Criar (começa oculta)
        </button>
        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {editions.map((e) => (
          <EditionRow key={e.slug} edition={e} onChanged={() => void load()} />
        ))}
      </ul>
      {!editions.length && <p className="text-sm text-[var(--text-muted)] text-center">Nenhuma edição ainda.</p>}
    </div>
  );
}
