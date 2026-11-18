import { useEffect, useMemo, useState } from "react";
import { filterUsers, isOutdated, lastSeenLabel, parseWebVersion, sortByLastSeen, summarizeUsers } from "./adminLogic";
import { fetchUsers } from "./adminService";
import type { AdminUser } from "./adminTypes";

/** Quem usa o app: versão do código que abriu por último e quando foi a última abertura. */
export function UsersSection() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState("");
  const current = import.meta.env.VITE_APP_VERSION as string | undefined;

  useEffect(() => {
    let alive = true;
    fetchUsers().then((u) => alive && setUsers(u));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => sortByLastSeen(filterUsers(users ?? [], query)), [users, query]);
  const sum = useMemo(() => summarizeUsers(users ?? [], current), [users, current]);

  return (
    <div className="px-5 pt-6 pb-10 max-w-[540px] mx-auto w-full flex flex-col gap-4">
      <h1 className="text-xl text-(--gold) leading-none" style={{ fontFamily: "var(--font-display)" }}>
        Usuários
      </h1>
      {users && (
        <p className="text-sm text-(--text-muted)" aria-label="Resumo">
          {sum.total} usuários · {sum.activeLast7d} abriram nos últimos 7 dias
          {current ? ` · ${sum.outdated} em versão antiga (atual: ${current})` : ""}
          {sum.neverSeen ? ` · ${sum.neverSeen} nunca abriram` : ""}
        </p>
      )}
      <input
        aria-label="Buscar usuário"
        placeholder="Buscar pelo nome ou e-mail…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full p-2 rounded-lg bg-(--bg-elevated) text-(--text-primary) border border-[rgba(255,255,255,0.08)]"
      />
      {users === null && <div className="spinner self-center" />}
      <ul className="flex flex-col gap-2">
        {users && shown.length === 0 && <li className="text-sm text-(--text-muted)">Nenhum usuário encontrado.</li>}
        {shown.map((u) => (
          <li key={u.id} className="p-3 rounded-xl bg-(--bg-card) border border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-(--text-primary) truncate">{u.displayName}</span>
              {isOutdated(u, current) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-[rgba(251,191,36,0.12)] text-amber-400">
                  versão antiga
                </span>
              )}
            </div>
            <div className="text-xs text-(--text-muted) truncate">{u.email}</div>
            <div className="text-xs text-(--text-secondary) mt-1">
              Última abertura: {lastSeenLabel(u.lastSeenAt)} · {parseWebVersion(u.appVersion) ? `web ${parseWebVersion(u.appVersion)}` : "versão desconhecida"}
              {u.appVersion && !u.appVersion.startsWith("web") && ` · APK ${u.appVersion.split(" ")[0]}`}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
