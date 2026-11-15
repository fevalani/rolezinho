// Seletor de dia + mês (sem ano), usado na tela de temas.
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Seletor de dia + mês (sem ano). Atualiza na hora, sem janela nativa. */
export function MdPicker({
  value,
  onChange,
  label,
}: {
  value: string; // "MM-DD"
  onChange: (md: string) => void;
  label: string;
}) {
  const month = Number(value.slice(0, 2));
  const day = Number(value.slice(3, 5));
  const maxDay = DAYS_IN_MONTH[month - 1];
  const cls =
    "input-field !w-auto !py-1 !px-2 text-sm";

  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label={`${label} — dia`}
        className={cls}
        value={day}
        onChange={(e) => onChange(`${pad2(month)}-${pad2(Number(e.target.value))}`)}
      >
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <span className="text-xs text-(--text-muted)">de</span>
      <select
        aria-label={`${label} — mês`}
        className={cls}
        value={month}
        onChange={(e) => {
          const m = Number(e.target.value);
          const d = Math.min(day, DAYS_IN_MONTH[m - 1]);
          onChange(`${pad2(m)}-${pad2(d)}`);
        }}
      >
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
    </span>
  );
}
