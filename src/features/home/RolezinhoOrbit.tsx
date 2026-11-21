import { ORBIT_CENTER, ORBIT_FACES } from "./rolezinhoFaces";
import { HERO_TOAST_SRC } from "./heroConfig";

/** Segundos por volta completa. */
export const ORBIT_SECONDS = 90;

/**
 * Camadas da frente do hero: o anel de rostos e a imagem do brinde no centro
 * (o fundo é outra imagem, desenhada por trás, ver HomePage/heroConfig).
 * O anel gira em volta do centro; cada rosto gira ao contrário na mesma
 * velocidade (mesma duração, sentido oposto), então anda em círculo sem tombar.
 * Ocupa o maior quadrado possível do pai (que precisa ter altura definida).
 */
export function RolezinhoOrbit({ seconds = ORBIT_SECONDS }: { seconds?: number }) {
  return (
    <div
      data-testid="roots-orbit"
      className="roots-stage relative h-full aspect-square max-w-full mx-auto"
      style={{ ["--roots-orbit-duration" as string]: `${seconds}s` }}
    >
      <img
        data-testid="roots-toast"
        src={HERO_TOAST_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="roots-toast absolute select-none pointer-events-none"
        style={{ left: `${ORBIT_CENTER.x}%`, top: `${ORBIT_CENTER.y}%` }}
      />
      <div
        data-testid="roots-ring"
        className="roots-ring absolute inset-0"
        style={{ transformOrigin: `${ORBIT_CENTER.x}% ${ORBIT_CENTER.y}%` }}
      >
        {ORBIT_FACES.map((f) => (
          <img
            key={f.src}
            src={f.src}
            alt=""
            draggable={false}
            className="roots-face absolute select-none pointer-events-none"
            style={{
              left: `${f.left}%`,
              top: `${f.top}%`,
              width: `${f.width}%`,
              height: `${f.height}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
