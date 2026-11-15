/* eslint-disable react-refresh/only-export-components */
import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { mockDb } from "./supabaseMock";

export const TEST_USER = {
  id: "user-1",
  email: "fulano@test.com",
  display_name: "Fulano",
};

export const ADMIN_USER = {
  id: "admin-1",
  email: "valanife@gmail.com",
  display_name: "Admin",
};

/** Deixa o mock do Supabase com um usuário logado e o perfil correspondente. */
export function loginAs(user: typeof TEST_USER = TEST_USER) {
  mockDb.session = {
    user: { id: user.id, email: user.email, user_metadata: {} },
  };
  const profile = {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: null,
    hidden_features: [] as string[],
    birthday: null,
    theme: "dark",
    home_layout: "grid",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  mockDb.tables.profiles = [profile, ...(mockDb.tables.profiles ?? [])];
  return profile;
}

/** Só monta a tela com a sessão E o perfil já carregados (app "assentado"). */
function Settled({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  if (loading || (user && !profile)) return null;
  return <>{children}</>;
}

/** Renderiza dentro de Router + AuthProvider (com o Supabase mockado). */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/" }: { route?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Settled>{ui}</Settled>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Espera o AuthProvider terminar de carregar a sessão. */
export const flush = () => new Promise((r) => setTimeout(r, 0));
