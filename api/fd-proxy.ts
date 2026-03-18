import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = (req.query.path as string) ?? "";
  const url = `https://api.football-data.org/v4${path}`;

  const apiRes = await fetch(url, {
    headers: { "X-Auth-Token": process.env.VITE_FOOTBALL_DATA_KEY ?? "" },
  });

  const data = await apiRes.json();
  res.status(apiRes.status).json(data);
}
