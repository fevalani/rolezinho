import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import {
  SeasonalThemeProvider,
  useSeasonalTheme,
} from "@/lib/seasonal/SeasonalThemeContext";
import { fetchThemeRecords, setApproval, setWindow } from "@/lib/seasonal/seasonalService";
import { loginAs, ADMIN_USER, TEST_USER } from "./helpers";
import { mockDb } from "./supabaseMock";

type Ctx = ReturnType<typeof useSeasonalTheme>;
let ctx: Ctx | undefined;
function Probe() {
  const c = useSeasonalTheme();
  useEffect(() => {
    ctx = c;
  });
  return (
    <div>
      <span data-testid="active">{c.active?.id ?? "none"}</span>
      <span data-testid="preview">{c.previewId ?? "none"}</span>
    </div>
  );
}
function Ready({ children }: { children: React.ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
const mount = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Ready>
          <SeasonalThemeProvider>
            <Probe />
          </SeasonalThemeProvider>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("seasonalService", () => {
  it("fetchThemeRecords mapeia as linhas", async () => {
    mockDb.tables.seasonal_theme_approvals = [
      { theme_id: "natal", approved: true, start_md: "11-20", end_md: null },
    ];
    expect(await fetchThemeRecords()).toEqual({
      natal: { approved: true, start: "11-20", end: null },
    });
  });

  it("sem tabela/erro devolve vazio (nada aprovado)", async () => {
    mockDb.errors.seasonal_theme_approvals = { message: "relation does not exist" };
    expect(await fetchThemeRecords()).toEqual({});
  });

  it("setApproval faz upsert e devolve o erro do banco", async () => {
    expect(await setApproval("natal", true, "u1")).toEqual({ error: null });
    expect(mockDb.writes[0]).toMatchObject({
      table: "seasonal_theme_approvals",
      op: "upsert",
    });
    expect(mockDb.writes[0].args[0]).toMatchObject({ theme_id: "natal", approved: true });
    mockDb.errors.seasonal_theme_approvals = { message: "negado" };
    expect(await setApproval("natal", false, "u1")).toEqual({ error: "negado" });
  });

  it("setWindow grava start/end (null restaura o padrão)", async () => {
    await setWindow("natal", null, null, "u1");
    expect(mockDb.writes[0].args[0]).toMatchObject({ start_md: null, end_md: null });
  });
});

describe("SeasonalThemeProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 11, 10) }); // 10/12
    delete document.documentElement.dataset.season;
    ctx = undefined;
  });
  afterEach(() => vi.useRealTimers());

  it("sem aprovação nenhum tema liga", async () => {
    loginAs();
    mount();
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("none"));
    expect(document.documentElement.dataset.season).toBeUndefined();
  });

  it("tema aprovado e dentro da janela liga para todos", async () => {
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "natal", approved: true }];
    mount();
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("natal"));
    expect(document.documentElement.dataset.season).toBe("natal");
  });

  it("tema aprovado fora da janela não liga", async () => {
    vi.setSystemTime(new Date(2026, 5, 10));
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "natal", approved: true }];
    mount();
    await waitFor(() => expect(ctx).toBeDefined());
    await act(async () => {});
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("rascunho (não aprovado) nunca liga", async () => {
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "natal", approved: false }];
    mount();
    await act(async () => {});
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("admin pré-visualiza qualquer tema, mesmo rascunho e fora da janela", async () => {
    loginAs(ADMIN_USER);
    mount();
    await waitFor(() => expect(ctx).toBeDefined());
    act(() => ctx!.startPreview("pascoa"));
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("pascoa"));
    act(() => ctx!.stopPreview());
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("none"));
  });

  it("usuário comum não consegue pré-visualizar", async () => {
    loginAs(TEST_USER);
    mount();
    await waitFor(() => expect(ctx).toBeDefined());
    act(() => ctx!.startPreview("pascoa"));
    await act(async () => {});
    expect(screen.getByTestId("preview")).toHaveTextContent("none");
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("usuário comum não aprova nem altera período", async () => {
    loginAs(TEST_USER);
    mount();
    await waitFor(() => expect(ctx).toBeDefined());
    expect(await ctx!.approve("natal", true)).toEqual({ error: "Sem permissão" });
    expect(await ctx!.updateWindow("natal", "11-01", "12-01")).toEqual({ error: "Sem permissão" });
    expect(mockDb.writes.filter((w) => w.table === "seasonal_theme_approvals")).toHaveLength(0);
  });

  it("admin aprova e o tema passa a valer na hora", async () => {
    loginAs(ADMIN_USER);
    mount();
    await waitFor(() => expect(ctx).toBeDefined());
    await act(async () => {
      expect(await ctx!.approve("natal", true)).toEqual({ error: null });
    });
    expect(screen.getByTestId("active")).toHaveTextContent("natal");
  });

  it("admin altera o período (janela efetiva)", async () => {
    loginAs(ADMIN_USER);
    mount();
    await waitFor(() => expect(ctx).toBeDefined());
    await act(async () => {
      await ctx!.updateWindow("natal", "11-20", "12-31");
    });
    expect(ctx!.windows.natal).toEqual({ start: "11-20", end: "12-31" });
  });
});
