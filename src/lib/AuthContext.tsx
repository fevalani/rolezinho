/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (
    updates: Partial<Pick<Profile, "display_name" | "avatar_url">>,
  ) => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

      // Auto-create on first login (DB trigger also does this, but belt-and-suspenders)
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
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id, s.user.email ?? "", s.user.user_metadata);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

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

      // Supabase pode exigir confirmação de email.
      // Se o user voltou sem session, precisa confirmar.
      if (data.user && !data.session) {
        return { error: null }; // success — show "check your email" message in the UI
      }
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Pick<Profile, "display_name" | "avatar_url">>) => {
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
        signIn,
        signUp,
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

/** Traduz erros comuns do Supabase Auth para PT-BR */
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
  };
  for (const [en, pt] of Object.entries(map)) {
    if (msg.includes(en)) return pt;
  }
  return msg;
}
