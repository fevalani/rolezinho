import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/lib/useAdmin";
import { AwardsEditionPanel } from "./AwardsEditionPanel";
import { fetchEditions, saveEdition } from "./awardsService";
import type { AwardsEdition } from "./awardsTypes";

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;
const field =
  "w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]";

/** /admin/awards (admin do app): criar/apagar edições e configurar cada uma. Aprovar, editar e apagar itens: pela própria tela do Awards. */
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
          <li key={e.slug}>
            <AwardsEditionPanel edition={e} onChanged={() => void load()} isAppAdmin />
          </li>
        ))}
      </ul>
      {!editions.length && <p className="text-sm text-[var(--text-muted)] text-center">Nenhuma edição ainda.</p>}
    </div>
  );
}
