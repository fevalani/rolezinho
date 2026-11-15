import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isAdminUser } from "@/lib/admin";
import {
  SEASONAL_THEMES,
  formatMd,
  isInWindow,
  isValidMd,
} from "@/lib/seasonal/themes";
import { useSeasonalTheme } from "@/lib/seasonal/SeasonalThemeContext";

/** Tela de admin: lista os temas sazonais, pré-visualiza e aprova. */
export function ThemesAdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    approvals,
    windows,
    previewId,
    startPreview,
    stopPreview,
    approve,
    updateWindow,
  } = useSeasonalTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  if (!isAdminUser(user)) return <Navigate to="/" replace />;

  const today = new Date();

  const saveWindow = async (
    id: string,
    start: string | null,
    end: string | null,
  ) => {
    if ((start && !isValidMd(start)) || (end && !isValidMd(end))) {
      setMsg("Datas inválidas.");
      return;
    }
    setBusy(id);
    setMsg("");
    const { error } = await updateWindow(id, start, end);
    setBusy(null);
    if (error)
      setMsg(
        error.includes("start_md") || error.includes("end_md")
          ? "Colunas de período não existem — rode supabase/seasonal_themes_window_migration.sql."
          : `Erro: ${error}`,
      );
  };

  const toggleApproval = async (id: string, value: boolean) => {
    setBusy(id);
    setMsg("");
    const { error } = await approve(id, value);
    setBusy(null);
    if (error)
      setMsg(
        error.includes("seasonal_theme_approvals")
          ? "Tabela de aprovações não existe — rode supabase/seasonal_themes_migration.sql."
          : `Erro: ${error}`,
      );
  };

  return (
    <div className="px-5 pt-8 pb-10 max-w-[540px] mx-auto w-full">
      <h1
        className="text-xl text-(--gold) leading-none"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Temas sazonais
      </h1>
      <p className="text-sm text-(--text-muted) mt-1.5 mb-5">
        Só você vê esta tela. Pré-visualize no app inteiro e aprove para o tema
        entrar sozinho na data. Rascunho nunca liga para os outros.
      </p>

      {msg && (
        <p className="mb-4 text-sm text-(--red) bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.25)] rounded-xl px-3 py-2">
          {msg}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {SEASONAL_THEMES.map((t) => {
          const approved = !!approvals[t.id];
          const win = windows[t.id];
          const inWindow = isInWindow(today, win);
          const previewing = previewId === t.id;
          return (
            <div
              key={t.id}
              className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-(--bg-card) p-4"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{t.emoji}</span>
                <span className="font-semibold text-(--text-primary)">
                  {t.name}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                    approved
                      ? "bg-[rgba(52,211,153,0.15)] text-emerald-400"
                      : "bg-[rgba(251,191,36,0.12)] text-amber-400"
                  }`}
                >
                  {approved ? "Aprovado" : "Rascunho"}
                </span>
                {approved && inWindow && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(201,165,90,0.18)] text-(--gold) uppercase tracking-wide">
                    No ar agora
                  </span>
                )}
              </div>

              <p className="text-sm text-(--text-secondary) mt-2">
                {t.description}
              </p>
              <WindowEditor
                key={`${t.id}-${win.start}-${win.end}`}
                start={win.start}
                end={win.end}
                isDefault={win.start === t.defaultStart && win.end === t.defaultEnd}
                defaultLabel={`${formatMd(t.defaultStart)} a ${formatMd(t.defaultEnd)}`}
                busy={busy === t.id}
                onSave={(s, e) => saveWindow(t.id, s, e)}
                onReset={() => saveWindow(t.id, null, null)}
              />

              <div className="flex gap-1.5 mt-3">
                {t.swatches.map((c) => (
                  <span
                    key={c}
                    className="w-7 h-7 rounded-full border border-[rgba(255,255,255,0.15)]"
                    style={{ background: c }}
                  />
                ))}
              </div>

              <ul className="mt-3 text-xs text-(--text-muted) list-disc pl-4 space-y-0.5">
                {t.decorations.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>

              <div className="flex gap-2 mt-4 flex-wrap">
                {previewing ? (
                  <button
                    onClick={stopPreview}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--text-secondary) bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]"
                  >
                    Sair da pré-visualização
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      startPreview(t.id);
                      navigate("/");
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--gold) bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.25)]"
                  >
                    👁 Pré-visualizar no app
                  </button>
                )}
                <button
                  disabled={busy === t.id}
                  onClick={() => toggleApproval(t.id, !approved)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border disabled:opacity-50 ${
                    approved
                      ? "text-(--red) bg-[rgba(196,64,64,0.1)] border-[rgba(196,64,64,0.25)]"
                      : "text-emerald-400 bg-[rgba(52,211,153,0.1)] border-[rgba(52,211,153,0.25)]"
                  }`}
                >
                  {busy === t.id
                    ? "Salvando…"
                    : approved
                      ? "Revogar aprovação"
                      : "✓ Aprovar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** MM-DD <-> input type="date" (usa um ano fixo só para o seletor). */
const toInput = (md: string) => `2000-${md}`;
const fromInput = (v: string) => v.slice(5);

function WindowEditor({
  start,
  end,
  isDefault,
  defaultLabel,
  busy,
  onSave,
  onReset,
}: {
  start: string;
  end: string;
  isDefault: boolean;
  defaultLabel: string;
  busy: boolean;
  onSave: (start: string, end: string) => void;
  onReset: () => void;
}) {
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const dirty = s !== start || e !== end;
  const wraps = s > e;

  return (
    <div className="mt-2">
      <p className="text-xs text-(--text-muted)">
        📅 No ar de <b>{formatMd(start)}</b> a <b>{formatMd(end)}</b>, todo ano
        {isDefault ? " (padrão)" : ""}
      </p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <input
          type="date"
          value={toInput(s)}
          onChange={(ev) => ev.target.value && setS(fromInput(ev.target.value))}
          className="input-field !w-auto !py-1 !px-2 text-xs"
        />
        <span className="text-xs text-(--text-muted)">até</span>
        <input
          type="date"
          value={toInput(e)}
          onChange={(ev) => ev.target.value && setE(fromInput(ev.target.value))}
          className="input-field !w-auto !py-1 !px-2 text-xs"
        />
        <button
          disabled={!dirty || busy}
          onClick={() => onSave(s, e)}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--gold) bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.25)] disabled:opacity-40"
        >
          Salvar período
        </button>
        {!isDefault && (
          <button
            disabled={busy}
            onClick={onReset}
            className="px-2 py-1.5 rounded-xl text-xs text-(--text-muted) underline disabled:opacity-40"
          >
            Restaurar padrão ({defaultLabel})
          </button>
        )}
      </div>
      {wraps && (
        <p className="text-[11px] text-(--text-muted) mt-1">
          O fim é antes do início: o período atravessa a virada do ano.
        </p>
      )}
      <p className="text-[11px] text-(--text-muted) mt-1">
        Ano ignorado — vale todo ano nessas datas.
      </p>
    </div>
  );
}
