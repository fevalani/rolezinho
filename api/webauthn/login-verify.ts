import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getSupabaseAdmin, origin, rpID } from "./_shared";


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Método não permitido",
        });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { credential, challengeId } = req.body ?? {};
        if (!credential?.id || !challengeId) {
            return res.status(400).json({ error: "Dados inválidos" });
        }

        const { data: challengeRow } = await supabaseAdmin
            .from("webauthn_challenges")
            .select("*")
            .eq("id", challengeId)
            .gt("expires_at", new Date().toISOString())
            .single();

        if (!challengeRow) {
            return res.status(400).json({ error: "Chave de acesso expirada ou inválida." })
        }

        await supabaseAdmin.from("webauthn_challenges").delete().eq("id", challengeId);

        const { data: passkey } = await supabaseAdmin
            .from("user_passkeys")
            .select("*")
            .eq("id", credential.id)
            .single();

        if (!passkey) {
            return res.status(400).json({ error: "Chave não encontrada" });
        }

        const verification = await verifyAuthenticationResponse({
            response: credential,
            expectedChallenge: challengeRow.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
                id: passkey.id,
                publicKey: new Uint8Array(Buffer.from(passkey.public_key, "base64")),
                counter: passkey.counter,
                transports: passkey.transports,
            },
        });

        if (!verification.verified) {
            return res.status(401).json({ error: "Falha na autenticação" });
        }

        await supabaseAdmin
            .from("user_passkeys")
            .update({ counter: verification.authenticationInfo.newCounter })
            .eq("id", passkey.id);

        const { data: userData, error: userErr } =
            await supabaseAdmin.auth.admin.getUserById(passkey.user_id);

        if (userErr || !userData.user?.email) {
            return res.status(500).json({ error: "Usuário não encontrado" });

        }

        const { data: linkData, error: linkErr } =
            await supabaseAdmin.auth.admin.generateLink({
                type: "magiclink",
                email: userData.user.email,
            });

        if (linkErr || !linkData.properties?.hashed_token) {
            return res.status(500).json({ error: "Erro ao gerar sessão" });
        }

        return res.status(200).json({
            verified: true,
            token_hash: linkData.properties.hashed_token,
        });
    } catch (err: any) {
        return res.status(400).json({ error: err?.message || "Erro ao validar chave de acesso" });
    }
}