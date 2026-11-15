import type { User } from "@supabase/supabase-js";

/** Contas com acesso às telas de administração (ex.: aprovar temas sazonais). */
export const ADMIN_EMAILS = ["valanife@gmail.com"];

export function isAdminUser(user: User | null | undefined): boolean {
  const email = user?.email?.toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}
