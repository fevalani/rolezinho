import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { FeatureFlagsProvider } from "@/lib/FeatureFlagsContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { effectiveFeatures } from "@/lib/featureFlagsLogic";
import { clearFeatureFlag, fetchFeatureFlags, setFeatureFlag } from "@/lib/featureFlagsService";
import { APP_FEATURES } from "@/lib/types";
import { HomePage } from "@/pages/HomePage";
import { AppShell } from "@/components/AppShell";
import { FeaturesSection } from "@/features/admin/FeaturesSection";
import { ADMIN_USER, TEST_USER, loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";
import type { ReactNode } from "react";

const feat = (id: string, enabled = true) => ({ id, name: id.toUpperCase(), icon: "x", path: `/${id}`, enabled, description: "" });

describe("effectiveFeatures", () => {
  const defaults = [feat("a"), feat("b"), feat("c", false)];
  it("sem chaves vale o padrão do código", () => {
    expect(effectiveFeatures(defaults, {}, false).map((f) => f.enabled)).toEqual([true, true, false]);
  });
  it("a chave do admin vence o padrão (ligar e desligar)", () => {
    const r = effectiveFeatures(defaults, { b: false, c: true }, false);
    expect(r.map((f) => f.enabled)).toEqual([true, false, true]);
    expect(r.map((f) => f.offForOthers)).toEqual([false, true, false]);
  });
  it("para o admin tudo é utilizável, e offForOthers diz o que os outros veem desligado", () => {
    const r = effectiveFeatures(defaults, { b: false }, true);
    expect(r.map((f) => f.enabled)).toEqual([true, true, true]);
    expect(r.map((f) => f.offForOthers)).toEqual([false, true, true]); // c: desligada no código
  });
  it("não muda a lista original", () => {
    effectiveFeatures(defaults, { a: false }, false);
    expect(defaults[0].enabled).toBe(true);
  });
});

describe("featureFlagsService", () => {
  it("fetchFeatureFlags mapeia e tolera erro", async () => {
    mockDb.tables.feature_flags = [{ feature_id: "bolao", enabled: false }, { feature_id: "dados", enabled: true }];
    expect(await fetchFeatureFlags()).toEqual({ bolao: false, dados: true });
    mockDb.errors.feature_flags = { message: "x" };
    expect(await fetchFeatureFlags()).toEqual({});
  });
  it("setFeatureFlag faz upsert por feature e clearFeatureFlag apaga", async () => {
    expect(await setFeatureFlag("bolao", false, "admin-1")).toEqual({ error: null });
    const w = mockDb.writes.find((x) => x.table === "feature_flags")!;
    expect(w.op).toBe("upsert");
    expect(w.args[0]).toMatchObject({ feature_id: "bolao", enabled: false, updated_by: "admin-1" });
    expect(w.args[1]).toEqual({ onConflict: "feature_id" });
    expect(await clearFeatureFlag("bolao")).toEqual({ error: null });
    expect(mockDb.queries.filter((q) => q.table === "feature_flags").flatMap((q) => q.calls)).toContainEqual(["eq", ["feature_id", "bolao"]]);
    mockDb.errors.feature_flags = { message: "denied" };
    expect((await setFeatureFlag("a", true, "u")).error).toBe("denied");
    expect((await clearFeatureFlag("a")).error).toBe("denied");
  });
});

function Gate({ children }: { children: ReactNode }) {
  const { loading, adminLoading, user, profile } = useAuth();
  return loading || adminLoading || (user && !profile) ? null : <>{children}</>;
}
const mountHome = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Gate>
          <FeatureFlagsProvider>
            <SeasonalThemeProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/" element={<HomePage />} />
                </Route>
              </Routes>
            </SeasonalThemeProvider>
          </FeatureFlagsProvider>
        </Gate>
      </AuthProvider>
    </MemoryRouter>,
  );
const bolao = APP_FEATURES.find((f) => f.id === "bolao")!;

describe("Home e menu com a feature desligada pelo admin", () => {
  beforeEach(() => {
    mockDb.tables.feature_flags = [{ feature_id: "bolao", enabled: false }];
  });

  it("usuário comum vê 'Em breve' e não consegue abrir", async () => {
    loginAs(TEST_USER);
    mountHome();
    const card = (await screen.findAllByText(bolao.name))[0].closest("button")!;
    await waitFor(() => expect(card).toBeDisabled());
    expect(within(card).getByText("Em breve")).toBeInTheDocument();
  });

  it("admin continua usando, com a marca 'Só admin'", async () => {
    loginAs(ADMIN_USER);
    mountHome();
    const card = (await screen.findAllByText(bolao.name))[0].closest("button")!;
    await waitFor(() => expect(within(card).getByText("Só admin")).toBeInTheDocument());
    expect(card).not.toBeDisabled();
  });

  it("sem chave nenhuma, tudo como no código", async () => {
    mockDb.tables.feature_flags = [];
    loginAs(TEST_USER);
    mountHome();
    const card = (await screen.findAllByText(bolao.name))[0].closest("button")!;
    expect(card).not.toBeDisabled();
    expect(within(card).queryByText("Em breve")).not.toBeInTheDocument();
  });
});

describe("FeaturesSection", () => {
  const open = async (flags: { feature_id: string; enabled: boolean }[] = []) => {
    loginAs(ADMIN_USER);
    mockDb.tables.feature_flags = flags;
    render(
      <MemoryRouter>
        <AuthProvider>
          <Gate>
            <FeatureFlagsProvider>
              <FeaturesSection />
            </FeatureFlagsProvider>
          </Gate>
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Features" });
  };

  it("lista todas as features com o estado atual", async () => {
    await open([{ feature_id: "bolao", enabled: false }]);
    expect(screen.getAllByRole("switch")).toHaveLength(APP_FEATURES.length);
    expect(await screen.findByLabelText(`${bolao.name} ligada para todos`)).not.toBeChecked();
    const other = APP_FEATURES.find((f) => f.id !== "bolao")!;
    expect(screen.getByLabelText(`${other.name} ligada para todos`)).toBeChecked();
    expect(screen.getByText(/Desligada \(Em breve\) · padrão do código: ligada/)).toBeInTheDocument();
  });

  it("desligar grava a chave", async () => {
    await open();
    fireEvent.click(await screen.findByLabelText(`${bolao.name} ligada para todos`));
    expect(await screen.findByText(`${bolao.name}: desligada.`)).toBeInTheDocument();
    const w = mockDb.writes.find((x) => x.table === "feature_flags" && x.op === "upsert")!;
    expect(w.args[0]).toMatchObject({ feature_id: "bolao", enabled: false, updated_by: "admin-1" });
  });

  it("restaurar apaga a chave e volta ao padrão", async () => {
    await open([{ feature_id: "bolao", enabled: false }]);
    await screen.findByText(/padrão do código/);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(await screen.findByText(`${bolao.name}: voltou ao padrão do código.`)).toBeInTheDocument();
    expect(mockDb.writes.some((x) => x.table === "feature_flags" && x.op === "delete")).toBe(true);
  });

  it("mostra o erro do banco", async () => {
    await open();
    mockDb.errors.feature_flags = { message: "permission denied" };
    fireEvent.click(await screen.findByLabelText(`${bolao.name} ligada para todos`));
    expect(await screen.findByText("Erro: permission denied")).toBeInTheDocument();
  });
});
