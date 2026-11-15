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
  normalizeOccasion,
  occasionToTheme,
  type Occasion,
  type OccasionInput,
} from "./occasions";
import { emojiHue } from "./emojiColor";
import { applyOccasionVars, clearOccasionVars } from "./occasionAssets";
import { deleteOccasionRow, fetchOccasions, saveOccasionRow } from "./occasionService";
import {
  fetchThemeRecords,
  setApproval,
  setWindow,
  type ThemeRecord,
} from "./seasonalService";

const PREVIEW_KEY = "rz_season_preview";

interface SeasonalValue {
  /** Os temas prontos (Natal...) e as ocasiões criadas pelo admin, todos como tema. */
  themes: SeasonalTheme[];
  /** Ocasiões criadas pelo admin. */
  occasions: Occasion[];
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
  /** Cria (sem id) ou edita (com id) uma ocasião. Só o admin. */
  saveOccasion: (
    input: OccasionInput & { id?: string },
  ) => Promise<{ error: string | null; occasion?: Occasion }>;
  removeOccasion: (id: string) => Promise<{ error: string | null }>;
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
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [previewRaw, setPreviewRaw] = useState<string | null>(readInitialPreview);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () => {
      fetchThemeRecords().then((r) => {
        if (alive) setRecords(r);
      });
      fetchOccasions().then((o) => {
        if (alive) setOccasions(o);
      });
    };
    load();
    // Reavalia ao voltar para o app (aprovação feita enquanto estava aberto)
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user]);

  const occasionThemes = useMemo(() => occasions.map(occasionToTheme), [occasions]);
  const themes = useMemo(
    () => [...SEASONAL_THEMES, ...occasionThemes],
    [occasionThemes],
  );

  // Pré-visualização só vale para o admin
  const previewId =
    admin && previewRaw && themes.some((t) => t.id === previewRaw)
      ? previewRaw
      : null;

  const approvals = useMemo(
    () => ({
      ...Object.fromEntries(
        Object.entries(records).map(([id, r]) => [id, r.approved]),
      ),
      // ocasião criada pelo admin vale assim que está ativada
      ...Object.fromEntries(occasionThemes.map((t) => [t.id, !!t.occasionData?.enabled])),
    }),
    [records, occasionThemes],
  );

  const windows = useMemo(
    () =>
      Object.fromEntries(
        themes.map((t) => [t.id, effectiveWindow(t, records[t.id])]),
      ),
    [themes, records],
  );

  const active = useMemo<SeasonalTheme | null>(() => {
    if (previewId) return themes.find((t) => t.id === previewId) ?? null;
    const today = new Date();
    // ocasião do admin tem prioridade sobre os temas prontos, se as datas coincidirem
    const order = [...occasionThemes, ...SEASONAL_THEMES];
    return (
      order.find((t) => approvals[t.id] && isInWindow(today, windows[t.id])) ??
      null
    );
  }, [previewId, themes, occasionThemes, approvals, windows]);

  useEffect(() => {
    const el = document.documentElement;
    if (active?.occasionData) {
      // cores vêm do emoji principal; a faixa, dos emojis escolhidos
      applyOccasionVars(el, active.occasionData, emojiHue(active.occasionData.emoji));
    } else {
      clearOccasionVars(el);
      if (active) el.dataset.season = active.id;
      else delete el.dataset.season;
    }
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

  const saveOccasion = useCallback(
    async (input: OccasionInput & { id?: string }) => {
      if (!user || !admin) return { error: "Sem permissão" };
      const parsed = normalizeOccasion(input);
      if (!parsed.occasion) return { error: parsed.error };
      const { occasion, error } = await saveOccasionRow(
        { ...parsed.occasion, id: input.id },
        user.id,
      );
      if (error || !occasion) return { error: error ?? "Erro ao salvar" };
      setOccasions((list) =>
        input.id
          ? list.map((o) => (o.id === occasion.id ? occasion : o))
          : [...list, occasion],
      );
      return { error: null, occasion };
    },
    [user, admin],
  );

  const removeOccasion = useCallback(
    async (id: string) => {
      if (!user || !admin) return { error: "Sem permissão" };
      const { error } = await deleteOccasionRow(id);
      if (!error) setOccasions((list) => list.filter((o) => o.id !== id));
      return { error };
    },
    [user, admin],
  );

  return (
    <Ctx.Provider
      value={{
        themes,
        occasions,
        active,
        previewId,
        approvals,
        windows,
        startPreview,
        stopPreview,
        approve,
        updateWindow,
        saveOccasion,
        removeOccasion,
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
