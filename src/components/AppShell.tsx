import { useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { APP_FEATURES } from "@/lib/types";
import { Avatar } from "@/components/Avatar";

export function AppShell() {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="page">
      {/* ── Header ── */}
      <header
        className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-deep)] border-b border-[rgba(201,165,90,0.06)] sticky top-0 z-50"
        style={{ paddingTop: "calc(10px + var(--safe-top))" }}
      >
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
          className="flex flex-col gap-1 p-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <span className="block w-5 h-0.5 bg-[var(--gold)] rounded-sm" />
          <span className="block w-5 h-0.5 bg-[var(--gold)] rounded-sm" />
          <span className="block w-5 h-0.5 bg-[var(--gold)] rounded-sm" />
        </button>

        <div className="flex-1 flex items-center gap-2">
          <img
            src="/images/rolezinho-roots.jpeg"
            alt=""
            className="w-7 h-7 rounded-full object-cover border border-[rgba(201,165,90,0.2)]"
          />
          <span
            className="text-[1.05rem] font-bold text-[var(--gold)] tracking-wide"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Rolezinho Roots
          </span>
        </div>

        <button
          onClick={() => navigate("/profile")}
          aria-label="Meu perfil"
          className="rounded-full p-0.5 hover:ring-2 hover:ring-[rgba(201,165,90,0.3)] transition-all"
        >
          <Avatar
            url={profile?.avatar_url}
            name={profile?.display_name ?? "?"}
            size="sm"
          />
        </button>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* ── Menu overlay ── */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="fixed top-0 right-0 bottom-0 w-[300px] max-w-[82vw] bg-[var(--bg-deep)] border-l border-[rgba(201,165,90,0.08)] z-[101] flex flex-col animate-[slideFromRight_0.3s_ease-out]"
            style={{
              paddingTop: "var(--safe-top)",
              paddingBottom: "var(--safe-bottom)",
            }}
          >
            {/* Profile area */}
            <div className="flex items-center gap-3 px-5 pt-6 pb-4">
              <Avatar
                url={profile?.avatar_url}
                name={profile?.display_name ?? "?"}
                size="xl"
              />
              <div className="flex-1 min-w-0">
                <span
                  className="block text-sm font-bold text-[var(--text-primary)] truncate"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {profile?.display_name}
                </span>
                <span className="block text-xs text-[var(--text-muted)] truncate">
                  {profile?.email}
                </span>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-[rgba(201,165,90,0.12)] to-transparent mx-5" />

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <button
                onClick={() => handleNav("/")}
                className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-lg text-[0.95rem] transition-colors
                  ${
                    location.pathname === "/"
                      ? "bg-[rgba(201,165,90,0.07)] text-[var(--gold)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  }`}
              >
                <span className="w-6 text-center text-[1.05rem]">🏠</span>
                <span>Início</span>
              </button>

              <button
                onClick={() => handleNav("/profile")}
                className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-lg text-[0.95rem] transition-colors
                  ${
                    location.pathname === "/profile"
                      ? "bg-[rgba(201,165,90,0.07)] text-[var(--gold)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  }`}
              >
                <span className="w-6 text-center text-[1.05rem]">👤</span>
                <span>Meu Perfil</span>
              </button>

              <div className="text-[0.65rem] text-[var(--text-muted)] uppercase tracking-widest font-semibold px-4 pt-3 pb-1.5">
                Features
              </div>

              {APP_FEATURES.map((feat) => (
                <button
                  key={feat.id}
                  onClick={() => feat.enabled && handleNav(feat.path)}
                  disabled={!feat.enabled}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-lg text-[0.95rem] transition-colors
                    ${!feat.enabled ? "opacity-45 cursor-default" : ""}
                    ${
                      location.pathname === feat.path
                        ? "bg-[rgba(201,165,90,0.07)] text-[var(--gold)]"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    }`}
                >
                  <span className="w-6 text-center text-[1.05rem]">
                    {feat.icon}
                  </span>
                  <span>{feat.name}</span>
                  {!feat.enabled && (
                    <span className="ml-auto text-[0.6rem] px-2 py-0.5 rounded-md bg-[rgba(201,165,90,0.08)] text-[var(--gold-dark)] font-semibold uppercase tracking-wide">
                      Em breve
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-[rgba(201,165,90,0.06)] flex flex-col items-center gap-2">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="w-full py-2 px-4 text-sm font-semibold text-[var(--red)] bg-[rgba(196,64,64,0.12)] border border-[rgba(196,64,64,0.25)] rounded-lg hover:bg-[rgba(196,64,64,0.22)] transition-colors"
              >
                Sair da conta
              </button>
              <span
                className="text-[0.65rem] text-[var(--text-muted)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                v2.1.0
              </span>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
