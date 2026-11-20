import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUpstream, pathParam, requireUser } from "./_auth";

// Só os endpoints que o app usa: partidas/tabela de um campeonato e uma partida.
// Sem "..", sem "//" e query só com caracteres simples.
const ALLOWED_PATH =
  /^\/(competitions\/[A-Za-z0-9]{2,10}\/(matches|standings)|matches\/\d{1,9})(\?[A-Za-z0-9=&._,-]{0,120})?$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireUser(req, res))) return;

  const path = pathParam(req);
  if (!ALLOWED_PATH.test(path)) {
    return res.status(400).json({ error: "Caminho não permitido" });
  }

  const apiRes = await fetchUpstream(
    `https://api.football-data.org/v4${path}`,
    {
      headers: {
        "X-Auth-Token":
          process.env.FOOTBALL_DATA_KEY ?? process.env.VITE_FOOTBALL_DATA_KEY ?? "",
      },
    },
    res,
  );
  if (!apiRes) return;

  const data = await apiRes.json().catch(() => ({ error: "Resposta inválida" }));
  // cota do plano grátis é 10 req/min: o CDN absorve usuários repetidos
  if (apiRes.status === 200) {
    res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
  }
  res.status(apiRes.status).json(data);
}
