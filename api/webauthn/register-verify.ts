import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import {
    getAuthenticatedUser,
    getSupabaseAdmin,
    origin,
    rpID,
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
        if (!user) return res.status(401).json({ error: "Usuário não autenticado" });

        const { credential, challengeId, friendlyName } = req.body ?? {};
        if (!credential || !challengeId) {
            return res.status(400).json({ error: "Dados inválidos" });
        }

        const { data: challengeRow } = await supabaseAdmin
            .from("webauthn_challenges")
            .select("*")
            .eq("id", challengeId)
            .eq("user_id", user.id)
            .gt("expires_at", new Date().toISOString())
            .single();

        if (!challengeRow) {
            return res.status(400).json({ error: "Chave expirada ou inválida" });
        }

        await supabaseAdmin.from("webauthn_challenges").delete().eq("id", challengeId);

        const verification = await verifyRegistrationResponse({
            response: credential,
            expectedChallenge: challengeRow.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({ error: "Autenticação falhou" });
        }

        const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

        const { error: insertError } = await supabaseAdmin
            .from("user_passkeys")
            .insert({
                id: cred.id,
                user_id: user.id,
                public_key: Buffer.from(cred.publicKey).toString("base64"),
                counter: cred.counter,
                transports: cred.transports ?? [],
                device_type: credentialDeviceType,
                backed_up: credentialBackedUp,
                friendly_name:
                    typeof friendlyName === "string" && friendlyName.trim()
                        ? friendlyName.trim().slice(0, 60)
                        : "Dispositivo",
            });

        if (insertError) {
            return res.status(500).json({ error: "Erro ao salvar chave de segurança" });
        }

        return res.status(200).json({ verified: true });
    } catch (err: any) {
        return res.status(400).json({ error: err?.message || "Erro na autenticação" });
    }
}