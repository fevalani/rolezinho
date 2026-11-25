// Redimensiona e comprime imagens no cliente antes do upload (canvas → webp).

export const MAX_IMAGE_SIDE = 1200;
export const IMAGE_QUALITY = 0.82;
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

/** Escala (w, h) para caber em `max` no maior lado, sem ampliar. */
export function fitWithin(w: number, h: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Mensagem de erro se o arquivo não serve; null se está ok. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED.includes(file.type)) return "Escolha uma imagem (JPG, PNG ou WebP).";
  if (file.size > MAX_INPUT_BYTES) return "A imagem passa de 15 MB.";
  return null;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

/** Devolve um Blob webp (ou jpeg, se o navegador não gerar webp) com no máximo `max` px no maior lado. */
export async function compressImage(file: Blob, max = MAX_IMAGE_SIDE, quality = IMAGE_QUALITY): Promise<Blob> {
  const img = await loadImage(file);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, max);
  if (!width) throw new Error("Imagem inválida.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
  if (!blob) throw new Error("Não foi possível comprimir a imagem.");
  return blob;
}
