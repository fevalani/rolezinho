import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Imagem de preview (OG) do evento: 📅 + dia do mês + dia da semana.
// GET /api/og-agenda-image?d=YYYY-MM-DD&h=HH:MM

type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown };
};

const h = (
  style: Record<string, unknown>,
  children?: unknown,
  type = "div",
): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children },
});

// O build Node de @vercel/og usa um `require` global; em módulo ESM ele não
// existe. Definimos antes de importar (por isso o import dinâmico).
async function loadImageResponse() {
  const g = globalThis as {
    require?: NodeRequire;
    __dirname?: string;
    __filename?: string;
  };
  g.require ??= createRequire(import.meta.url);
  // harfbuzzjs (dentro do satori) lê hb.wasm de __dirname
  // (vercel.json inclui o arquivo no pacote da função via includeFiles)
  const hbDir = join(process.cwd(), "node_modules", "harfbuzzjs");
  if (!existsSync(join(hbDir, "hb.wasm")))
    throw new Error(`hb.wasm não encontrado em ${hbDir}`);
  g.__filename ??= `${hbDir}/index.js`;
  g.__dirname ??= hbDir;
  return (await import("@vercel/og")).ImageResponse;
}

export async function GET(request: Request) {
  const ImageResponse = await loadImageResponse();
  const { searchParams } = new URL(request.url);
  const d = searchParams.get("d") ?? "";
  const time = (searchParams.get("h") ?? "").slice(0, 5);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(d);
  const date = new Date(`${valid ? d : "2000-01-01"}T12:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("pt-BR", { ...o, timeZone: "UTC" });

  const day = valid ? String(date.getUTCDate()) : "?";
  const weekday = valid ? fmt({ weekday: "long" }) : "";
  const month = valid ? fmt({ month: "long" }) : "";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const ring = (left: number) =>
    h({
      position: "absolute",
      top: -14,
      left,
      width: 26,
      height: 44,
      borderRadius: 13,
      background: "#08080f",
      border: "4px solid #f2ead8",
    });

  // Calendário desenhado (o emoji 📅 padrão mostra sempre "JUL 17")
  const calendar = h(
    {
      position: "relative",
      width: 460,
      height: 340,
      flexDirection: "column",
      borderRadius: 36,
      overflow: "hidden",
      background: "#f4efe4",
      boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
    },
    [
      h(
        {
          height: 96,
          alignItems: "center",
          justifyContent: "center",
          background: "#d9344a",
          color: "#fff",
          fontSize: 48,
          fontWeight: 800,
          letterSpacing: 6,
          paddingTop: 8,
        },
        month.toUpperCase(),
      ),
      h(
        {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          color: "#1d1b26",
          fontSize: 190,
          fontWeight: 800,
          lineHeight: 1,
          paddingBottom: 6,
        },
        day,
      ),
      ring(110),
      ring(324),
    ],
  );

  const tree = h(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #08080f 0%, #1a1530 100%)",
    },
    [
      calendar,
      h(
        { fontSize: 66, fontWeight: 700, color: "#f2ead8", marginTop: 34 },
        cap(weekday),
      ),
      time
        ? h({ fontSize: 38, color: "#e8c878", marginTop: 6 }, `🕐 ${time}`)
        : h({ height: 0 }),
      h(
        {
          fontSize: 24,
          letterSpacing: 6,
          color: "#8a7a52",
          marginTop: 22,
        },
        "ROLEZINHO ROOTS",
      ),
    ],
  );

  return new ImageResponse(tree as never, {
    width: 1200,
    height: 630,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
    },
  });
}
