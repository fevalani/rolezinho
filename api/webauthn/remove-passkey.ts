import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthenticatedUser, getSupabaseAdmin } from "./_shared";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido",
    });
  }

  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Usuário não autenticado",
      });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("user_passkeys")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      return res.status(500).json({
        error: "Erro ao remover a chave de acesso",
      });
    }

    return res.status(200).json({
      removed: true,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || "Erro interno",
    });
  }
}