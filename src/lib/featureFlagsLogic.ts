import type { Feature } from "@/lib/types";

/** feature_id → ligada? (só as que o admin mexeu; o resto vale o padrão do código) */
export type FlagMap = Record<string, boolean>;

export interface EffectiveFeature extends Feature {
  /** desligada para os usuários comuns (o admin continua usando, para testar) */
  offForOthers: boolean;
}

/**
 * Aplica as chaves do admin sobre os padrões do código. Para o admin, tudo fica utilizável
 * (`enabled`), mas `offForOthers` diz o que os demais estão vendo como "Em breve".
 */
export function effectiveFeatures(defaults: Feature[], flags: FlagMap, isAdmin: boolean): EffectiveFeature[] {
  return defaults.map((f) => {
    const forOthers = flags[f.id] ?? f.enabled;
    return { ...f, enabled: isAdmin ? true : forOthers, offForOthers: !forOthers };
  });
}
