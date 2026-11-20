/* eslint-disable react-refresh/only-export-components */
import { clearAllCache } from "@/lib/localCache";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  /** Papel de admin (vem do banco: função is_app_admin). Só esconde/mostra UI — a RLS é quem protege. */
  isAdmin: boolean;
  /** true enquanto o banco ainda não respondeu se este usuário é admin */
  adminLoading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: string | null }>;
  /** Envia o e-mail de redefinição de senha (não revela se o e-mail existe). */
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  /** true quando o usuário abriu o link do e-mail de recuperação e ainda precisa definir a nova senha. */
  recovering: boolean;
  /** Encerra o modo de recuperação (após definir a senha nova ou desistir). */
  finishRecovery: () => void;
  signOut: () => Promise<void>;
  updateProfile: (
    updates: Partial<
      Pick<
        Profile,
        | "display_name"
        | "avatar_url"
        | "birthday"
        | "hidden_features"
        | "theme"
        | "home_layout"
      >
    >,
  ) => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  // Resultado de is_app_admin() e de QUEM ele é (evita mostrar o papel de um usuário para outro)
  const [adminState, setAdminState] = useState<{ userId: string; value: boolean } | null>(null);

  const syncAppVersion = useCallback(async (userId: string) => {
    try {
      let version: string;
      if (Capacitor.isNativePlatform()) {
        // APK: versão nativa + versão do código web carregado (OTA), ex.:
        // "0.0.76 (76) · web 0.0.80". Site/navegador grava só "web 0.0.80".
        const info = await App.getInfo();
        version = `${info.version} (${info.build}) · web ${import.meta.env.VITE_APP_VERSION ?? "?"}`;
      } else {
        version = `web ${import.meta.env.VITE_APP_VERSION ?? "?"}`;
      }
      await supabase
        .from("profiles")
        .update({
          app_version: version,
          app_last_seen_at: new Date().toISOString(),
        })
        .eq("id", userId);
    } catch {
      // silently ignore — não bloqueia o fluxo de auth
    }
  }, []);

  const fetchProfile = useCallback(
    async (userId: string, email: string, meta?: Record<string, unknown>) => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (data) {
        setProfile(data as Profile);
        return;
      }

      const displayName =
        (meta?.full_name as string) ||
        (meta?.display_name as string) ||
        email.split("@")[0];

      const { data: created } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email,
          display_name: displayName,
          avatar_url: null,
          birthday: null,
        })
        .select()
        .single();

      if (created) {
        setProfile(created as Profile);
      }
    },
    [],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id, s.user.email ?? "", s.user.user_metadata);
        syncAppVersion(s.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id, s.user.email ?? "", s.user.user_metadata);
        syncAppVersion(s.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, syncAppVersion]);

  // Pergunta ao banco se o usuário é admin (a regra mora na tabela app_admins).
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      let value = false;
      try {
        const { data, error } = await supabase.rpc("is_app_admin");
        value = !error && data === true;
      } catch {
        value = false; // sem rede / função ausente: trata como não-admin
      }
      if (alive) setAdminState({ userId, value });
    })();
    return () => {
      alive = false;
    };
  }, [userId]);
  const adminLoading = !!userId && adminState?.userId !== userId;
  const isAdmin = !adminLoading && !!userId && adminState?.value === true;

  // Aplica o tema (claro/escuro) no documento inteiro via atributo — o CSS
  // troca as custom properties de cor num único lugar (global.css).
  useEffect(() => {
    document.documentElement.dataset.theme = profile?.theme ?? "dark";
  }, [profile?.theme]);

  // Modo beta (ver useBetaMode) é fixo — liga tratamentos visuais globais
  // via CSS puro (fonte, transição de tema) sem precisar de classe por componente.
  useEffect(() => {
    document.documentElement.dataset.beta = "true";
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: translateAuthError(error.message) };
    return { error: null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, display_name: name },
        },
      });
      if (error) return { error: translateAuthError(error.message) };
      if (data.user && !data.session) {
        return { error: null };
      }
      return { error: null };
    },
    [],
  );

  const resetPassword = useCallback(async (email: string) => {
    // O link do e-mail volta para este mesmo site (no APK, o site carregado por OTA).
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) return { error: translateAuthError(error.message) };
    return { error: null };
  }, []);

  const finishRecovery = useCallback(() => setRecovering(false), []);

  const signOut = useCallback(async () => {
    setRecovering(false);
    await supabase.auth.signOut();
    clearAllCache();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  const updateProfile = useCallback(
    async (
      updates: Partial<
        Pick<
          Profile,
          | "display_name"
          | "avatar_url"
          | "birthday"
          | "hidden_features"
          | "theme"
          | "home_layout"
        >
      >,
    ) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select()
        .single();
      if (data) setProfile(data as Profile);
    },
    [user],
  );

  const changePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: translateAuthError(error.message) };
    return { error: null };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        isAdmin,
        adminLoading,
        signIn,
        signUp,
        resetPassword,
        recovering,
        finishRecovery,
        signOut,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function translateAuthError(msg: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "Email ou senha incorretos",
    "Email not confirmed": "Confirme seu email antes de entrar",
    "User already registered": "Este email já está cadastrado",
    "Password should be at least 6 characters":
      "A senha deve ter pelo menos 6 caracteres",
    "Unable to validate email address: invalid format":
      "Formato de email inválido",
    "Signup requires a valid password": "Insira uma senha válida",
    "Email rate limit exceeded": "Muitas tentativas. Aguarde um momento.",
    "For security purposes, you can only request this after":
      "Aguarde antes de tentar novamente",
    "New password should be different from the old password":
      "A nova senha deve ser diferente da anterior",
    "Auth session missing": "Link expirado ou inválido. Peça um novo e-mail.",
  };
  for (const [en, pt] of Object.entries(map)) {
    if (msg.includes(en)) return pt;
  }
  return msg;
}
