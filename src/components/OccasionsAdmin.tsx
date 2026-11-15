import { useMemo, useState } from "react";
import { MdPicker } from "@/components/MdPicker";
import { useSeasonalTheme } from "@/lib/seasonal/SeasonalThemeContext";
import { emojiHue } from "@/lib/seasonal/emojiColor";
import {
  OCCASION_LIMITS,
  daysBefore as daysBeforeMd,
  graphemes,
  isOccasionActive,
  normalizeOccasion,
  occasionThemeId,
  parseExtras,
  type Occasion,
} from "@/lib/seasonal/occasions";
import { buildGarlandSvg, garlandItems, svgUrl } from "@/lib/seasonal/occasionAssets";
import { OCCASION_SUGGESTIONS } from "@/lib/seasonal/occasionSuggestions";
import { formatMdLong } from "@/lib/seasonal/themes";
import { useNavigate } from "react-router-dom";

interface FormState {
  id?: string;
  title: string;
  emoji: string;
  extras: string;
  dayMd: string;
  daysBefore: number;
  jumble: boolean;
  enabled: boolean;
}

const EMPTY: FormState = {
  title: "",
  emoji: "🎉",
  extras: "",
  dayMd: "01-01",
  daysBefore: 0,
  jumble: false,
  enabled: true,
};

const toForm = (o: Occasion): FormState => ({
  id: o.id,
  title: o.title,
  emoji: o.emoji,
  extras: o.extras.join(" "),
  dayMd: o.dayMd,
  daysBefore: o.daysBefore,
  jumble: o.jumble,
  enabled: o.enabled,
});

/** Faixa de emojis (a mesma do app) para conferir antes de salvar. */
function StripPreview({ emoji, extras, jumble }: { emoji: string; extras: string[]; jumble: boolean }) {
  const hs = emojiHue(graphemes(emoji)[0] ?? "🎉");
  const bg = svgUrl(buildGarlandSvg(garlandItems(emoji || "🎉", extras), jumble, hs));
  return (
    <div
      aria-label="Prévia da faixa"
      role="img"
      className="h-[30px] rounded-md border border-[rgba(255,255,255,0.08)]"
      style={{
        backgroundImage: bg,
        backgroundSize: "400px 30px",
        backgroundRepeat: "repeat-x",
        backgroundColor: `hsl(${hs.h} 34% 10%)`,
      }}
    />
  );
}

