import { Capacitor } from "@capacitor/core";
import type { WrappedTheme } from "./wrappedTypes";

export interface ShareCardInput {
  title: string;
  userName: string;
  facts: { label: string; value: string }[];
  theme?: WrappedTheme;
}

const W = 1080;
const H = 1920;

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

/** Desenha o card 1080×1920 (formato story) direto no canvas — sem dependências. */
export function drawShareCard(canvas: HTMLCanvasElement, input: ShareCardInput): void {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const primary = input.theme?.primary ?? "#e8c86e";
  const secondary = input.theme?.secondary ?? "#7c5cff";
  const bg = input.theme?.background ?? "#05050a";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, c] of [[0, 0, primary], [W, H, secondary]] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 1300);
    g.addColorStop(0, c);
    g.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "800 96px system-ui, sans-serif";
  ctx.fillText(fit(ctx, input.title, W - 140), 70, 300);
  ctx.font = "500 46px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(fit(ctx, input.userName, W - 140), 70, 380);

  input.facts.slice(0, 4).forEach((f, i) => {
    const y = 560 + i * 280;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(70, y, W - 140, 230, 36);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "500 40px system-ui, sans-serif";
    ctx.fillText(f.label.toUpperCase(), 110, y + 78);
    ctx.fillStyle = primary;
    ctx.font = "800 84px system-ui, sans-serif";
    ctx.fillText(fit(ctx, f.value, W - 220), 110, y + 180);
  });

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText("Rolezinho Roots", 70, H - 90);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ShareResult = "shared" | "downloaded" | "cancelled" | "error";

/** Compartilha a imagem (Web Share / share nativo); sem suporte, baixa o arquivo. */
export async function shareImage(blob: Blob, filename: string, text: string): Promise<ShareResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import("@capacitor/filesystem"),
        import("@capacitor/share"),
      ]);
      const data = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = () => rej(r.error);
        r.readAsDataURL(blob);
      });
      const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
      await Share.share({ text, files: [uri] });
      return "shared";
    }
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return "shared";
    }
    download(blob, filename);
    return "downloaded";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "error";
  }
}

export function downloadImage(blob: Blob, filename: string) {
  download(blob, filename);
}
