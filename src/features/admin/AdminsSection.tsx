import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { adminCandidates, removeBlockReason } from "./adminLogic";
import { addAdmin, fetchAdminIds, fetchUsers, removeAdmin } from "./adminService";
import type { AdminUser } from "./adminTypes";

/** Quem é administrador: lista, adiciona entre os usuários do app e remove (nunca o último, nunca a si mesmo). */
export function AdminsSection() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [adminIds, setAdminIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [u, a] = await Promise.all([fetchUsers(), fetchAdminIds()]);
    setUsers(u);
    setAdminIds(a);
    setLoaded(true);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial assíncrona
    reload();
  }, [reload]);

  const admins = useMemo(() => users.filter((u) => adminIds.includes(u.id)), [users, adminIds]);
  const candidates = useMemo(() => adminCandidates(users, adminIds, query), [users, adminIds, query]);

  const onAdd = async (u: AdminUser) => {
    const { error } = await addAdmin(u.id, user!.id);
    setMsg(error ? { ok: false, text: `Erro: ${error}` } : { ok: true, text: `${u.displayName} agora é administrador.` });
    if (!error) reload();
  };

  const onRemove = async (u: AdminUser) => {
    if (!window.confirm(`Remover ${u.displayName} dos administradores?`)) return;
    const { error } = await removeAdmin(u.id);
    setMsg(error ? { ok: false, text: `Erro: ${error}` } : { ok: true, text: `${u.displayName} não é mais administrador.` });
    if (!error) reload();
  };

  return (
    <div className="px-5 pt-6 pb-10 max-w-[540px] mx-auto w-full flex flex-col gap-4">
      <h1 className="text-xl text-(--gold) leading-none" style={{ fontFamily: "var(--font-display)" }}>
        Administradores
      </h1>
      <p className="text-sm text-(--text-muted)">
        Admins acessam este painel e alteram as configurações do app. Sempre fica pelo menos um.
      </p>

      {msg && (
        <p role="status" className={`text-sm rounded-xl px-3 py-2 border ${msg.ok ? "text-emerald-400 border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.1)]" : "text-(--red) border-[rgba(196,64,64,0.25)] bg-[rgba(196,64,64,0.1)]"}`}>
          {msg.text}
        </p>
      )}

      <section aria-label="Administradores atuais" className="flex flex-col gap-2">
        {loaded && admins.length === 0 && <p className="text-sm text-(--text-muted)">Nenhum administrador visível.</p>}
        {admins.map((a) => {
          const block = removeBlockReason(adminIds, a.id, user?.id);
          return (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-(--bg-card) border border-[rgba(255,255,255,0.06)]">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-(--text-primary) truncate">
                  {a.displayName}
                  {a.id === user?.id && <span className="ml-2 text-xs text-(--gold)">(você)</span>}
                </span>
                <span className="block text-xs text-(--text-muted) truncate">{a.email}</span>
              </span>
              <button
                onClick={() => onRemove(a)}
                disabled={!!block}
                title={block ?? undefined}
                aria-label={`Remover ${a.displayName}`}
                className="text-sm text-(--red) disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remover
              </button>
            </div>
          );
        })}
      </section>

      <section aria-label="Adicionar administrador" className="flex flex-col gap-2">
        <h2 className="text-base text-(--text-primary)">Adicionar</h2>
        <input
          aria-label="Buscar usuário"
          placeholder="Buscar pelo nome ou e-mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full p-2 rounded-lg bg-(--bg-elevated) text-(--text-primary) border border-[rgba(255,255,255,0.08)]"
        />
        <ul className="flex flex-col max-h-64 overflow-y-auto">
          {candidates.length === 0 && <li className="text-sm text-(--text-muted)">Nenhum usuário disponível.</li>}
          {candidates.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2">
              <span className="flex-1 min-w-0">
                <span className="block text-(--text-primary) truncate">{u.displayName}</span>
                <span className="block text-xs text-(--text-muted) truncate">{u.email}</span>
              </span>
              <button onClick={() => onAdd(u)} aria-label={`Tornar ${u.displayName} administrador`} className="text-sm text-(--gold)">
                Tornar admin
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
