import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { AppShell } from "@/components/AppShell";
import { enqueueWrite, pendingCount } from "@/lib/offlineQueue";
import { loginAs, TEST_USER, flush } from "./helpers";
import { mockDb } from "./supabaseMock";

function Gate({ children }: { children: ReactNode }) {
  const { loading, adminLoading } = useAuth();
  return loading || adminLoading ? null : <>{children}</>;
}

function mount() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Gate>
          <SeasonalThemeProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<div>tela</div>} />
              </Route>
            </Routes>
          </SeasonalThemeProvider>
        </Gate>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const gameWrites = () => mockDb.writes.filter((w) => w.table === "letreco_games");
const setOnline = (v: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(v);
afterEach(() => vi.restoreAllMocks());

const pendingGame = () =>
  enqueueWrite({
    key: "letreco_games:user-1:d",
    userId: TEST_USER.id,
    table: "letreco_games",
    row: { user_id: TEST_USER.id, game_date: "d", score: 5 },
    onConflict: "user_id,game_date",
  });

describe("AppShell offline", () => {
  it("sem internet mostra o aviso e quantas alterações aguardam envio", async () => {
    loginAs();
    setOnline(false);
    pendingGame();
    mount();
    await flush();
    const banner = await screen.findByTestId("offline-banner");
    expect(banner).toHaveTextContent("Sem internet");
    expect(banner).toHaveTextContent("1 alteração será enviada");
    expect(gameWrites()).toHaveLength(0);
  });

  it("online e sem pendências: sem aviso", async () => {
    loginAs();
    mount();
    expect(await screen.findByText("tela")).toBeInTheDocument();
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });

  it("ao abrir online com pendências, envia a fila sozinho", async () => {
    loginAs();
    pendingGame();
    mount();
    await waitFor(() => expect(pendingCount(TEST_USER.id)).toBe(0));
    expect(gameWrites()[0]).toMatchObject({ op: "upsert" });
  });

  it("quando a internet volta, envia a fila e o aviso some", async () => {
    loginAs();
    setOnline(false);
    pendingGame();
    mount();
    await screen.findByTestId("offline-banner");
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(pendingCount(TEST_USER.id)).toBe(0));
    await waitFor(() => expect(screen.queryByTestId("offline-banner")).toBeNull());
    expect(gameWrites()).toHaveLength(1);
  });
});
