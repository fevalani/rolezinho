import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ComponentType } from "react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { loginAs, flush, ADMIN_USER, TEST_USER } from "./helpers";

import { HomePage } from "@/pages/HomePage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { ThemesAdminPage } from "@/pages/ThemesAdminPage";
import { AppShell } from "@/components/AppShell";
import { TavernaPage } from "@/features/taverna/TavernaPage";
import { RachaContaPage } from "@/features/racha-conta/RachaContaPage";
import { AniversariosPage } from "@/features/aniversarios/AniversariosPage";
import { RpgHomePage } from "@/features/rpg/RpgHomePage";
import { RpgTablePage } from "@/features/rpg/RpgTablePage";
import { RpgSheetPage } from "@/features/rpg/RpgSheetView";
import { MusicasPage } from "@/features/musicas/MusciasPage";
import { AgendaPage } from "@/features/agenda/AgendaPage";
import { CulturaPage } from "@/features/cultura/CulturaPage";
import { BolaoPage } from "@/features/bolao/BolaoPage";
import { BolaoDetailPage } from "@/features/bolao/BolaoDetailPage";
import { ArenaPage } from "@/features/arena/ArenaPage";
import { ArenaDetailPage } from "@/features/arena/ArenaDetailPage";
import { LetrecoPage } from "@/features/letreco/LetrecoPage";
import { LetrosoGame } from "@/features/letreco/LetrosoGame";
import { SudokuGame } from "@/features/letreco/SudokuGame";
import { Word500Game } from "@/features/letreco/Word500Game";
import { FronteirasGame } from "@/features/letreco/FronteirasGame";
import { JumbledText } from "@/components/JumbledText";
import { MdPicker } from "@/components/MdPicker";
import { OccasionsAdmin } from "@/components/OccasionsAdmin";
import { RankingPage } from "@/features/ranking/RankingPage";
import { RankingDetailPage } from "@/features/ranking/RankingDetailPage";
import { DuelosPage } from "@/features/duelos/DuelosPage";
import { DuelosPlayPage } from "@/features/duelos/DuelosPlayPage";
import { ChatStatsPage } from "@/features/chatstats/ChatStatsPage";
import { ChatStatsAdminPage } from "@/features/chatstats/ChatStatsAdminPage";
import { WrappedPage } from "@/features/wrapped/WrappedPage";
import { WrappedAdminPage } from "@/features/wrapped/WrappedAdminPage";
import { AwardsPage } from "@/features/awards/AwardsPage";
import { AwardsCategoryPage } from "@/features/awards/AwardsCategoryPage";
import { AwardsBallotPage } from "@/features/awards/AwardsBallotPage";
import { AwardsAdminPage } from "@/features/awards/AwardsAdminPage";
import { AwardsManagePage } from "@/features/awards/AwardsManagePage";
import { AdminPage, AdminSectionPage } from "@/features/admin/AdminPage";

vi.mock("@capacitor/core", async (orig) => ({
  ...(await orig<typeof import("@capacitor/core")>()),
}));

interface Case {
  name: string;
  Component: ComponentType;
  pattern: string;
  route: string;
}