/** Seção da tela de temas: criar e gerenciar ocasiões (dia, título e emojis). */
export function OccasionsAdmin() {
  const { occasions, previewId, startPreview, stopPreview, saveOccasion, removeOccasion } =
    useSeasonalTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  const extrasList = useMemo(() => parseExtras(form?.extras ?? ""), [form?.extras]);
  const today = new Date();

  const fail = (error: string) =>
    setMsg(
      /seasonal_occasions/.test(error)
        ? "A tabela de ocasiões não existe — rode supabase/seasonal_occasions_migration.sql."
        : error,
    );

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMsg("");
    setOk("");
    const { error } = await saveOccasion({ ...form, extras: extrasList });
    setBusy(false);
    if (error) return fail(error);
    setOk(`✓ Salvo: ${form.title.trim()} em ${formatMdLong(form.dayMd)}`);
    setForm(null);
  };

  const toggle = async (o: Occasion) => {
    setMsg("");
    setOk("");
    const { error } = await saveOccasion({ ...o, enabled: !o.enabled });
    if (error) fail(error);
  };

  const remove = async (o: Occasion) => {
    if (!window.confirm(`Excluir a ocasião "${o.title}"?`)) return;
    setMsg("");
    setOk("");
    const { error } = await removeOccasion(o.id);
    if (error) return fail(error);
    if (previewId === occasionThemeId(o.id)) stopPreview();
    setOk(`✓ Excluída: ${o.title}`);
  };

  const input = "input-field !py-1.5 text-sm";
  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base text-(--gold)" style={{ fontFamily: "var(--font-display)" }}>
          Ocasiões
        </h2>
        {!form && (
          <button
            onClick={() => {
              setMsg("");
              setOk("");
              setForm({ ...EMPTY });
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--gold) bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.25)]"
          >
            ＋ Nova ocasião
          </button>
        )}
      </div>
      <p className="text-xs text-(--text-muted) mt-1 mb-3">
        Escolha o dia, o título e os emojis. As cores saem do emoji principal e o tema entra no ar
        sozinho no período.
      </p>

      {ok && (
        <p className="mb-3 text-sm text-emerald-400 bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.25)] rounded-xl px-3 py-2">
          {ok}
        </p>
      )}
      {msg && (
        <p className="mb-3 text-sm text-(--red) bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.25)] rounded-xl px-3 py-2">
          {msg}
        </p>
      )}

      {form && (
        <div className="rounded-2xl border border-[rgba(201,165,90,0.25)] bg-(--bg-card) p-4 mb-3 flex flex-col gap-3">
          <p className="text-sm font-semibold text-(--text-primary)">
            {form.id ? "Editar ocasião" : "Nova ocasião"}
          </p>

          {!form.id && (
            <div>
              <p className="text-[11px] text-(--text-muted) mb-1">💡 Ideias (toque para preencher)</p>
              <div className="flex flex-wrap gap-1.5">
                {OCCASION_SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...EMPTY,
                        title: s.title,
                        emoji: s.emoji ?? "🎉",
                        extras: (s.extras as string[]).join(" "),
                        dayMd: s.dayMd ?? "01-01",
                        daysBefore: s.daysBefore ?? 0,
                        jumble: !!s.jumble,
                      })
                    }
                    className="px-2 py-1 rounded-full text-[11px] text-(--text-secondary) bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]"
                  >
                    {s.emoji} {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs text-(--text-muted)">
            Título (aparece na Home)
            <input
              className={input}
              value={form.title}
              maxLength={OCCASION_LIMITS.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-(--text-muted)">
            Emoji principal (destaque e cores do tema)
            <input
              className={`${input} !w-24 text-center`}
              value={form.emoji}
              maxLength={OCCASION_LIMITS.emoji}
              onChange={(e) => set({ emoji: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-(--text-muted)">
            Outros emojis da faixa (até {OCCASION_LIMITS.extras}; podem ser letras)
            <input
              className={input}
              value={form.extras}
              placeholder="🎈 🎊 🥁"
              onChange={(e) => set({ extras: e.target.value })}
            />
          </label>
          {extrasList.length > 0 && (
            <p className="text-sm text-(--text-primary) -mt-1" aria-label="Emojis da faixa">
              {extrasList.join("  ")}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-(--text-muted)">Dia da comemoração</span>
            <MdPicker label="Dia da comemoração" value={form.dayMd} onChange={(dayMd) => set({ dayMd })} />
          </div>

          <label className="flex items-center gap-2 text-xs text-(--text-muted)">
            Entra no ar
            <select
              aria-label="Dias de antecedência"
              className="input-field !w-auto !py-1 !px-2 text-sm"
              value={form.daysBefore}
              onChange={(e) => set({ daysBefore: Number(e.target.value) })}
            >
              {Array.from({ length: OCCASION_LIMITS.maxDaysBefore + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n === 0 ? "só no dia" : `${n} dia${n > 1 ? "s" : ""} antes`}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-(--text-muted) -mt-1">
            No ar de {formatMdLong(daysBeforeMd(form.dayMd, form.daysBefore))} até{" "}
            {formatMdLong(form.dayMd)}, todo ano.
          </p>

          <label className="flex items-center gap-2 text-xs text-(--text-secondary)">
            <input
              type="checkbox"
              checked={form.jumble}
              onChange={(e) => set({ jumble: e.target.checked })}
            />
            Letras levemente embaralhadas (título e faixa)
          </label>

          <StripPreview emoji={form.emoji} extras={extrasList} jumble={form.jumble} />

          <div className="flex gap-2 flex-wrap">
            <button
              disabled={busy || !normalizeOccasion({ ...form, extras: extrasList }).occasion}
              onClick={save}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-400 bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.25)] disabled:opacity-40"
            >
              {busy ? "Salvando…" : "Salvar ocasião"}
            </button>
            <button
              disabled={busy}
              onClick={() => setForm(null)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--text-secondary) bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]"
            >
              Cancelar
            </button>
          </div>
          {normalizeOccasion({ ...form, extras: extrasList }).error && (
            <p className="text-[11px] text-(--text-muted)">
              {normalizeOccasion({ ...form, extras: extrasList }).error}
            </p>
          )}
        </div>
      )}

      {occasions.length === 0 && !form && (
        <p className="text-sm text-(--text-muted)">Nenhuma ocasião ainda. Toque em “Nova ocasião”.</p>
      )}

      <div className="flex flex-col gap-3">
        {occasions.map((o) => {
          const live = isOccasionActive(o, today);
          const previewing = previewId === occasionThemeId(o.id);
          return (
            <div
              key={o.id}
              className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-(--bg-card) p-4"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{o.emoji}</span>
                <span className="font-semibold text-(--text-primary)">{o.title}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                    o.enabled
                      ? "bg-[rgba(52,211,153,0.15)] text-emerald-400"
                      : "bg-[rgba(251,191,36,0.12)] text-amber-400"
                  }`}
                >
                  {o.enabled ? "Ativa" : "Desativada"}
                </span>
                {live && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(201,165,90,0.18)] text-(--gold) uppercase tracking-wide">
                    No ar agora
                  </span>
                )}
              </div>
              <p className="text-xs text-(--text-muted) mt-1">
                {formatMdLong(o.dayMd)}
                {o.daysBefore > 0 ? ` · entra ${o.daysBefore} dia${o.daysBefore > 1 ? "s" : ""} antes` : " · só no dia"}
                {o.jumble ? " · letras embaralhadas" : ""}
              </p>
              <div className="mt-2">
                <StripPreview emoji={o.emoji} extras={o.extras} jumble={o.jumble} />
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
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
                      startPreview(occasionThemeId(o.id));
                      navigate("/");
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--gold) bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.25)]"
                  >
                    👁 Pré-visualizar no app
                  </button>
                )}
                <button
                  onClick={() => {
                    setMsg("");
                    setOk("");
                    setForm(toForm(o));
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--text-secondary) bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]"
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => toggle(o)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--text-secondary) bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]"
                >
                  {o.enabled ? "Desativar" : "Ativar"}
                </button>
                <button
                  onClick={() => remove(o)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--red) bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.25)]"
                >
                  🗑 Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
