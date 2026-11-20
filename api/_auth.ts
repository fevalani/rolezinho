import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/**
 * Exige um JWT válido do Supabase (header `Authorization: Bearer <token>`).
 * Devolve o usuário, ou responde 401 e devolve null — o handler deve parar.
 * Arquivos com `_` em `api/` não viram rota na Vercel.
 */
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ id: string } | null> {
  const jwt = req.headers?.authorization?.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    res.status(401).json({ error: "Não autenticado" });
    return null;
  }
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL ?? "",
    process.env.VITE_SUPABASE_ANON_KEY ?? "",
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  const { data } = await supabase.auth.getUser(jwt);
  if (!data?.user) {
    res.status(401).json({ error: "Sessão inválida" });
    return null;
  }
  return { id: data.user.id };
}

/** Lê `?path=` como string única (rejeita array/ausente). */
export function pathParam(req: VercelRequest): string {
  const p = req.query?.path;
  return typeof p === "string" ? p : "";
}

/** Repassa a chamada com timeout; erro de rede/timeout vira 502 curto. */
export async function fetchUpstream(
  url: string,
  init: RequestInit,
  res: VercelResponse,
): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  } catch {
    res.status(502).json({ error: "Serviço externo indisponível" });
    return null;
  }
}