// Toda tela do app precisa montar sem quebrar, logada e com o banco vazio.
const PAGES: Case[] = [
  { name: "HomePage", Component: HomePage, pattern: "/", route: "/" },
  { name: "ProfilePage", Component: ProfilePage, pattern: "/profile", route: "/profile" },
  { name: "ThemesAdminPage", Component: ThemesAdminPage, pattern: "/temas", route: "/temas" },
  { name: "TavernaPage", Component: TavernaPage, pattern: "/dados", route: "/dados" },
  { name: "ResetPasswordPage", Component: ResetPasswordPage, pattern: "/redefinir-senha", route: "/redefinir-senha" },
  { name: "RachaContaPage", Component: RachaContaPage, pattern: "/racha-conta", route: "/racha-conta" },
  { name: "AniversariosPage", Component: AniversariosPage, pattern: "/aniversarios", route: "/aniversarios" },
  { name: "RpgHomePage", Component: RpgHomePage, pattern: "/rpg", route: "/rpg" },
  { name: "RpgTablePage", Component: RpgTablePage, pattern: "/rpg/mesa/:tableId", route: "/rpg/mesa/t1" },
  { name: "RpgSheetPage", Component: RpgSheetPage, pattern: "/rpg/ficha/:sheetId", route: "/rpg/ficha/s1" },
  { name: "MusicasPage", Component: MusicasPage, pattern: "/musicas", route: "/musicas" },
  { name: "AgendaPage", Component: AgendaPage, pattern: "/agenda", route: "/agenda" },
  { name: "CulturaPage", Component: CulturaPage, pattern: "/cultura", route: "/cultura" },
  { name: "BolaoPage", Component: BolaoPage, pattern: "/bolao", route: "/bolao" },
  { name: "BolaoDetailPage", Component: BolaoDetailPage, pattern: "/bolao/:poolId", route: "/bolao/p1" },
  { name: "ArenaPage", Component: ArenaPage, pattern: "/arena", route: "/arena" },
  { name: "ArenaDetailPage", Component: ArenaDetailPage, pattern: "/arena/:duelId", route: "/arena/d1" },
  { name: "LetrecoPage", Component: LetrecoPage, pattern: "/letreco", route: "/letreco" },
  { name: "LetrosoGame", Component: LetrosoGame, pattern: "/letroso", route: "/letroso" },
  { name: "SudokuGame", Component: SudokuGame, pattern: "/sudoku", route: "/sudoku" },
  { name: "Word500Game", Component: Word500Game, pattern: "/word500", route: "/word500" },
  { name: "FronteirasGame", Component: FronteirasGame, pattern: "/fronteiras", route: "/fronteiras" },
  { name: "JumbledText", Component: () => <JumbledText text="Atenção à Dislexia" />, pattern: "/jumble", route: "/jumble" },
  { name: "MdPicker", Component: () => <MdPicker label="Dia" value="11-16" onChange={() => {}} />, pattern: "/mdpicker", route: "/mdpicker" },
  { name: "OccasionsAdmin", Component: OccasionsAdmin, pattern: "/ocasioes", route: "/ocasioes" },
  { name: "RankingPage", Component: RankingPage, pattern: "/ranking", route: "/ranking" },
  { name: "RankingDetailPage", Component: RankingDetailPage, pattern: "/ranking/:tableId", route: "/ranking/r1" },
  { name: "DuelosPage", Component: DuelosPage, pattern: "/duelos", route: "/duelos" },
  { name: "DuelosPlayPage", Component: DuelosPlayPage, pattern: "/duelos/:id", route: "/duelos/d1" },
  { name: "WrappedPage", Component: WrappedPage, pattern: "/wrapped", route: "/wrapped" },
  { name: "ChatStatsPage", Component: ChatStatsPage, pattern: "/estatisticas", route: "/estatisticas" },
  { name: "ChatStatsAdminPage", Component: ChatStatsAdminPage, pattern: "/admin/estatisticas", route: "/admin/estatisticas" },
  { name: "AdminSectionEstatisticas", Component: AdminSectionPage, pattern: "/admin/:section", route: "/admin/estatisticas" },
  { name: "AdminPage", Component: AdminPage, pattern: "/admin", route: "/admin" },
  { name: "AdminSectionPage", Component: AdminSectionPage, pattern: "/admin/:section", route: "/admin/wrapped" },
  { name: "AdminSectionFeatures", Component: AdminSectionPage, pattern: "/admin/:section", route: "/admin/features" },
  { name: "AdminSectionUsuarios", Component: AdminSectionPage, pattern: "/admin/:section", route: "/admin/usuarios" },
  { name: "AdminSectionAdmins", Component: AdminSectionPage, pattern: "/admin/:section", route: "/admin/admins" },
  { name: "WrappedAdminPage", Component: WrappedAdminPage, pattern: "/wrapped-admin", route: "/wrapped-admin" },
  { name: "AwardsPage", Component: AwardsPage, pattern: "/awards", route: "/awards" },
  { name: "AwardsCategoryPage", Component: AwardsCategoryPage, pattern: "/awards/c/:categoryId", route: "/awards/c/c1" },
  { name: "AwardsBallotPage", Component: AwardsBallotPage, pattern: "/awards/votar", route: "/awards/votar" },
  { name: "AwardsManagePage", Component: AwardsManagePage, pattern: "/awards/gerenciar", route: "/awards/gerenciar" },
  { name: "AwardsAdminPage", Component: AwardsAdminPage, pattern: "/admin/awards", route: "/admin/awards" },
];

// Igual ao ProtectedRoute do App: só monta a tela depois da sessão carregada.
function Gate({ children }: { children: ReactNode }) {
  const { loading, adminLoading } = useAuth();
  return loading || adminLoading ? null : <>{children}</>;
}

function mount({ Component, pattern, route }: Case) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Gate>
          <SeasonalThemeProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path={pattern} element={<Component />} />
              </Route>
            </Routes>
          </SeasonalThemeProvider>
        </Gate>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("telas montam sem quebrar (logado, banco vazio)", () => {
  it.each(PAGES)("$name", async (c) => {
    loginAs(c.name === "ThemesAdminPage" || c.name.startsWith("Admin") ? ADMIN_USER : TEST_USER);
    const { container } = mount(c);
    await flush();
    // o shell do app (cabeçalho) aparece quando a tela monta
    await waitFor(() =>
      expect(container.querySelector("header")).toBeInTheDocument(),
    );
  });
});
