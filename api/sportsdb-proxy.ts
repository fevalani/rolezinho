import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUpstream, pathParam, requireUser } from "./_auth";

// Endpoints `.php` simples do TheSportsDB (ex.: /eventsday.php?d=2026-06-11&s=Soccer).
const ALLOWED_PATH = /^\/[a-z]{3,30}\.php(\?[A-Za-z0-9=&._%+-]{0,120})?$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireUser(req, res))) return;

  const path = pathParam(req);
  if (!ALLOWED_PATH.test(path)) {
    return res.status(400).json({ error: "Caminho não permitido" });
  }

  const apiRes = await fetchUpstream(
    `https://www.thesportsdb.com/api/v1/json/3${path}`,
    {},
    res,
  );
  if (!apiRes) return;

  const data = await apiRes.json().catch(() => ({ error: "Resposta inválida" }));
  if (apiRes.status === 200) {
    res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
  }
  res.status(apiRes.status).json(data);
}
