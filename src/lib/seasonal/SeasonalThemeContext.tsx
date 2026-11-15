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
import {
  SEASONAL_THEMES,
  getTheme,
  effectiveWindow,
  isInWindow,
  type SeasonalTheme,
  type ThemeWindow,
} from "./themes";
import {
  fetchThemeRecords,
  setApproval,
  setWindow,
  type ThemeRecord,
} from "./seasonalService";

const PREVIEW_KEY = "rz_season_preview";

interface SeasonalValue {
  /** Tema aplicado agora (pré-visualização do admin ou tema aprovado na janela). */
  active: SeasonalTheme | null;
  /** O admin está pré-visualizando um tema (rascunho ou não)? */
  previewId: string | null;
  approvals: Record<string, boolean>;
  /** Janela efetiva (admin ou padrão) de cada tema. */
  windows: Record<string, ThemeWindow>;
  startPreview: (id: string) => void;
  stopPreview: () => void;
  approve: (id: string, approved: boolean) => Promise<{ error: string | null }>;
  /** start/end null = restaurar a janela padrão. */
  updateWindow: (
    id: string,
    start: string | null,
    end: string | null,
  ) => Promise<{ error: string | null }>;
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
  const [records, setRecords] = useState<Record<string, ThemeRecord>>({});
  const [previewRaw, setPreviewRaw] = useState<string | null>(readInitialPreview);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      fetchThemeRecords().then((r) => {
        if (alive) setRecords(r);
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

  const approvals = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(records).map(([id, r]) => [id, r.approved]),
      ),
    [records],
  );

  const windows = useMemo(
    () =>
      Object.fromEntries(
        SEASONAL_THEMES.map((t) => [t.id, effectiveWindow(t, records[t.id])]),
      ),
    [records],
  );

  const active = useMemo<SeasonalTheme | null>(() => {
    if (previewId) return getTheme(previewId);
    const today = new Date();
    return (
      SEASONAL_THEMES.find(
        (t) => approvals[t.id] && isInWindow(today, windows[t.id]),
      ) ?? null
    );
  }, [previewId, approvals, windows]);

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
      if (!res.error)
        setRecords((r) => ({
          ...r,
          [id]: { ...(r[id] ?? { start: null, end: null }), approved },
        }));
      return res;
    },
    [user, admin],
  );

  const updateWindow = useCallback(
    async (id: string, start: string | null, end: string | null) => {
      if (!user || !admin) return { error: "Sem permissão" };
      const res = await setWindow(id, start, end, user.id);
      if (!res.error)
        setRecords((r) => ({
          ...r,
          [id]: { ...(r[id] ?? { approved: false }), start, end },
        }));
      return res;
    },
    [user, admin],
  );

  return (
    <Ctx.Provider
      value={{
        active,
        previewId,
        approvals,
        windows,
        startPreview,
        stopPreview,
        approve,
        updateWindow,
      }}
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
