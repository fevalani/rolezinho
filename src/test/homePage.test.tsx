import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { FeatureFlagsProvider } from "@/lib/FeatureFlagsContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { HomePage } from "@/pages/HomePage";
import { DEV_MODE_KEY } from "@/lib/useDevMode";
import { loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";
import type { ReactNode } from "react";

function Gate({ children }: { children: ReactNode }) {
  const { loading, adminLoading, user, profile } = useAuth();
  return loading || adminLoading || (user && !profile) ? null : <>{children}</>;
}
function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}
const mountHome = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Gate>
          <FeatureFlagsProvider>
            <SeasonalThemeProvider>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="*" element={<Where />} />
              </Routes>
            </SeasonalThemeProvider>
          </FeatureFlagsProvider>
        </Gate>
      </AuthProvider>
    </MemoryRouter>,
  );

const seed = () => {
  mockDb.tables.profiles = [
    ...(mockDb.tables.profiles ?? []),
    { id: "p2", display_name: "Bia Lima", avatar_url: null, birthday: "1995-11-25" },
  ];
  mockDb.tables.agenda_events = [{ id: "e1", title: "Churrasco do Zé", event_date: "2026-11-22", event_time: "19:00" }];
  mockDb.tables.agenda_rsvps = [{ id: "r1" }, { id: "r2" }];
};

describe("HomePage — atalhos de próximo evento e aniversário", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 19, 12, 0, 0));
    loginAs();
    seed();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("fora do modo desenvolvedor não mostra os atalhos nem consulta a agenda", async () => {
    mountHome();
    await screen.findByText(/Olá, Fulano/);
    expect(screen.queryByText("Churrasco do Zé")).not.toBeInTheDocument();
    expect(screen.queryByText("em 6d")).not.toBeInTheDocument();
    expect(mockDb.queries.some((q) => q.table === "agenda_events")).toBe(false);
  });

  describe("no modo desenvolvedor", () => {
    beforeEach(() => localStorage.setItem(DEV_MODE_KEY, "1"));

    it("mostra o próximo evento (com contagem e confirmados) e o próximo aniversário", async () => {
      mountHome();
      expect(await screen.findByText("Churrasco do Zé")).toBeInTheDocument();
      expect(screen.getByText("em 3d")).toBeInTheDocument();
      expect(screen.getByText("2 confirmaram")).toBeInTheDocument();
      expect(screen.getByText("Bia")).toBeInTheDocument();
      expect(screen.getByText("em 6d")).toBeInTheDocument();
    });

    it("o card do evento abre a agenda já no evento", async () => {
      mountHome();
      fireEvent.click((await screen.findByText("Churrasco do Zé")).closest("button")!);
      await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/agenda?evento=e1"));
    });

    it("o card do aniversário abre a tela de aniversários", async () => {
      mountHome();
      fireEvent.click((await screen.findByText("Bia")).closest("button")!);
      await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/aniversarios"));
    });

    it("sem evento mostra só o aniversário; sem nada, nenhum atalho", async () => {
      mockDb.tables.agenda_events = [];
      mountHome();
      expect(await screen.findByText("em 6d")).toBeInTheDocument();
      expect(screen.queryByText("Churrasco do Zé")).not.toBeInTheDocument();
      expect(screen.queryByText(/confirmaram|confirmou/)).not.toBeInTheDocument();
    });

    it("sem ninguém com data e sem evento não aparece nenhum card", async () => {
      mockDb.tables.agenda_events = [];
      mockDb.tables.profiles = mockDb.tables.profiles!.filter((p) => p.id !== "p2");
      mountHome();
      await screen.findByText(/Olá, Fulano/);
      await waitFor(() => expect(mockDb.queries.some((q) => q.table === "agenda_events")).toBe(true));
      expect(screen.queryByText(/^(hoje|amanhã|em \d+d)$/)).not.toBeInTheDocument();
    });

    it("no dia do aniversário de alguém o card do próximo some", async () => {
      mockDb.tables.profiles = [...mockDb.tables.profiles!, { id: "p3", display_name: "Caio", avatar_url: null, birthday: "1992-11-19" }];
      mountHome();
      await screen.findByText("Churrasco do Zé");
      expect(screen.queryByText("em 6d")).not.toBeInTheDocument();
    });
  });
});
