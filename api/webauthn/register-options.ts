import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import {
    getAuthenticatedUser,
    getSupabaseAdmin,
    rpID,
    rpName,
} from "./_shared";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Método não permitido",
        });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const user = await getAuthenticatedUser(req);
        
        if (!user || !user.email) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }

        const { data: existingPasskeys, error: passkeysError } = await supabaseAdmin
            .from("user_passkeys")
            .select("id, transports")
            .eq("user_id", user.id);
        
        if (passkeysError) {
            return res.status(500).json({
                error:"Erro ao verificar chaves de acesso",
            });
        }

        if((existingPasskeys ?? []).length > 0) {
            return res.status(409).json({
                error: "Você já possui uma chave de acesso cadastrada."
            });
        }

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userName: user.email,
            userDisplayName: user.user_metadata?.name || user.email,
            attestationType: "none",
            excludeCredentials: (existingPasskeys ?? []).map((pk) => ({
                id: pk.id,
                transports: pk.transports,
            })),
            authenticatorSelection: {
                residentKey: "required",
                userVerification: "preferred",
            },
        });

        const { data: challengeRow, error } = await supabaseAdmin
            .from("webauthn_challenges")
            .insert({
                challenge: options.challenge,
                user_id: user.id,
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            })
            .select("id")
            .single();

        if (error) return res.status(500).json({ error: "Erro ao gerar chave" });
        return res.status(200).json({ options, challengeId: challengeRow.id });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Erro interno" });
    }

}

