import { useCallback, useEffect, useState } from "react";
import { PHASES, PHASE_LABEL, sortCategories } from "./awardsLogic";
import { deleteEdition, fetchContent, reorderCategories, setAudience, setPhase } from "./awardsService";
import type { AwardsAudience, AwardsCategory, AwardsEdition, AwardsPhase } from "./awardsTypes";
import { PeoplePicker } from "./PeoplePicker";

const chip = (on: boolean) =>
  `text-xs px-3 py-1.5 rounded-full border ${
    on ? "bg-[var(--gold)] text-black border-[var(--gold)] font-semibold" : "border-[rgba(255,255,255,0.12)] text-[var(--text-muted)]"
  }`;

/** "Quem vê": todos ou pessoas escolhidas (lista de usuários do app, valendo no banco via RLS). */
function AudiencePanel({ edition, onChanged }: { edition: AwardsEdition; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);

  const choose = async (audience: AwardsAudience) => {
    const { error: err } = await setAudience(edition.slug, audience);
    setError(err);
    if (!err) onChanged();
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-[var(--text-muted)]">Quem vê (depois que sair de “Oculto”)</span>
      <div className="flex gap-1.5" role="group" aria-label="Quem vê">
        {(["all", "selected"] as const).map((a) => (
          <button key={a} onClick={() => void choose(a)} aria-pressed={edition.audience === a} className={chip(edition.audience === a)}>
            {a === "all" ? "Todos" : "Pessoas escolhidas"}
          </button>
        ))}
      </div>
      {edition.audience === "selected" && (
        <PeoplePicker
          table="awards_viewers"
          slug={edition.slug}
          listName="pessoas"
          countLabel={(n) => `${n} selecionada(s)`}
          saveLabel="Salvar quem vê"
          savedMessage={(n) => `Salvo: ${n} pessoa(s) podem ver.`}
          emptyHint="Sem ninguém marcado, só os admins veem."
          startOpen
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Configuração de uma edição: fase, quem vê, ordem das categorias e (só para o admin do app) a lista de
 * admins do awards e o botão de apagar a edição. As permissões valem no banco; aqui só se esconde.
 */
export function AwardsEditionPanel({
  edition,
  onChanged,
  isAppAdmin,
}: {
  edition: AwardsEdition;
  onChanged: () => void;
  isAppAdmin: boolean;
}) {
  const [cats, setCats] = useState<AwardsCategory[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCats = useCallback(async () => {
    const { data } = await fetchContent(edition.slug);
    setCats(sortCategories(data.categories));
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
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{edition.title}</p>
          <p className="text-xs text-[var(--text-muted)]">/{edition.slug}</p>
        </div>
        {isAppAdmin && (
          <button onClick={() => void remove()} aria-label={`Apagar ${edition.title}`} className="p-2 text-[var(--text-muted)]">
            🗑️
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fase">
        {PHASES.map((p) => (
          <button key={p} onClick={() => void changePhase(p)} aria-pressed={edition.phase === p} className={chip(edition.phase === p)}>
            {PHASE_LABEL[p]}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--text-muted)]">Na votação entram só as categorias aprovadas.</p>

      <AudiencePanel edition={edition} onChanged={onChanged} />

      {isAppAdmin && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--text-muted)]">
            Admins do awards: veem tudo, aprovam, excluem e veem o resultado. Admins do app já são.
          </span>
          <PeoplePicker
            table="awards_admins"
            slug={edition.slug}
            listName="admins"
            countLabel={(n) => `${n} admin(s)`}
            saveLabel="Salvar admins"
            savedMessage={(n) => `Salvo: ${n} admin(s) do awards.`}
            emptyHint="Ninguém além dos admins do app."
          />
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} className="text-xs text-[var(--gold)] text-left">
        {open ? "Ocultar categorias" : "Ver e reordenar categorias"}
      </button>
      {open && (
        <ol className="flex flex-col gap-1.5">
          {cats.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
              <span className="flex-1 min-w-0 truncate">
                {c.title}
                {c.approved && <span className="text-[var(--gold)]"> ✓</span>}
              </span>
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
    </div>
  );
}
