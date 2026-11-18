/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useAdmin } from "@/lib/useAdmin";
import { APP_FEATURES } from "@/lib/types";
import { effectiveFeatures, type EffectiveFeature, type FlagMap } from "./featureFlagsLogic";
import { fetchFeatureFlags } from "./featureFlagsService";

interface Value {
  flags: FlagMap;
  reload: () => Promise<void>;
}
const Ctx = createContext<Value | null>(null);

/** Carrega as chaves de features (ligada/desligada) do banco. Sem provider ou sem rede: padrão do código. */
export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [flags, setFlags] = useState<FlagMap>({});

  const reload = useCallback(async () => setFlags(await fetchFeatureFlags()), []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchFeatureFlags().then((f) => alive && setFlags(f));
    return () => {
      alive = false;
    };
  }, [user]);

  const value = useMemo(() => ({ flags, reload }), [flags, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFeatureFlags(): Value {
  return useContext(Ctx) ?? { flags: {}, reload: async () => {} };
}

/** As features do app já com as chaves do admin aplicadas (use no lugar de APP_FEATURES para exibir). */
export function useFeatures(): EffectiveFeature[] {
  const { flags } = useFeatureFlags();
  const { isAdmin } = useAdmin();
  return useMemo(() => effectiveFeatures(APP_FEATURES, flags, isAdmin), [flags, isAdmin]);
}
