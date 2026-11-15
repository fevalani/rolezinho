/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/AuthContext";
import { isAdminUser } from "@/lib/admin";
import { SEASONAL_THEMES, getTheme, type SeasonalTheme } from "./themes";
import { fetchApprovals, setApproval } from "./seasonalService";

const PREVIEW_KEY = "rz_season_preview";

interface SeasonalValue {
  /** Tema aplicado agora (pré-visualização do admin ou tema aprovado na janela). */
  active: SeasonalTheme | null;
  /** O admin está pré-visualizando um tema (rascunho ou não)? */
  previewId: string | null;
  approvals: Record<string, boolean>;
  startPreview: (id: string) => void;
  stopPreview: () => void;
  approve: (id: string, approved: boolean) => Promise<{ error: string | null }>;
}

const Ctx = createContext<SeasonalValue | null>(null);

/** ?tema=natal na URL inicia a pré-visualização; senão usa o que ficou salvo.
 *  (Só tem efeito para o admin — ver `previewId` no provider.) */
function readInitialPreview(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("tema");
    if (fromUrl && getTheme(fromUrl)) {
      localStorage.setItem(PREVIEW_KEY, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

export function SeasonalThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const admin = isAdminUser(user);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [previewRaw, setPreviewRaw] = useState<string | null>(readInitialPreview);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      fetchApprovals().then((a) => {
        if (alive) setApprovals(a);
      });
    load();
    // Reavalia ao voltar para o app (aprovação feita enquanto estava aberto)
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user]);

  // Pré-visualização só vale para o admin
  const previewId = admin && getTheme(previewRaw) ? previewRaw : null;

  const active = useMemo<SeasonalTheme | null>(() => {
    if (previewId) return getTheme(previewId);
    const today = new Date();
    return (
      SEASONAL_THEMES.find((t) => approvals[t.id] && t.isActive(today)) ?? null
    );
  }, [previewId, approvals]);

  useEffect(() => {
    const el = document.documentElement;
    if (active) el.dataset.season = active.id;
    else delete el.dataset.season;
  }, [active]);

  const startPreview = useCallback((id: string) => {
    try {
      localStorage.setItem(PREVIEW_KEY, id);
    } catch {
      /* ignore */
    }
    setPreviewRaw(id);
  }, []);

  const stopPreview = useCallback(() => {
    try {
      localStorage.removeItem(PREVIEW_KEY);
    } catch {
      /* ignore */
    }
    setPreviewRaw(null);
  }, []);

  const approve = useCallback(
    async (id: string, approved: boolean) => {
      if (!user || !admin) return { error: "Sem permissão" };
      const res = await setApproval(id, approved, user.id);
      if (!res.error) setApprovals((a) => ({ ...a, [id]: approved }));
      return res;
    },
    [user, admin],
  );

  return (
    <Ctx.Provider
      value={{ active, previewId, approvals, startPreview, stopPreview, approve }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSeasonalTheme(): SeasonalValue {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useSeasonalTheme must be used within SeasonalThemeProvider");
  return ctx;
}
