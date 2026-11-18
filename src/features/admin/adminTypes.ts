import type { ComponentType } from "react";

/** Uma seção do painel de administração = a configuração de uma aplicação do app. */
export interface AdminSection {
  /** vira a rota `/admin/<id>` */
  id: string;
  title: string;
  description: string;
  icon: string;
  Component: ComponentType;
}

/** Perfil de um usuário do app, como o painel o enxerga. */
export interface AdminUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string | null;
}
