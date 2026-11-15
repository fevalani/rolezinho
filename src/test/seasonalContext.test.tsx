import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import {
  SeasonalThemeProvider,
  useSeasonalTheme,
} from "@/lib/seasonal/SeasonalThemeContext";
import { fetchThemeRecords, setApproval, setWindow } from "@/lib/seasonal/seasonalService";
import { loginAs, ADMIN_USER, TEST_USER } from "./helpers";
import { mockDb } from "./supabaseMock";
import { OCCASION_VAR_NAMES } from "@/lib/seasonal/occasionAssets";

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

  describe("ocasiões criadas pelo admin", () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: "o1", title: "Dia do Amigo", emoji: "🤝", extras: ["🍻", "🎉"], day_md: "12-10", days_before: 2, jumble: false, enabled: true, ...over,
    });

    it("ocasião ativada e dentro do período liga sozinha, sem aprovação separada", async () => {
      loginAs();
      mockDb.tables.seasonal_occasions = [row()]; // 08–10/12; hoje é 10/12
      mount();
      await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("oc:o1"));
      expect(document.documentElement.dataset.season).toBe("ocasiao");
      expect(ctx!.active).toMatchObject({ occasion: "Dia do Amigo", emoji: "🤝", occasionMdOverride: "12-10" });
      expect(ctx!.occasions).toHaveLength(1);
    });

    it("liga as variáveis CSS (tom, emoji e faixa) e as tira quando sai do ar", async () => {
      loginAs();
      mockDb.tables.seasonal_occasions = [row()];
      mount();
      await waitFor(() => expect(document.documentElement.dataset.season).toBe("ocasiao"));
      const st = document.documentElement.style;
      expect(st.getPropertyValue("--occ-emoji")).toBe('"🤝"');
      expect(st.getPropertyValue("--p-h")).not.toBe("");
      expect(st.getPropertyValue("--occ-garland")).toContain("data:image/svg+xml");
      cleanup();
      vi.setSystemTime(new Date(2026, 5, 1)); // fora do período
      mount();
      await act(async () => {});
      for (const n of OCCASION_VAR_NAMES) expect(st.getPropertyValue(n)).toBe("");
      expect(document.documentElement.dataset.season).toBeUndefined();
    });

    it("desativada ou fora do período não liga", async () => {
      loginAs();
      mockDb.tables.seasonal_occasions = [row({ enabled: false }), row({ id: "o2", day_md: "03-01" })];
      mount();
      await waitFor(() => expect(ctx?.occasions).toHaveLength(2));
      expect(screen.getByTestId("active")).toHaveTextContent("none");
    });

    it("tem prioridade sobre um tema pronto no mesmo dia", async () => {
      loginAs();
      mockDb.tables.seasonal_theme_approvals = [{ theme_id: "natal", approved: true }]; // 01–26/12
      mockDb.tables.seasonal_occasions = [row()];
      mount();
      await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("oc:o1"));
    });

    it("as ocasiões entram na lista de temas (pré-visualização, banner)", async () => {
      loginAs();
      mockDb.tables.seasonal_occasions = [row({ day_md: "03-01" })];
      mount();
      await waitFor(() => expect(ctx?.themes.some((t) => t.id === "oc:o1")).toBe(true));
      expect(ctx!.themes.length).toBeGreaterThan(4);
    });

    it("admin pré-visualiza uma ocasião mesmo fora do período; usuário comum não", async () => {
      loginAs(ADMIN_USER);
      mockDb.tables.seasonal_occasions = [row({ day_md: "03-01" })];
      mount();
      await waitFor(() => expect(ctx?.occasions).toHaveLength(1));
      act(() => ctx!.startPreview("oc:o1"));
      await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("oc:o1"));
      act(() => ctx!.stopPreview());
      await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("none"));
    });

    it("usuário comum não cria, edita nem exclui", async () => {
      loginAs(TEST_USER);
      mount();
      await waitFor(() => expect(ctx).toBeDefined());
      expect(await ctx!.saveOccasion({ title: "x", emoji: "🎉", dayMd: "01-01" })).toEqual({ error: "Sem permissão" });
      expect(await ctx!.removeOccasion("o1")).toEqual({ error: "Sem permissão" });
      expect(mockDb.writes.filter((w) => w.table === "seasonal_occasions")).toHaveLength(0);
    });

    it("admin cria: valida, grava e a ocasião aparece/entra no ar na hora", async () => {
      loginAs(ADMIN_USER);
      mount();
      await waitFor(() => expect(ctx).toBeDefined());
      expect((await ctx!.saveOccasion({ title: " ", emoji: "🎉", dayMd: "12-10" })).error).toBe("Escreva um título.");
      expect(mockDb.writes.filter((w) => w.table === "seasonal_occasions")).toHaveLength(0);
      mockDb.tables.seasonal_occasions = [row()]; // o que o banco devolve ao inserir
      await act(async () => {
        const r = await ctx!.saveOccasion({ title: "Dia do Amigo", emoji: "🤝", extras: "🍻 🎉", dayMd: "12-10", daysBefore: 2 });
        expect(r.error).toBeNull();
      });
      expect(mockDb.writes.find((w) => w.table === "seasonal_occasions")!.op).toBe("insert");
      expect(screen.getByTestId("active")).toHaveTextContent("oc:o1");
    });

    it("admin edita (atualiza a lista) e exclui", async () => {
      loginAs(ADMIN_USER);
      mockDb.tables.seasonal_occasions = [row()];
      mount();
      await waitFor(() => expect(ctx?.occasions).toHaveLength(1));
      mockDb.tables.seasonal_occasions = [row({ title: "Dia do Amigo 2" })];
      await act(async () => {
        await ctx!.saveOccasion({ id: "o1", title: "Dia do Amigo 2", emoji: "🤝", dayMd: "12-10" });
      });
      expect(ctx!.occasions[0].title).toBe("Dia do Amigo 2");
      expect(mockDb.writes.find((w) => w.table === "seasonal_occasions")!.op).toBe("update");
      await act(async () => {
        expect(await ctx!.removeOccasion("o1")).toEqual({ error: null });
      });
      expect(ctx!.occasions).toHaveLength(0);
      expect(screen.getByTestId("active")).toHaveTextContent("none");
    });

    it("erro do banco ao salvar volta para a tela e não muda a lista", async () => {
      loginAs(ADMIN_USER);
      mount();
      await waitFor(() => expect(ctx).toBeDefined());
      mockDb.errors.seasonal_occasions = { message: "permission denied" };
      let r: { error: string | null } | undefined;
      await act(async () => {
        r = await ctx!.saveOccasion({ title: "x", emoji: "🎉", dayMd: "01-01" });
      });
      expect(r!.error).toBe("permission denied");
      expect(ctx!.occasions).toHaveLength(0);
    });
  });
});
