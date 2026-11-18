import { ThemesAdminPage } from "@/pages/ThemesAdminPage";
import { WrappedAdminPage } from "@/features/wrapped/WrappedAdminPage";
import { AdminsSection } from "./AdminsSection";
import { FeaturesSection } from "./FeaturesSection";
import { UsersSection } from "./UsersSection";
import type { AdminSection } from "./adminTypes";

/**
 * Registro das seções do painel. Para a config de um app novo aparecer no painel,
 * basta adicionar uma entrada aqui — o hub e as rotas se montam sozinhos.
 */
export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: "temas",
    title: "Temas sazonais",
    description: "Aprovar temas, ajustar o período e criar ocasiões",
    icon: "🎄",
    Component: ThemesAdminPage,
  },
  {
    id: "wrapped",
    title: "Wrapped",
    description: "Edições da retrospectiva e quem pode ver",
    icon: "🎁",
    Component: WrappedAdminPage,
  },
  {
    id: "features",
    title: "Features",
    description: "Ligar ou desligar cada feature para todos",
    icon: "🧩",
    Component: FeaturesSection,
  },
  {
    id: "usuarios",
    title: "Usuários",
    description: "Versão instalada e última abertura de cada pessoa",
    icon: "👥",
    Component: UsersSection,
  },
  {
    id: "admins",
    title: "Administradores",
    description: "Quem pode acessar este painel",
    icon: "🛡️",
    Component: AdminsSection,
  },
];

export const findAdminSection = (id: string | undefined) => ADMIN_SECTIONS.find((s) => s.id === id);
