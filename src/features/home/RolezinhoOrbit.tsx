import { ORBIT_CENTER, ORBIT_FACES } from "./rolezinhoFaces";

/** Segundos por volta completa. */
export const ORBIT_SECONDS = 90;

/**
 * Foto do hero em camadas: fundo estático (sem rostos) e, por cima, um anel que
 * gira em volta da caneca. Cada rosto gira ao contrário na mesma velocidade
 * (mesma duração, sentido oposto), então anda em círculo sem tombar.
 * Ocupa o maior quadrado possível do pai (que precisa ter altura definida).
 */
export function RolezinhoOrbit({ seconds = ORBIT_SECONDS }: { seconds?: number }) {
  return (
    <div
      data-testid="roots-orbit"
      className="relative h-full aspect-square max-w-full mx-auto"
      style={{ ["--roots-orbit-duration" as string]: `${seconds}s` }}
    >
      <img
        src="/images/roots/bg.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-contain anim-fade"
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
