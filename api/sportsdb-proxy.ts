import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = (req.query.path as string) ?? "";
  const url = `https://www.thesportsdb.com/api/v1/json/3${path}`;

  const apiRes = await fetch(url);
  const data = await apiRes.json();
  res.status(apiRes.status).json(data);
}
