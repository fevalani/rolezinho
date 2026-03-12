import { getInitials } from "@/lib/utils";

interface AvatarProps {
  url: string | null | undefined;
  name: string;
  size?: "sm" | "md" | "lg" | "xl" | "xs";
  className?: string;
}

const sizes = {
  xs: { box: "w-6 h-6", emoji: "text-sm", initials: "text-[0.5rem]" },
  sm: { box: "w-8 h-8", emoji: "text-lg", initials: "text-[0.65rem]" },
  md: { box: "w-10 h-10", emoji: "text-xl", initials: "text-xs" },
  lg: { box: "w-14 h-14", emoji: "text-3xl", initials: "text-base" },
  xl: { box: "w-[72px] h-[72px]", emoji: "text-4xl", initials: "text-lg" },
};

function isEmoji(str: string): boolean {
  return (
    !str.startsWith("http") &&
    !str.startsWith("blob:") &&
    str.length <= 8 &&
    !/[a-zA-Z0-9@./_-]{3,}/.test(str)
  );
}

function isImageUrl(str: string) {
  return str.startsWith("http") || str.startsWith("blob:");
}

export function Avatar({
  url,
  name,
  size = "md",
  className = "",
}: AvatarProps) {
  const s = sizes[size];
  const base = `${s.box} rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${className}`;

  if (url && isImageUrl(url)) {
    return (
      <div
        className={`${base} bg-(--bg-card) border border-[rgba(201,165,90,0.12)]`}
      >
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  if (url && isEmoji(url)) {
    return (
      <div
        className={`${base} bg-(--bg-card) border border-[rgba(201,165,90,0.12)]`}
      >
        <span className={`${s.emoji} leading-none`}>{url}</span>
      </div>
    );
  }

  return (
    <div className={`${base} bg-(--gold-dark)`}>
      <span
        className={`${s.initials} font-bold text-[var(--bg-abyss)]`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {getInitials(name)}
      </span>
    </div>
  );
}
