import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Suspense, lazy, useEffect, type ComponentType } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { scheduleMusicReminder } from "@/lib/notificationService";
import { registerPushToken } from "@/lib/pushTokenService";
import { trackPageView } from "@/lib/analytics";
import { FeatureFlagsProvider } from "@/lib/FeatureFlagsContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { LoginPage } from "@/pages/LoginPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { HomePage } from "@/pages/HomePage";
import { AppShell } from "@/components/AppShell";

// Code-splitting (auditoria P-01): cada tela vira um chunk baixado só quando a rota abre.
// Home, shell, login e rota protegida ficam no bundle inicial.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyNamed<M extends Record<string, any>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const AdminPage = lazyNamed(
  () => import("@/features/admin/AdminPage"),
  "AdminPage",
);
const AdminRoute = lazyNamed(
  () => import("@/features/admin/AdminPage"),
  "AdminRoute",
);
const AdminSectionPage = lazyNamed(
  () => import("@/features/admin/AdminPage"),
  "AdminSectionPage",
);
const ProfilePage = lazyNamed(
  () => import("@/pages/ProfilePage"),
  "ProfilePage",
);
const TavernaPage = lazyNamed(
  () => import("@/features/taverna/TavernaPage"),
  "TavernaPage",
);
const AniversariosPage = lazyNamed(
  () => import("@/features/aniversarios/AniversariosPage"),
  "AniversariosPage",
);
const RachaContaPage = lazyNamed(
  () => import("./features/racha-conta/RachaContaPage"),
  "RachaContaPage",
);
const RpgHomePage = lazyNamed(
  () => import("@/features/rpg/RpgHomePage"),
  "RpgHomePage",
);
const RpgTablePage = lazyNamed(
  () => import("@/features/rpg/RpgTablePage"),
  "RpgTablePage",
);
const RpgSheetPage = lazyNamed(
  () => import("@/features/rpg/RpgSheetView"),
  "RpgSheetPage",
);
const MusicasPage = lazyNamed(
  () => import("./features/musicas/MusciasPage"),
  "MusicasPage",
);
const AgendaPage = lazyNamed(
  () => import("./features/agenda/AgendaPage"),
  "AgendaPage",
);
const CulturaPage = lazyNamed(
  () => import("./features/cultura/CulturaPage"),
  "CulturaPage",
);
const BolaoPage = lazyNamed(
  () => import("./features/bolao/BolaoPage"),
  "BolaoPage",
);
const BolaoDetailPage = lazyNamed(
  () => import("./features/bolao/BolaoDetailPage"),
  "BolaoDetailPage",
);
const ArenaPage = lazyNamed(
  () => import("./features/arena/ArenaPage"),
  "ArenaPage",
);
const ArenaDetailPage = lazyNamed(
  () => import("./features/arena/ArenaDetailPage"),
  "ArenaDetailPage",
);
const LetrecoPage = lazyNamed(
  () => import("./features/letreco/LetrecoPage"),
  "LetrecoPage",
);
const RankingPage = lazyNamed(
  () => import("./features/ranking/RankingPage"),
  "RankingPage",
);
const RankingDetailPage = lazyNamed(
  () => import("./features/ranking/RankingDetailPage"),
  "RankingDetailPage",
);
const DuelosPage = lazyNamed(
  () => import("./features/duelos/DuelosPage"),
  "DuelosPage",
);
const DuelosPlayPage = lazyNamed(
  () => import("./features/duelos/DuelosPlayPage"),
  "DuelosPlayPage",
);
const WrappedPage = lazyNamed(
  () => import("./features/wrapped/WrappedPage"),
  "WrappedPage",
);

const ChatStatsPage = lazyNamed(
  () => import("./features/chatstats/ChatStatsPage"),
  "ChatStatsPage",
);

function RouteFallback() {
  return (
    <div
      className="flex justify-center py-12"
      role="status"
      aria-label="Carregando"
    >
      <div className="spinner" />
    </div>
  );
}

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
    <Suspense fallback={<RouteFallback />}>
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
          <Route
            path="/temas"
            element={<Navigate to="/admin/temas" replace />}
          />
          <Route
            path="/wrapped-admin"
            element={<Navigate to="/admin/wrapped" replace />}
          />
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
          <Route path="/estatisticas" element={<ChatStatsPage />} />
          <Route path="/estatisticas/:slug" element={<ChatStatsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
