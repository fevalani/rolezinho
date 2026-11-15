// Serve o index.html do app com meta tags Open Graph do evento, para que
// WhatsApp/Telegram/etc. (que não executam JS) mostrem um preview bonito.
// Roteado por vercel.json: /agenda?evento=ID  ->  /api/og-agenda
// Os dados do evento vêm no próprio link (t, d, h, l, x) — sem consultar o banco.

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clip = (s: string | null, n: number) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0] ?? "https";
  const origin = `${proto}://${request.headers.get("host") ?? url.host}`;

  const base = await fetch(`${origin}/index.html`);
  let html = await base.text();

  const sp = url.searchParams;
  const title = clip(sp.get("t"), 80);
  const d = sp.get("d") ?? "";

  if (title && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const time = clip(sp.get("h"), 5);
    const loc = clip(sp.get("l"), 80);
    const desc = clip(sp.get("x"), 160);

    const dt = new Date(`${d}T12:00:00Z`);
    const when = dt.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    const line1 = [`📅 ${when}`, time && `🕐 ${time}`, loc && `📍 ${loc}`]
      .filter(Boolean)
      .join(" · ");
    const description = desc ? `${line1}\n${desc}` : line1;

    const image = `${origin}/api/og-agenda-image?d=${d}${time ? `&h=${encodeURIComponent(time)}` : ""}`;
    const pageUrl = `${origin}${url.pathname === "/api/og-agenda" ? "/agenda" : url.pathname}?evento=${encodeURIComponent(sp.get("evento") ?? "")}`;
    const ogTitle = `🎉 ${title}`;

    const tags = [
      `<title>${esc(ogTitle)}</title>`,
      `<meta name="description" content="${esc(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Rolezinho Roots" />`,
      `<meta property="og:title" content="${esc(ogTitle)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:url" content="${esc(pageUrl)}" />`,
      `<meta property="og:image" content="${esc(image)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(ogTitle)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      `<meta name="twitter:image" content="${esc(image)}" />`,
    ].join("\n    ");

    html = html
      .replace(/<title>[^<]*<\/title>/, "")
      .replace("</head>", `    ${tags}\n  </head>`);
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
