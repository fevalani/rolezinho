import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest} from "@vercel/node";

export const rpName = "Rolezinho Roots";
export const rpID = process.env.WEBAUTHN_RP_ID || "rolezinho-amigos.vercel.app";
export const origin = process.env.WEBAUTHN_ORIGIN || "https://rolezinho-amigos.vercel.app";

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if(!url || !serviceKey) {
        throw new Error("WebAuthn server env vars not set up");
    }

    if(!cachedAdmin) {
        cachedAdmin = createClient(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false},
        });
    }
    return cachedAdmin;
}

export async function getAuthenticatedUser(req: VercelRequest) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return null;

    const supabaseAdmin = getSupabaseAdmin();
    const token = authHeader.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;

    return data.user;
}