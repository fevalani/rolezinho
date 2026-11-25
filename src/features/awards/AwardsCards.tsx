import type { ReactNode } from "react";
import { nomineeName } from "./awardsLogic";
import type { AwardsCategory, AwardsNominee } from "./awardsTypes";

const CARD =
  "relative bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden text-left w-full transition-colors hover:border-[rgba(201,165,90,0.25)]";

export function CategoryCard({
  category,
  count,
  mine,
  onOpen,
}: {
  category: AwardsCategory;
  count: number;
  mine: boolean;
  onOpen: () => void;
}) {
  return (
    <button onClick={onOpen} className={`${CARD} aspect-[4/5] flex flex-col`} aria-label={`Categoria ${category.title}`}>
      {category.imageUrl ? (
        <img src={category.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-5xl opacity-70 bg-[radial-gradient(circle_at_30%_20%,rgba(201,165,90,0.18),transparent_70%)]">
          🏆
        </span>
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      {mine && (
        <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(201,165,90,0.9)] text-black">
          sua
        </span>
      )}
      <span className="relative mt-auto p-3 flex flex-col gap-0.5">
        <span className="text-sm font-bold leading-tight text-white">{category.title}</span>
        <span className="text-[11px] text-white/70">
          {count} indicado{count !== 1 ? "s" : ""}
        </span>
      </span>
    </button>
  );
}

export function AddCard({
  label,
  hint,
  disabled,
  onClick,
  aspect = "aspect-[4/5]",
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
  aspect?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${aspect} w-full rounded-2xl border-2 border-dashed border-[rgba(201,165,90,0.35)] flex flex-col items-center justify-center gap-1.5 p-3 text-center text-[var(--gold)] transition-colors hover:bg-[rgba(201,165,90,0.06)] disabled:opacity-45 disabled:cursor-not-allowed`}
    >
      <span className="text-3xl leading-none">➕</span>
      <span className="text-sm font-semibold leading-tight">{label}</span>
      {hint && <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>}
    </button>
  );
}

export function NomineeCard({
  nominee,
  selected,
  badge,
  onClick,
  actions,
  large,
}: {
  nominee: AwardsNominee;
  selected?: boolean;
  badge?: ReactNode;
  onClick?: () => void;
  actions?: ReactNode;
  large?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      className={`${CARD} ${large ? "aspect-[4/3]" : "aspect-square"} flex flex-col ${
        selected ? "!border-[var(--gold)] ring-2 ring-[var(--gold)]" : ""
      }`}
    >
      {nominee.imageUrl ? (
        <img src={nominee.imageUrl} alt={nomineeName(nominee)} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(201,165,90,0.18),transparent_70%)]" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      {badge && <span className="absolute top-2 left-2">{badge}</span>}
      {selected && (
        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--gold)] text-black text-sm font-bold flex items-center justify-center">
          ✓
        </span>
      )}
      <span className={`relative flex flex-col gap-0.5 p-3 ${nominee.imageUrl ? "mt-auto" : "my-auto items-center text-center"}`}>
        <span className={`font-bold leading-tight text-white ${nominee.imageUrl ? "text-sm" : "text-base"}`}>
          {nomineeName(nominee)}
        </span>
      </span>
      {actions && <span className="relative flex gap-1 px-2 pb-2 justify-end">{actions}</span>}
    </Tag>
  );
}
