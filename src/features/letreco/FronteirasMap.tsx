import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { FronteirasWorld, GuessColor } from "./fronteirasTypes";
import {
  COLOR_FILL,
  clampViewBox,
  fullViewBox,
  panViewBox,
  zoomViewBox,
  type ViewBox,
} from "./fronteirasLogic";

const FROM_FILL = "#4a90d9";
const TO_FILL = "#a064d6";
const BUTTON_STEP = 1.6;

const btn =
  "w-9 h-9 rounded-lg text-lg font-bold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[rgba(255,255,255,0.12)] active:scale-95 disabled:opacity-40";

/**
 * Mapa-múndi em SVG: origem (azul), destino (roxo) e palpites coloridos pela distância.
 * Zoom por botões, roda do mouse e pinça; arrastar para mover quando aproximado.
 */
export const FronteirasMap = memo(function FronteirasMap({
  world,
  from,
  to,
  colors,
  revealed,
}: {
  world: FronteirasWorld;
  from: string;
  to: string;
  /** cor de cada país já chutado (ISO → cor) */
  colors: Record<string, GuessColor>;
  /** países de um caminho mais curto, mostrados ao fim da partida (contorno dourado) */
  revealed?: Set<string>;
}) {
  const full = fullViewBox(world.width, world.height);
  const [vb, setVb] = useState<ViewBox>(full);
  const svgRef = useRef<SVGSVGElement>(null);
  const vbRef = useRef(vb);
  vbRef.current = vb; // sempre o último recorte, para os handlers de gesto
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  const zoomed = vb.w < full.w - 0.01;

  /** Coordenada da tela (px) → coordenada do SVG, no recorte atual. */
  const toSvg = useCallback((clientX: number, clientY: number, cur: ViewBox) => {
    const r = svgRef.current?.getBoundingClientRect();
    const w = r?.width || full.w;
    const h = r?.height || full.h;
    return {
      x: cur.x + ((clientX - (r?.left ?? 0)) / w) * cur.w,
      y: cur.y + ((clientY - (r?.top ?? 0)) / h) * cur.h,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      setVb((cur) =>
        zoomViewBox(cur, factor, at?.x ?? cur.x + cur.w / 2, at?.y ?? cur.y + cur.h / 2, full),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Roda do mouse (precisa de listener não-passivo para impedir o scroll da página).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.25 : 0.8, toSvg(e.clientX, e.clientY, vbRef.current));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy, toSvg]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];

    if (pts.length >= 2) {
      // pinça: aproxima/afasta pela variação da distância entre os dedos
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch.current && dist > 0) {
        const mid = toSvg((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, vbRef.current);
        zoomBy(dist / pinch.current, mid);
      }
      pinch.current = dist;
      return;
    }

    // arrastar: só faz sentido com zoom
    const r = svgRef.current?.getBoundingClientRect();
    const cur = vbRef.current;
    const unitsPerPx = cur.w / (r?.width || full.w);
    setVb(panViewBox(cur, (e.clientX - prev.x) * unitsPerPx, (e.clientY - prev.y) * unitsPerPx, full));
  };

  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label="Mapa-múndi"
        className="w-full h-auto rounded-xl bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] select-none"
        style={{ touchAction: "none", cursor: zoomed ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {world.countries.map((c) => {
          let fill = "rgba(255,255,255,0.08)";
          if (c.iso === from) fill = FROM_FILL;
          else if (c.iso === to) fill = TO_FILL;
          else if (colors[c.iso]) fill = COLOR_FILL[colors[c.iso]];
          const isRevealed = !!revealed?.has(c.iso);
          if (isRevealed && !colors[c.iso] && c.iso !== from && c.iso !== to) {
            fill = "rgba(201,165,90,0.4)";
          }
          return (
            <path
              key={c.iso}
              data-iso={c.iso}
              d={c.d}
              fill={fill}
              data-revealed={isRevealed && c.iso !== from && c.iso !== to ? "true" : undefined}
              stroke={isRevealed ? "#c9a55a" : "rgba(0,0,0,0.45)"}
              strokeWidth={isRevealed ? 1.8 : 0.6}
              vectorEffect="non-scaling-stroke"
            >
              <title>{c.name}</title>
            </path>
          );
        })}
      </svg>

      {revealed && revealed.size > 0 && (
        <p className="mt-1 text-center text-[0.65rem] text-[var(--text-muted)]">
          <span style={{ color: "#c9a55a" }}>■</span> contorno dourado = exemplo de caminho mais
          curto
        </p>
      )}

      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        <button
          type="button"
          aria-label="Aproximar"
          className={btn}
          onClick={() => zoomBy(BUTTON_STEP)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Afastar"
          className={btn}
          disabled={!zoomed}
          onClick={() => zoomBy(1 / BUTTON_STEP)}
        >
          −
        </button>
        {zoomed && (
          <button
            type="button"
            aria-label="Redefinir zoom"
            className={`${btn} text-sm`}
            onClick={() => setVb(clampViewBox(full, full))}
          >
            ⟲
          </button>
        )}
      </div>
    </div>
  );
});
