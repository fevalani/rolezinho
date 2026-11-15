import { useState } from "react";
import { MdPicker } from "@/components/MdPicker";
import type { ThemeCustomization } from "@/lib/seasonal/SeasonalThemeContext";
import {
  MAX_EMOJI_LENGTH,
  MAX_OCCASION_LENGTH,
  formatMdLong,
  type SeasonalTheme,
} from "@/lib/seasonal/themes";
import { MAX_DAYS_BEFORE, daysBefore, daysBetween } from "@/lib/seasonal/themeCustomLogic";

/**
 * Reaproveita um visual para outra ocasião: o admin troca o título do selo, o emoji, o
 * dia comemorativo e quantos dias antes o tema entra no ar. O período termina no dia.
 */
export function ThemeCustomizer({
  theme,
  day,
  startMd,
  customized,
  busy,
  onSave,
  onReset,
}: {
  theme: SeasonalTheme;
  /** Dia comemorativo atual ("MM-DD"). */
  day: string;
  /** Início atual do período ("MM-DD"). */
  startMd: string;
  customized: boolean;
  busy: boolean;
  onSave: (c: ThemeCustomization) => void;
  onReset: () => void;
}) {
  const [title, setTitle] = useState(theme.occasion);
  const [emoji, setEmoji] = useState(theme.emoji);
  const [dayMd, setDayMd] = useState(day);
  const [before, setBefore] = useState(daysBetween(startMd, day));

  const cleanTitle = title.trim();
  const cleanEmoji = emoji.trim();
  const dirty =
    cleanTitle !== theme.occasion ||
    cleanEmoji !== theme.emoji ||
    dayMd !== day ||
    before !== daysBetween(startMd, day);
  const invalid = !cleanTitle;

  return (
    <details className="mt-3 rounded-xl border border-[rgba(255,255,255,0.08)] px-3 py-2">
      <summary className="cursor-pointer text-xs font-bold text-(--gold)">
        ✏️ Reaproveitar este visual (título, emoji e dia)
        {customized && <span className="ml-2 text-(--text-muted) font-normal">· editado</span>}
      </summary>

      <div className="flex flex-col gap-2 mt-3">
        <label className="flex flex-col gap-1 text-xs text-(--text-muted)">
          Título que aparece na Home
          <input
            className="input-field !py-1.5 text-sm"
            value={title}
            maxLength={MAX_OCCASION_LENGTH}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-(--text-muted)">
          Emoji do selo
          <input
            className="input-field !py-1.5 text-sm !w-24"
            value={emoji}
            maxLength={MAX_EMOJI_LENGTH}
            onChange={(e) => setEmoji(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-(--text-muted)">Dia da comemoração</span>
          <MdPicker label="Dia da comemoração" value={dayMd} onChange={setDayMd} />
        </div>
        <label className="flex items-center gap-2 text-xs text-(--text-muted)">
          Entra no ar
          <select
            aria-label="Dias de antecedência"
            className="input-field !w-auto !py-1 !px-2 text-sm"
            value={before}
            onChange={(e) => setBefore(Number(e.target.value))}
          >
            {Array.from({ length: MAX_DAYS_BEFORE + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? "só no dia" : `${n} dia${n > 1 ? "s" : ""} antes`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-(--text-muted)">
          Fica no ar de {formatMdLong(daysBefore(dayMd, before))} até {formatMdLong(dayMd)}, todo
          ano. O selo mostra “{cleanEmoji || theme.emoji} {cleanTitle || "…"}” e o dia{" "}
          {formatMdLong(dayMd)}.
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            disabled={!dirty || invalid || busy}
            onClick={() =>
              onSave({
                occasion: cleanTitle,
                emoji: cleanEmoji || null,
                occasionMd: dayMd,
                start: daysBefore(dayMd, before),
                end: dayMd,
              })
            }
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-(--gold) bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.25)] disabled:opacity-40"
          >
            {busy ? "Salvando…" : "Salvar título e dia"}
          </button>
          {customized && (
            <button
              disabled={busy}
              onClick={onReset}
              className="px-2 py-1.5 rounded-xl text-xs text-(--text-muted) underline disabled:opacity-40"
            >
              Voltar ao padrão do visual
            </button>
          )}
        </div>
        {invalid && <p className="text-[11px] text-(--red)">Escreva um título.</p>}
      </div>
    </details>
  );
}
