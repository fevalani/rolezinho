import { useRef, useState } from "react";
import { hapticSuccess } from "@/lib/haptics";
import { compressImage, validateImageFile } from "@/lib/imageUpload";
import { useAuth } from "@/lib/AuthContext";
import { validateCategory, validateNominee } from "./awardsLogic";
import { uploadAwardImage } from "./awardsService";

export interface SheetValues {
  text: string;
  description: string;
  imageUrl: string | null;
}

/** Bottom sheet para criar/editar categoria ou indicado (texto e/ou imagem). */
export function NominationSheet({
  kind,
  title,
  initial,
  remaining,
  onClose,
  onSubmit,
}: {
  kind: "category" | "nominee";
  title: string;
  initial?: Partial<SheetValues>;
  /** Vagas restantes; mostrado como aviso (Infinity = sem limite). */
  remaining?: number;
  onClose: () => void;
  /** Devolve a mensagem de erro, ou null se deu certo (a sheet fecha). */
  onSubmit: (v: SheetValues) => Promise<string | null>;
}) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initial?.text ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async (file: File | undefined) => {
    if (!file || !user) return;
    const invalid = validateImageFile(file);
    if (invalid) return setError(invalid);
    setError(null);
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const { url, error: upErr } = await uploadAwardImage(user.id, blob);
      if (upErr || !url) setError(upErr ?? "Não foi possível enviar a imagem.");
      else setImageUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    const v = kind === "category" ? validateCategory(text) : validateNominee(text, !!imageUrl);
    if (!v.ok) return setError(v.error ?? "Dados inválidos.");
    setSaving(true);
    setError(null);
    const err = await onSubmit({ text: text.trim(), description: description.trim(), imageUrl });
    setSaving(false);
    if (err) return setError(err);
    hapticSuccess();
    onClose();
  };

  const field =
    "w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]";

  return (
    <>
      <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto glass-panel max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--gold)]" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            ✕
          </button>
        </div>

        {remaining !== undefined && Number.isFinite(remaining) && (
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {remaining} vaga{remaining !== 1 ? "s" : ""} restante{remaining !== 1 ? "s" : ""} para você
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="aw-text" className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
              {kind === "category" ? "Nome da categoria" : "Nome (opcional se tiver imagem)"}
            </label>
            <input
              id="aw-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === "category" ? "Ex: Melhor rolê do ano" : "Ex: Fulano"}
              maxLength={80}
              autoFocus
              className={field}
            />
          </div>

          {kind === "category" && (
            <div>
              <label htmlFor="aw-desc" className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
                Descrição (opcional)
              </label>
              <textarea
                id="aw-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                rows={2}
                className={field}
              />
            </div>
          )}

          <div>
            <span className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">Imagem (opcional)</span>
            {imageUrl ? (
              <div className="relative w-28 h-28">
                <img src={imageUrl} alt="Prévia" className="w-28 h-28 rounded-xl object-cover" />
                <button
                  onClick={() => setImageUrl(null)}
                  aria-label="Remover imagem"
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/80 text-white text-xs"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] py-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-60"
              >
                {uploading ? "Enviando…" : "📷 Escolher imagem"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="aw-file"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={() => void submit()}
            disabled={saving || uploading}
            className="w-full py-3 rounded-xl font-semibold text-black bg-[var(--gold)] disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </>
  );
}
