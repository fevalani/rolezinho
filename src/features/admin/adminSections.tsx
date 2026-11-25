import { ThemesAdminPage } from "@/pages/ThemesAdminPage";
import { ChatStatsAdminPage } from "@/features/chatstats/ChatStatsAdminPage";
import { WrappedAdminPage } from "@/features/wrapped/WrappedAdminPage";
import { AwardsAdminPage } from "@/features/awards/AwardsAdminPage";
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
    id: "awards",
    title: "Awards",
    description: "Edições, fase (indicação/votação) e ordem das categorias",
    icon: "🏆",
    Component: AwardsAdminPage,
  },
  {
    id: "estatisticas",
    title: "Estatísticas do chat",
    description: "Análise do WhatsApp e quem pode ver",
    icon: "📊",
    Component: ChatStatsAdminPage,
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
