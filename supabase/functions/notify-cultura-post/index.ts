import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chunk, isAuthorized, isDeadToken } from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  const header = encode({ alg: "RS256", typ: "JWT" });
  const payload = encode({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const signingInput = `${header}.${payload}`;

  const pemContent = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----\n?/, "")
    .replace(/\n?-----END PRIVATE KEY-----\n?/, "")
    .replace(/\n/g, "");

  const binaryDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const jwt = `${signingInput}.${sigB64}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  return data.access_token as string;
}

async function sendFcmNotification(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
): Promise<boolean> {
  // devolve true quando o token está morto e deve ser removido
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          android: { priority: "high" },
        },
      }),
    },
  );
  if (res.ok) return false;
  const text = await res.text().catch(() => "");
  console.error(`FCM ${res.status}: ${text.slice(0, 200)}`);
  return isDeadToken(res.status, text);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Só o webhook do banco (que conhece o segredo) pode disparar push para todos.
  // Configure o header `Authorization: Bearer <WEBHOOK_SECRET>` no webhook e
  // `supabase secrets set WEBHOOK_SECRET=...`. Publique com `--no-verify-jwt`: o segredo não é um JWT, a checagem é esta aqui.
  if (!isAuthorized(req.headers.get("Authorization"), Deno.env.get("WEBHOOK_SECRET"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const record = payload.record;
  if (!record?.user_id || !record?.item_id) {
    return new Response("Bad request", { status: 400 });
  }

  const authorId = record.user_id as string;
  const itemId = record.item_id as string;
  const personalRating = record.personal_rating as number | null;

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const [profileRes, itemRes, tokensRes] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", authorId).maybeSingle(),
    db.from("cultura_items").select("title, type").eq("id", itemId).maybeSingle(),
    db.from("push_tokens").select("token").neq("user_id", authorId),
  ]);

  if (!profileRes.data || !itemRes.data || !tokensRes.data?.length) {
    return new Response("ok", { status: 200 });
  }

  const typeEmoji: Record<string, string> = {
    movie: "🎬",
    series: "📺",
    book: "📚",
    album: "🎵",
  };

  const emoji = typeEmoji[itemRes.data.type as string] ?? "🎭";
  const ratingStr = personalRating ? ` · ★ ${personalRating}/5` : "";
  const title = `${emoji} ${profileRes.data.display_name} indicou no Cultura`;
  const body = `"${itemRes.data.title}"${ratingStr}`;

  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!saRaw) return new Response("FCM not configured", { status: 500 });

  const sa = JSON.parse(saRaw) as ServiceAccount;
  const accessToken = await getAccessToken(sa);

  // Em lotes de 20, e apagando tokens que o FCM recusou de vez.
  const dead: string[] = [];
  for (const batch of chunk(tokensRes.data as { token: string }[], 20)) {
    const results = await Promise.all(
      batch.map(async ({ token }) => {
        try {
          return (await sendFcmNotification(accessToken, sa.project_id, token, title, body))
            ? token
            : null;
        } catch (e) {
          console.error("FCM falhou", e);
          return null;
        }
      }),
    );
    for (const t of results) if (t) dead.push(t);
  }
  if (dead.length) await db.from("push_tokens").delete().in("token", dead);

  return new Response("ok", { status: 200 });
});
