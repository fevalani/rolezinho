import { useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { APP_FEATURES } from "@/lib/types";
import { getInitials } from "@/lib/utils";
import styles from "./AppShell.module.css";

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
      <header className={styles.header}>
        <button
          className={styles.hamburger}
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
          data-testid="menu-btn"
        >
          <span />
          <span />
          <span />
        </button>

        <div className={styles.brand}>
          <svg
            viewBox="0 0 100 100"
            width={24}
            height={24}
            className={styles.brandIcon}
          >
            <polygon
              points="50,5 95,30 95,70 50,95 5,70 5,30"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
            />
            <text
              x="50"
              y="60"
              textAnchor="middle"
              fill="currentColor"
              fontFamily="serif"
              fontSize="30"
              fontWeight="bold"
            >
              20
            </text>
          </svg>
          <span className={styles.brandName}>Taverna</span>
        </div>

        <div className={styles.headerRight}>
          {profile?.avatar_url ? (
            <div className="avatar avatar-sm">
              <img
                src={profile.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div
              className="avatar avatar-sm avatar-initials"
              style={{ background: "var(--gold-dark)" }}
            >
              {getInitials(profile?.display_name ?? "?")}
            </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className={styles.main}>
        <Outlet />
      </main>

      {/* ── Menu ── */}
      {menuOpen && (
        <>
          <div
            className="overlay"
            onClick={() => setMenuOpen(false)}
            data-testid="menu-overlay"
          />
          <nav className="menu-panel" data-testid="menu-panel">
            {/* Profile area */}
            <div className={styles.menuProfile}>
              {profile?.avatar_url ? (
                <div className="avatar avatar-xl">
                  <img
                    src={profile.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div
                  className="avatar avatar-xl avatar-initials"
                  style={{ background: "var(--gold-dark)" }}
                >
                  {getInitials(profile?.display_name ?? "?")}
                </div>
              )}
              <div className={styles.menuProfileInfo}>
                <span className={styles.menuName}>{profile?.display_name}</span>
                <span className={styles.menuEmail}>{profile?.email}</span>
              </div>
              <button
                className={`btn btn-icon btn-ghost ${styles.closeBtn}`}
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
              >
                ✕
              </button>
            </div>

            <div className="divider" style={{ margin: "0 20px" }} />

            {/* Navigation */}
            <div className={styles.menuNav}>
              <button
                className={`${styles.menuItem} ${location.pathname === "/" ? styles.menuItemActive : ""}`}
                onClick={() => handleNav("/")}
              >
                <span className={styles.menuIcon}>🏠</span>
                <span>Início</span>
              </button>

              <div className={styles.menuSectionLabel}>Features</div>

              {APP_FEATURES.map((feat) => (
                <button
                  key={feat.id}
                  className={`${styles.menuItem} ${!feat.enabled ? styles.menuItemDisabled : ""} ${location.pathname === feat.path ? styles.menuItemActive : ""}`}
                  onClick={() => feat.enabled && handleNav(feat.path)}
                  disabled={!feat.enabled}
                >
                  <span className={styles.menuIcon}>{feat.icon}</span>
                  <span>{feat.name}</span>
                  {!feat.enabled && (
                    <span className={styles.badge}>Em breve</span>
                  )}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className={styles.menuFooter}>
              <button
                className="btn btn-danger btn-sm btn-full"
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
              >
                Sair da conta
              </button>
              <span className={styles.version}>v2.0.0</span>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
