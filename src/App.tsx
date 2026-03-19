import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { ProfilePage } from "@/pages/ProfilePage";
import { AppShell } from "@/components/AppShell";
import { TavernaPage } from "@/features/taverna/TavernaPage";
import { AniversariosPage } from "@/features/aniversarios/AniversariosPage";
import { RachaContaPage } from "./features/racha-conta/RachaContaPage";
import { RpgHomePage } from "@/features/rpg/RpgHomePage";
import { RpgTablePage } from "@/features/rpg/RpgTablePage";
import { RpgSheetPage } from "@/features/rpg/RpgSheetView";
import { MusicasPage } from "./features/musicas/MusciasPage";
import { AgendaPage } from "./features/agenda/AgendaPage";
import { CulturaPage } from "./features/cultura/CulturaPage";
import { BolaoPage } from "./features/bolao/BolaoPage";
import { BolaoDetailPage } from "./features/bolao/BolaoDetailPage";
import { ArenaPage } from "./features/arena/ArenaPage";
import { ArenaDetailPage } from "./features/arena/ArenaDetailPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-abyss)",
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/dados" element={<TavernaPage />} />
        <Route path="/racha-conta" element={<RachaContaPage />} />
        <Route path="/aniversarios" element={<AniversariosPage />} />
        <Route path="/rpg" element={<RpgHomePage />} />
        <Route path="/rpg/mesa/:tableId" element={<RpgTablePage />} />
        <Route path="/rpg/ficha/:sheetId" element={<RpgSheetPage />} />
        <Route path="/musicas" element={<MusicasPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/cultura" element={<CulturaPage />} />
        <Route path="/bolao" element={<BolaoPage />} />
        <Route path="/bolao/:poolId" element={<BolaoDetailPage />} />
        <Route path="/arena" element={<ArenaPage />} />
        <Route path="/arena/:duelId" element={<ArenaDetailPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
