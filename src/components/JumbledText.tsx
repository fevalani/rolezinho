import { jumbleOffsets } from "@/lib/jumble";

/**
 * Texto com as letras levemente fora do lugar (giro e altura), só visual: a ordem das
 * letras NÃO muda, e o texto lido por leitores de tela e copiado continua o normal.
 * Usado no tema de atenção à dislexia; sem animação, para não cansar a leitura.
 */
export function JumbledText({ text, className }: { text: string; className?: string }) {
  const offsets = jumbleOffsets(text);
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {Array.from(text).map((ch, i) =>
        ch === " " ? (
          <span key={i} aria-hidden="true">
            {" "}
          </span>
        ) : (
          <span
            key={i}
            aria-hidden="true"
            style={{
              display: "inline-block",
              transform: `translateY(${offsets[i].dy}px) rotate(${offsets[i].rotate}deg)`,
            }}
          >
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
