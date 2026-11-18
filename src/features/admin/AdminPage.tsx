import { Navigate, Outlet, useNavigate, useParams } from "react-router-dom";
import { useAdmin } from "@/lib/useAdmin";
import { ADMIN_SECTIONS, findAdminSection } from "./adminSections";

/** Guard das rotas `/admin/*`: só admin passa (a proteção real é a RLS; isto evita a tela vazia). */
export function AdminRoute() {
  const { isAdmin, loading } = useAdmin();
  if (loading) {
    return (
      <div className="min-h-[50dvh] flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Hub: um cartão por aplicação configurável. */
export function AdminPage() {
  const navigate = useNavigate();
  return (
    <div className="px-5 pt-8 pb-10 max-w-[540px] mx-auto w-full">
      <h1 className="text-xl text-(--gold) leading-none" style={{ fontFamily: "var(--font-display)" }}>
        Administração
      </h1>
      <p className="text-sm text-(--text-muted) mt-1.5 mb-5">Só você vê este painel. Escolha o que configurar.</p>
      <ul className="flex flex-col gap-3">
        {ADMIN_SECTIONS.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => navigate(`/admin/${s.id}`)}
              className="w-full flex items-center gap-4 text-left p-4 rounded-2xl bg-(--bg-card) border border-[rgba(201,165,90,0.08)] hover:border-[rgba(201,165,90,0.3)] transition-colors"
            >
              <span className="text-3xl shrink-0">{s.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-(--text-primary)">{s.title}</span>
                <span className="block text-xs text-(--text-muted) mt-0.5">{s.description}</span>
              </span>
              <span aria-hidden className="text-(--text-muted)">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tela de uma seção, com a volta para o hub. */
export function AdminSectionPage() {
  const { section } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const found = findAdminSection(section);
  if (!found) return <Navigate to="/admin" replace />;
  const { Component } = found;
  return (
    <div>
      <button
        onClick={() => navigate("/admin")}
        className="flex items-center gap-2 px-5 pt-4 text-sm text-(--text-secondary) hover:text-(--gold) transition-colors"
      >
        <span aria-hidden>‹</span> Administração
      </button>
      <Component />
    </div>
  );
}
