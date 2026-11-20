// Regras puras da function (sem Deno/rede) — testadas em src/test/notifyCulturaLogic.test.ts.

/** Comparação em tempo constante, para não vazar o segredo pelo tempo de resposta. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** O webhook do banco manda `Authorization: Bearer <WEBHOOK_SECRET>`. Sem segredo configurado, nega tudo. */
export function isAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const token = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
  return token.length > 0 && safeEqual(token, secret);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Token que o FCM não aceita mais (app desinstalado etc.) deve ser apagado de push_tokens. */
export function isDeadToken(status: number, body: string): boolean {
  if (status === 404) return true;
  return /UNREGISTERED|INVALID_ARGUMENT.*registration token/i.test(body);
}
