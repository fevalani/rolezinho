import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getSupabaseAdmin, rpID } from "./_shared";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") { 
        return res.status(405).json({
            error: "Método não permitido",
        });
    }
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { email } = req.body ?? {};
        let allowCredentials: { id: string; transports?: any[] }[] = [];

        if (email && typeof email === "string") {
            const { data: userId } = await supabaseAdmin.rpc("get_user_id_by_email", {
                p_email: email.trim().toLowerCase(),
            });

            if (userId) {
                const { data: passkeys } = await supabaseAdmin
                    .from("user_passkeys")
                    .select("id, transports")
                    .eq("user_id", userId);

                allowCredentials = (passkeys ?? []).map((pk) => ({
                    id: pk.id,
                    transports: pk.transports,
                }));
            }
        }

        const options = await generateAuthenticationOptions({
            rpID,
            userVerification: "preferred",
            allowCredentials,
        });

        const { data: challengeRow, error } = await supabaseAdmin
            .from("webauthn_challenges")
            .insert({
                challenge: options.challenge,
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            })
            .select("id")
            .single();

        if (error) return res.status(500).json({ error: "Erro ao realizar login com chave de acesso" });

        return res.status(200).json({ options, challengeId: challengeRow.id });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Erro interno" });
    }
}