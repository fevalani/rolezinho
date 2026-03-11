/* eslint-disable no-misleading-character-class */
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { getInitials } from "@/lib/utils";

const EMOJI_AVATARS = [
  "🧙",
  "🧝",
  "🧛",
  "🧜",
  "🦊",
  "🐉",
  "🗡️",
  "🛡️",
  "⚔️",
  "🏹",
  "🔮",
  "🎲",
  "👑",
  "🦁",
  "🐺",
  "🦅",
];

/** Converte "YYYY-MM-DD" para exibição "DD/MM/AAAA" */
function birthdayToDisplay(raw: string | null): string {
  if (!raw) return "";
  const [yyyy, mm, dd] = raw.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

/** Converte input "DD/MM/AAAA" para storage "YYYY-MM-DD". Retorna null se inválido. */
function displayToBirthday(input: string): string | null {
  const clean = input.replace(/\D/g, "");
  if (clean.length < 8) return null;
  const dd = parseInt(clean.slice(0, 2));
  const mm = parseInt(clean.slice(2, 4));
  const yyyy = parseInt(clean.slice(4, 8));
  const currentYear = new Date().getFullYear();
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  if (yyyy < 1900 || yyyy > currentYear) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function ProfilePage() {
  const { user, profile, updateProfile, changePassword } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url ?? "");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Birthday: armazenamos no state como "DD/MM/AAAA" para exibição
  const [birthdayInput, setBirthdayInput] = useState(
    birthdayToDisplay(profile?.birthday ?? null),
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");

  const clearMsg = () => {
    setMessage("");
    setError("");
  };
  const clearPwMsg = () => {
    setPwMessage("");
    setPwError("");
  };

  const isEmoji = (str: string) => {
    try {
      const re = new RegExp("^[\\p{Emoji}\\u200d\\ufe0f]+$", "u");
      return re.test(str) && str.length <= 8;
    } catch {
      return false;
    }
  };
  const isImageUrl = (str: string) =>
    str.startsWith("http") || str.startsWith("blob:");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Imagem deve ter no máximo 2MB");
      return;
    }
    clearMsg();
    setPendingFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const uploadAvatar = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      console.error("Upload error:", upErr);
      return null;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  const handleSelectEmoji = (emoji: string) => {
    clearMsg();
    setPendingFile(null);
    setAvatarPreview(emoji);
  };

  const handleRemoveAvatar = () => {
    clearMsg();
    setPendingFile(null);
    setAvatarPreview("");
  };

  /** Formata o input como DD/MM/AAAA enquanto o usuário digita */
  const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearMsg();
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    setBirthdayInput(formatted);
  };

  const handleSave = async () => {
    clearMsg();
    const trimName = displayName.trim();
    if (!trimName || trimName.length < 2) {
      setError("Nome deve ter pelo menos 2 caracteres");
      return;
    }

    // Valida birthday se preenchido
    let birthdayValue: string | null = null;
    if (birthdayInput.trim()) {
      birthdayValue = displayToBirthday(birthdayInput);
      if (!birthdayValue) {
        setError("Data inválida. Use o formato DD/MM/AAAA (ex: 25/07/1995)");
        return;
      }
    }

    setSaving(true);
    let finalUrl = avatarPreview;

    if (pendingFile) {
      const url = await uploadAvatar(pendingFile);
      if (url) {
        finalUrl = url;
        setPendingFile(null);
      } else {
        setError("Erro ao enviar imagem. Tente novamente.");
        setSaving(false);
        return;
      }
    }

    try {
      await updateProfile({
        display_name: trimName,
        avatar_url: finalUrl || null,
        birthday: birthdayValue,
      });
      setMessage("Perfil atualizado!");
    } catch {
      setError("Erro ao salvar.");
    }
    setSaving(false);
  };

  const handleChangePw = async () => {
    clearPwMsg();
    if (newPassword.length < 6) {
      setPwError("Senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("As senhas não coincidem");
      return;
    }
    setChangingPw(true);
    const { error: err } = await changePassword(newPassword);
    if (err) {
      setPwError(err);
    } else {
      setPwMessage("Senha alterada!");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPw(false);
  };

  const inputClass =
    "w-full py-3 px-4 bg-[var(--bg-primary)] border border-[rgba(201,165,90,0.12)] rounded-lg text-[var(--text-primary)] outline-none transition-all focus:border-[var(--gold)] focus:shadow-[0_0_0_3px_rgba(201,165,90,0.08)] placeholder:text-[var(--text-muted)]";
  const btnGold =
    "w-full py-3 px-6 rounded-lg font-semibold text-[var(--bg-abyss)] bg-gradient-to-br from-[var(--gold-dark)] to-[var(--gold)] shadow-[0_2px_8px_rgba(0,0,0,0.5),0_0_12px_rgba(201,165,90,0.1)] hover:from-[var(--gold)] hover:to-[var(--gold-bright)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0";
  const btnOutline =
    "w-full py-3 px-6 rounded-lg font-semibold text-[var(--text-primary)] bg-transparent border border-[rgba(201,165,90,0.2)] hover:bg-[var(--bg-elevated)] hover:border-[var(--gold-dark)] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const msgError =
    "text-sm text-center py-2 px-3 rounded-lg text-[var(--red)] bg-[rgba(196,64,64,0.08)] border border-[rgba(196,64,64,0.15)]";
  const msgSuccess =
    "text-sm text-center py-2 px-3 rounded-lg text-[var(--green)] bg-[rgba(58,186,122,0.08)] border border-[rgba(58,186,122,0.15)]";
  const divider =
    "h-px bg-gradient-to-r from-transparent via-[rgba(201,165,90,0.1)] to-transparent my-1";

  return (
    <div className="py-5 px-5 min-h-[calc(100dvh-52px)]">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-[var(--gold-dark)] hover:text-[var(--gold)] text-sm font-medium transition-colors"
          >
            ← Voltar
          </button>
          <h1
            className="text-lg text-[var(--gold)] tracking-wide"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Meu Perfil
          </h1>
        </div>

        {/* Avatar preview */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full flex items-center justify-center border-2 border-[rgba(201,165,90,0.2)] bg-[var(--bg-card)] overflow-hidden">
            {isImageUrl(avatarPreview) ? (
              <img
                src={avatarPreview}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : isEmoji(avatarPreview) ? (
              <span className="text-5xl leading-none">{avatarPreview}</span>
            ) : (
              <span
                className="text-2xl font-bold text-[var(--gold)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {getInitials(profile?.display_name ?? "?")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-[var(--gold-dark)] hover:text-[var(--gold)] border border-[rgba(201,165,90,0.2)] hover:border-[var(--gold-dark)] rounded-lg px-3 py-1.5 transition-all bg-transparent"
            >
              📷 Enviar foto
            </button>
            {avatarPreview && (
              <button
                onClick={handleRemoveAvatar}
                className="text-xs text-[var(--red)] hover:text-red-400 border border-[rgba(196,64,64,0.2)] hover:border-[rgba(196,64,64,0.4)] rounded-lg px-3 py-1.5 transition-all bg-transparent"
              >
                ✕ Remover
              </button>
            )}
          </div>

          <p className="text-xs text-[var(--text-muted)] mt-1">
            ou escolha um avatar
          </p>
          <div className="grid grid-cols-8 gap-1.5 w-full max-w-xs">
            {EMOJI_AVATARS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSelectEmoji(emoji)}
                className={`aspect-square flex items-center justify-center text-xl rounded-lg transition-all cursor-pointer
                  ${
                    avatarPreview === emoji
                      ? "bg-[rgba(201,165,90,0.12)] border-2 border-[var(--gold)] shadow-[0_0_8px_rgba(201,165,90,0.2)] scale-110"
                      : "bg-[var(--bg-card)] border border-[rgba(201,165,90,0.06)] hover:bg-[var(--bg-elevated)] hover:border-[rgba(201,165,90,0.2)] hover:scale-110"
                  }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className={divider} />

        {/* Name */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-[var(--text-secondary)] font-semibold">
            Nome de aventureiro
          </label>
          <input
            type="text"
            value={displayName}
            maxLength={40}
            placeholder="Seu nome"
            onChange={(e) => {
              setDisplayName(e.target.value);
              clearMsg();
            }}
            className={inputClass}
          />
        </div>

        {/* Birthday */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-[var(--text-secondary)] font-semibold">
            🎂 Aniversário
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={birthdayInput}
            placeholder="DD/MM/AAAA"
            maxLength={10}
            onChange={handleBirthdayChange}
            className={inputClass}
          />
          <span className="text-[0.7rem] text-[var(--text-muted)] italic">
            Apenas para cálculo de idade — o ano não é exibido para outros
          </span>
        </div>

        {/* Email */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-[var(--text-secondary)] font-semibold">
            Email
          </label>
          <input
            type="email"
            value={profile?.email ?? ""}
            disabled
            className={`${inputClass} opacity-50 cursor-not-allowed`}
          />
          <span className="text-[0.7rem] text-[var(--text-muted)] italic">
            O email não pode ser alterado
          </span>
        </div>

        {error && <p className={msgError}>{error}</p>}
        {message && <p className={msgSuccess}>{message}</p>}

        <button onClick={handleSave} disabled={saving} className={btnGold}>
          {saving ? "Salvando..." : "Salvar perfil"}
        </button>

        <div className={divider} />

        {/* Password */}
        <div className="flex flex-col gap-3">
          <h2
            className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Alterar senha
          </h2>
          <input
            type="password"
            value={newPassword}
            placeholder="Nova senha (mínimo 6 caracteres)"
            onChange={(e) => {
              setNewPassword(e.target.value);
              clearPwMsg();
            }}
            className={inputClass}
          />
          <input
            type="password"
            value={confirmPassword}
            placeholder="Confirmar nova senha"
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              clearPwMsg();
            }}
            className={inputClass}
          />
          {pwError && <p className={msgError}>{pwError}</p>}
          {pwMessage && <p className={msgSuccess}>{pwMessage}</p>}
          <button
            onClick={handleChangePw}
            disabled={changingPw}
            className={btnOutline}
          >
            {changingPw ? "Alterando..." : "Alterar senha"}
          </button>
        </div>
      </div>
    </div>
  );
}
