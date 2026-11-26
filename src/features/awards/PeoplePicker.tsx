import { useEffect, useMemo, useState } from "react";
import { fetchAppUsers, fetchPeople, savePeople, type AwardsPeopleList } from "./awardsService";
import type { AwardsUser } from "./awardsTypes";

const field =
  "w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]";

/** Lista recolhível de usuários do app com busca, para montar "quem vê" ou "admins do awards". */
export function PeoplePicker({
  table,
  slug,
  listName,
  countLabel,
  saveLabel,
  savedMessage,
  emptyHint,
  startOpen = false,
}: {
  table: AwardsPeopleList;
  slug: string;
  /** Usado em "Mostrar/Recolher lista de …" e no rótulo da busca. */
  listName: string;
  countLabel: (n: number) => string;
  saveLabel: string;
  savedMessage: (n: number) => string;
  emptyHint: string;
  startOpen?: boolean;
}) {
  const [users, setUsers] = useState<AwardsUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(startOpen);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchAppUsers(), fetchPeople(table, slug)]).then(([u, ids]) => {
      if (!alive) return;
      setUsers(u);
      setSelected(new Set(ids));
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [table, slug]);

  const shown = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("pt-BR");
    return q ? users.filter((u) => u.displayName.toLocaleLowerCase("pt-BR").includes(q)) : users;
  }, [users, filter]);

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
    const { error } = await savePeople(table, slug, [...selected]);
    setMsg(error ? { kind: "error", text: error } : { kind: "ok", text: savedMessage(selected.size) });
    if (!error) setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between text-xs text-[var(--gold)] py-1"
      >
        <span>{open ? `Recolher lista de ${listName}` : `Mostrar lista de ${listName}`}</span>
        <span className="text-[var(--text-muted)]">
          {countLabel(selected.size)} {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <>
          <input aria-label={`Buscar em ${listName}`} placeholder="Buscar pessoa…" value={filter} onChange={(e) => setFilter(e.target.value)} className={field} />
          <div className="flex gap-3 text-xs text-[var(--gold)]">
            <button onClick={() => setMany(shown.map((u) => u.id), true)}>Marcar todos</button>
            <button onClick={() => setMany(shown.map((u) => u.id), false)}>Limpar</button>
          </div>
          <ul className="max-h-60 overflow-y-auto flex flex-col gap-1">
            {shown.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] py-1">
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => setMany([u.id], !selected.has(u.id))} />
                  {u.displayName}
                </label>
              </li>
            ))}
          </ul>
          {/* Salvar antes de a lista atual chegar apagaria quem já estava marcado. */}
          <button onClick={() => void save()} disabled={!loaded} className="py-2 rounded-xl font-semibold text-black bg-[var(--gold)] text-sm disabled:opacity-50">
            {saveLabel}
          </button>
        </>
      )}
      {loaded && selected.size === 0 && <p className="text-xs text-[var(--text-muted)]">{emptyHint}</p>}
      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={`text-xs ${msg.kind === "error" ? "text-red-400" : "text-[var(--gold)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
