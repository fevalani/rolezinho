import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import {
  SeasonalThemeProvider,
  useSeasonalTheme,
} from "@/lib/seasonal/SeasonalThemeContext";
import { fetchThemeRecords, setApproval, setWindow, setCustomization } from "@/lib/seasonal/seasonalService";
import { loginAs, ADMIN_USER, TEST_USER } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";

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
    // título/emoji/dia (colunas novas) ausentes viram null
    expect(await fetchThemeRecords()).toEqual({
      natal: { approved: true, start: "11-20", end: null, occasion: null, emoji: null, occasionMd: null },
    });
  });

  it("lê título, emoji e dia definidos pelo admin", async () => {
    mockDb.tables.seasonal_theme_approvals = [
      { theme_id: "confete", approved: true, start_md: "10-01", end_md: "10-03", custom_occasion: "Festa do grupo", custom_emoji: "🥳", occasion_md: "10-03" },
    ];
    expect((await fetchThemeRecords()).confete).toEqual({
      approved: true, start: "10-01", end: "10-03", occasion: "Festa do grupo", emoji: "🥳", occasionMd: "10-03",
    });
  });

  it("sem as colunas novas (migration não rodou) cai para o período e depois para só a aprovação", async () => {
    const real = supabaseMock.from.getMockImplementation()!;
    const selects: string[] = [];
    supabaseMock.from.mockImplementation((table: string) => {
      const b = real(table);
      return new Proxy(b, {
        get(t, prop: string) {
          if (prop !== "select") return t[prop];
          return (cols: string) => {
            selects.push(cols);
            // 1ª e 2ª tentativas falham (colunas inexistentes); a 3ª funciona
            if (selects.length < 3) return Promise.resolve({ data: null, error: { message: "column does not exist" } });
            return t.select(cols);
          };
        },
      });
    });
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "natal", approved: true }];
    const r = await fetchThemeRecords();
    expect(selects).toHaveLength(3);
    expect(selects[0]).toContain("custom_occasion");
    expect(selects[1]).not.toContain("custom_occasion");
    expect(selects[2]).toBe("theme_id, approved");
    expect(r.natal.approved).toBe(true);
    supabaseMock.from.mockImplementation(real);
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

describe("setCustomization", () => {
  it("grava título, emoji, dia e período de uma vez (null restaura o padrão)", async () => {
    await setCustomization(
      "confete",
      { occasion: "Festa do grupo", emoji: "🥳", occasionMd: "10-03", start: "09-26", end: "10-03" },
      "u1",
    );
    expect(mockDb.writes[0]).toMatchObject({ table: "seasonal_theme_approvals", op: "upsert" });
    expect(mockDb.writes[0].args[0]).toMatchObject({
      theme_id: "confete",
      custom_occasion: "Festa do grupo",
      custom_emoji: "🥳",
      occasion_md: "10-03",
      start_md: "09-26",
      end_md: "10-03",
    });
    await setCustomization("confete", { occasion: null, emoji: null, occasionMd: null, start: null, end: null }, "u1");
    expect(mockDb.writes[1].args[0]).toMatchObject({ custom_occasion: null, occasion_md: null, start_md: null });
  });
  it("devolve o erro do banco", async () => {
    mockDb.errors.seasonal_theme_approvals = { message: "negado" };
    expect(
      await setCustomization("confete", { occasion: "x", emoji: null, occasionMd: null, start: null, end: null }, "u1"),
    ).toEqual({ error: "negado" });
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

  it("o título, emoji e dia salvos pelo admin valem por cima do tema do código", async () => {
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [
      { theme_id: "confete", approved: true, start_md: "12-08", end_md: "12-12", custom_occasion: "Festa do grupo", custom_emoji: "🥳", occasion_md: "12-12" },
    ];
    mount();
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("confete"));
    expect(ctx!.active).toMatchObject({ id: "confete", occasion: "Festa do grupo", emoji: "🥳", occasionMdOverride: "12-12" });
    expect(ctx!.themes.find((t) => t.id === "confete")!.occasion).toBe("Festa do grupo");
    expect(ctx!.themes.find((t) => t.id === "natal")!.occasion).toBe("Natal"); // os outros não mudam
  });

  it("tema genérico ativo liga data-season-generic; os temas feitos à mão não", async () => {
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "natal", approved: true }];
    mount();
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("natal"));
    expect(document.documentElement.dataset.seasonGeneric).toBeUndefined();

    vi.setSystemTime(new Date(2026, 10, 16)); // 16/11: Atenção à Dislexia
    cleanup();
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "letras", approved: true }];
    mount();
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("letras"));
    expect(document.documentElement.dataset.season).toBe("letras");
    expect(document.documentElement.dataset.seasonGeneric).toBe("");
  });

  it("o tema da Dislexia entra sozinho em 16/11 depois de aprovado, e não nos dias vizinhos", async () => {
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "letras", approved: true }];
    vi.setSystemTime(new Date(2026, 10, 15));
    mount();
    await act(async () => {});
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    cleanup();
    vi.setSystemTime(new Date(2026, 10, 16));
    mount();
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("letras"));
    cleanup();
    vi.setSystemTime(new Date(2026, 10, 17));
    mount();
    await act(async () => {});
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("usuário comum não altera título/dia", async () => {
    loginAs(TEST_USER);
    mount();
    await waitFor(() => expect(ctx).toBeDefined());
    const c = { occasion: "x", emoji: null, occasionMd: null, start: null, end: null };
    expect(await ctx!.updateCustomization("confete", c)).toEqual({ error: "Sem permissão" });
    expect(mockDb.writes.filter((w) => w.table === "seasonal_theme_approvals")).toHaveLength(0);
  });

  it("admin salva título e dia e o tema muda na hora", async () => {
    loginAs(ADMIN_USER);
    mount();
    await waitFor(() => expect(ctx).toBeDefined());
    await act(async () => {
      const r = await ctx!.updateCustomization("confete", {
        occasion: "Festa do grupo", emoji: "🥳", occasionMd: "12-12", start: "12-08", end: "12-12",
      });
      expect(r).toEqual({ error: null });
    });
    expect(ctx!.themes.find((t) => t.id === "confete")).toMatchObject({ occasion: "Festa do grupo", emoji: "🥳", occasionMdOverride: "12-12" });
    expect(ctx!.windows.confete).toEqual({ start: "12-08", end: "12-12" });
    // restaurar o padrão
    await act(async () => {
      await ctx!.updateCustomization("confete", { occasion: null, emoji: null, occasionMd: null, start: null, end: null });
    });
    expect(ctx!.themes.find((t) => t.id === "confete")!.occasion).toBe("Carnaval");
  });
});
