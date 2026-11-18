import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isAdminUser } from "@/lib/admin";
import { hapticTap } from "@/lib/haptics";
import { fetchEdition, fetchProfileNames, fetchUserRaw } from "./wrappedService";
import {
  SLIDE_MS,
  buildSlides,
  clampIndex,
  computeBoards,
  computeMemberRanking,
  computeStats,
  editionYear,
  isEditionLive,
  resolveGesture,
} from "./wrappedLogic";
import { canvasToBlob, downloadImage, drawShareCard, shareImage } from "./wrappedShare";
import type { ResolvedSlide, WrappedEdition } from "./wrappedTypes";
import "./wrapped.css";

type Load =
  | { state: "loading" }
  | { state: "empty" }
  | { state: "ready"; edition: WrappedEdition; slides: ResolvedSlide[]; facts: { label: string; value: string }[] };

export function WrappedPage() {
  const { slug } = useParams<{ slug?: string }>();
  const { user } = useAuth();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const edition = await fetchEdition(slug);
      if (!alive) return;
      if (!edition || (!isEditionLive(edition) && !isAdminUser(user))) return setLoad({ state: "empty" });
      // Wrapped comum (do grupo): dados de todo mundo, sem versão personalizada por pessoa.
      const [raw, names] = await Promise.all([fetchUserRaw(null, edition.slug), fetchProfileNames()]);
      if (!alive) return;
      const stats = computeStats(raw, editionYear(edition.slug));
      const slides = buildSlides(edition, stats, {
        mode: "group",
        members: computeMemberRanking(raw, names),
        boards: computeBoards(raw, names),
      });
      const outro = slides[slides.length - 1];
      setLoad({ state: "ready", edition, slides, facts: outro.facts ?? [] });
    })();
    return () => {
      alive = false;
    };
  }, [slug, user]);

  if (load.state === "loading") {
    return (
      <div className="min-h-[60dvh] flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }
  if (load.state === "empty") return <WrappedEmpty />;
  return <Stories edition={load.edition} slides={load.slides} facts={load.facts} />;
}

function WrappedEmpty() {
  const navigate = useNavigate();
  return (
    <div className="max-w-[500px] mx-auto px-5 py-16 text-center flex flex-col gap-3">
      <p className="text-5xl">🎁</p>
      <h1 className="text-xl text-(--text-primary)" style={{ fontFamily: "var(--font-display)" }}>
        Nenhuma retrospectiva por aqui ainda
      </h1>
      <p className="text-(--text-secondary)">Quando a próxima edição for liberada, ela aparece na Home.</p>
      <button className="wrapped-btn ghost self-center" onClick={() => navigate("/")}>
        Voltar
      </button>
    </div>
  );
}

function Stories({
  edition,
  slides,
  facts,
}: {
  edition: WrappedEdition;
  slides: ResolvedSlide[];
  facts: { label: string; value: string }[];
}) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 do slide atual
  const [held, setHeld] = useState(false);
  const [toast, setToast] = useState("");
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null);
  const last = slides.length - 1;
  const slide = slides[index];

  const go = useCallback(
    (i: number) => {
      setIndex(clampIndex(i, slides.length));
      setProgress(0);
    },
    [slides.length],
  );
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);
  const close = useCallback(() => navigate("/"), [navigate]);

  // Avanço automático (pausa ao segurar; o último slide fica parado).
  useEffect(() => {
    if (held || index >= last) return;
    const id = setInterval(() => {
      setProgress((p) => {
        const np = p + 50 / SLIDE_MS;
        return np >= 1 ? 1 : np;
      });
    }, 50);
    return () => clearInterval(id);
  }, [held, index, last]);

  useEffect(() => {
    if (progress >= 1 && index < last) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fim do tempo do slide avança o fluxo
      go(index + 1);
    }
  }, [progress, index, last, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") setHeld((h) => !h);
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, close]);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setHeld(true);
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setHeld(false);
    const action = resolveGesture({
      dx: e.clientX - g.x,
      dy: e.clientY - g.y,
      heldMs: Date.now() - g.t,
      x: e.clientX,
      width: window.innerWidth,
    });
    if (action === "none") return;
    hapticTap();
    if (action === "next") next();
    else prev();
  };
  const onCancel = () => {
    gesture.current = null;
    setHeld(false);
  };

  const t = edition.theme;
  const style = {
    "--w-primary": t?.primary ?? "var(--gold-bright)",
    "--w-secondary": t?.secondary ?? "#7c5cff",
    "--w-bg": t?.background ?? "var(--bg-abyss)",
    "--w-x": `${(index * 23) % 70}%`,
    "--w-y": `${(index * 37) % 60}%`,
  } as React.CSSProperties;

  const cardInput = useMemo(
    () => ({ title: edition.pageTitle, userName: "O grupo", facts, theme: edition.theme }),
    [edition, facts],
  );
  const makeBlob = async () => {
    const canvas = document.createElement("canvas");
    drawShareCard(canvas, cardInput);
    return canvasToBlob(canvas);
  };
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };
  const onShare = async () => {
    const blob = await makeBlob();
    if (!blob) return flash("Não foi possível gerar a imagem");
    const r = await shareImage(blob, `wrapped-${edition.slug}.png`, `${edition.pageTitle} — Rolezinho`);
    if (r === "downloaded") flash("Imagem baixada ✓");
    else if (r === "error") flash("Não foi possível compartilhar");
  };
  const onDownload = async () => {
    const blob = await makeBlob();
    if (!blob) return flash("Não foi possível gerar a imagem");
    downloadImage(blob, `wrapped-${edition.slug}.png`);
    flash("Imagem baixada ✓");
  };

  return (
    <div
      className="wrapped-root"
      style={style}
      data-testid="wrapped-root"
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      role="region"
      aria-label={edition.pageTitle}
    >
      <div className="wrapped-bg" />
      {slide.backgroundImageUrl && (
        <img key={slide.key + "bg"} src={slide.backgroundImageUrl} alt="" className="wrapped-bgimg" />
      )}

      <div className="wrapped-bars" aria-hidden="true">
        {slides.map((s, i) => (
          <div className="wrapped-bar" key={s.key}>
            <i style={{ width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%" }} />
          </div>
        ))}
      </div>
      <button className="wrapped-close" aria-label="Fechar" onClick={close}>
        ✕
      </button>

      <SlideView key={slide.key} slide={slide}>
        {slide.kind === "outro" && (
          <div className="flex gap-2 flex-wrap mt-2">
            <button className="wrapped-btn" onClick={onShare}>
              Compartilhar
            </button>
            <button className="wrapped-btn ghost" onClick={onDownload}>
              Baixar imagem
            </button>
          </div>
        )}
      </SlideView>

      {toast && (
        <div role="status" className="absolute bottom-6 left-0 right-0 z-[4] text-center text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

function SlideView({ slide, children }: { slide: ResolvedSlide; children?: React.ReactNode }) {
  return (
    <div className="wrapped-slide" data-kind={slide.kind}>
      {slide.emoji && <div className="wrapped-emoji">{slide.emoji}</div>}
      {slide.imageUrl && slide.kind !== "list" && (
        <img
          src={slide.imageUrl}
          alt=""
          className="rounded-2xl max-h-[34dvh] object-cover self-start"
          style={{ animation: "wrappedPop 0.6s both" }}
        />
      )}
      {slide.title && (
        <h2 className="wrapped-title">{slide.kind === "quote" ? `“${slide.title}”` : slide.title}</h2>
      )}
      {slide.big && (
        <>
          <div className="wrapped-big">{slide.big.value}</div>
          <p className="wrapped-text">{slide.big.label}</p>
        </>
      )}
      {slide.description && <p className="wrapped-text">{slide.description}</p>}
      {slide.items && (
        <ol className="flex flex-col gap-2 mt-1">
          {slide.items.map((it, i) => (
            <li className="wrapped-row" key={`${it.rank}-${it.label}`} style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
              <span className="wrapped-rank">{it.rank}</span>
              {it.imageUrl && <img src={it.imageUrl} alt="" className="wrapped-thumb" />}
              <span className="min-w-0 flex flex-col">
                <span className="font-semibold truncate">{it.label}</span>
                {it.sublabel && <span className="text-sm text-white/70 truncate">{it.sublabel}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {slide.facts && (
        <ul className="flex flex-col gap-2 mt-1">
          {slide.facts.map((f, i) => (
            <li className="wrapped-fact" key={f.label} style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
              <span className="text-white/75">{f.label}</span>
              <span className="font-bold text-right truncate">{f.value}</span>
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}
