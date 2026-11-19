import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { scheduleMusicReminder } from "@/lib/notificationService";
import { registerPushToken } from "@/lib/pushTokenService";
import { trackPageView } from "@/lib/analytics";
import { FeatureFlagsProvider } from "@/lib/FeatureFlagsContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { AdminPage, AdminRoute, AdminSectionPage } from "@/features/admin/AdminPage";
import { LoginPage } from "@/pages/LoginPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
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
import { LetrecoPage } from "./features/letreco/LetrecoPage";
import { RankingPage } from "./features/ranking/RankingPage";
import { RankingDetailPage } from "./features/ranking/RankingDetailPage";
import { DuelosPage } from "./features/duelos/DuelosPage";
import { DuelosPlayPage } from "./features/duelos/DuelosPlayPage";
import { WrappedPage } from "./features/wrapped/WrappedPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, recovering } = useAuth();

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

  // Veio do link do e-mail de recuperação: define a senha nova antes de entrar no app.
  if (user && recovering) {
    return <ResetPasswordPage />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // App Links: https://rolezinho-amigos.vercel.app/agenda?evento=ID abre no app
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = CapApp.addListener("appUrlOpen", ({ url }) => {
      try {
        const u = new URL(url);
        navigate(u.pathname + u.search + u.hash);
      } catch {
        // URL inválida — ignora
      }
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [navigate]);

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (user) {
      scheduleMusicReminder();
      registerPushToken(user.id);
    }
  }, [user]);

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
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<AdminPage />} />
          <Route path=":section" element={<AdminSectionPage />} />
        </Route>
        {/* endereços antigos (continuam funcionando) */}
        <Route path="/temas" element={<Navigate to="/admin/temas" replace />} />
        <Route path="/wrapped-admin" element={<Navigate to="/admin/wrapped" replace />} />
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
        <Route path="/letreco" element={<LetrecoPage />} />
        <Route path="/ranking" element={<RankingPage />} />
        <Route path="/ranking/:tableId" element={<RankingDetailPage />} />
        <Route path="/duelos" element={<DuelosPage />} />
        <Route path="/duelos/:id" element={<DuelosPlayPage />} />
        <Route path="/wrapped" element={<WrappedPage />} />
        <Route path="/wrapped/:slug" element={<WrappedPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeatureFlagsProvider>
          <SeasonalThemeProvider>
            <AppRoutes />
          </SeasonalThemeProvider>
        </FeatureFlagsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
