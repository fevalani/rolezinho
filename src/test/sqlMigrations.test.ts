import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Não dá para rodar Postgres nos testes; estas checagens estáticas protegem contra erros de digitação
// e contra regressões de segurança nas migrations (e contra o app chamar uma função que não existe).
const sql = (n: string) => readFileSync(resolve(__dirname, `../../supabase/${n}`), "utf-8");
const service = readFileSync(resolve(__dirname, "../features/bolao/bolaoService.ts"), "utf-8");
const EMAIL = /valanife@gmail\.com/i;

describe("admin_roles_migration.sql", () => {
  const s = sql("admin_roles_migration.sql");
  it("cria a tabela, a função e o gatilho que impede ficar sem admin", () => {
    expect(s).toMatch(/create table if not exists public\.app_admins/i);
    expect(s).toMatch(/create or replace function public\.is_app_admin\(\)[\s\S]*security definer/i);
    expect(s).toMatch(/revoke all on function public\.is_app_admin\(\) from public/i);
    expect(s).toMatch(/before delete on public\.app_admins/i);
    expect(s).toMatch(/último administrador/);
    expect(s).toMatch(/enable row level security/i);
  });
  it("o e-mail fixo só aparece no seed do 1º admin, nunca em política", () => {
    const code = s.replace(/--.*$/gm, ""); // ignora comentários
    const withoutSeed = code.replace(/insert into public\.app_admins[\s\S]*?on conflict[^;]*;/i, "");
    expect(withoutSeed).not.toMatch(EMAIL);
    expect(code.match(EMAIL)?.length).toBe(1);
  });
  it("troca as 6 políticas que usavam o e-mail por is_app_admin()", () => {
    for (const p of [
      "seasonal_approvals_admin_write", "seasonal_occasions_admin_write", "wrapped_viewers_select",
      "wrapped_viewers_admin_write", "wrapped_editions_select", "wrapped_editions_admin_write",
    ]) {
      expect(s).toContain(`drop policy if exists "${p}"`);
      expect(s).toContain(`create policy "${p}"`);
    }
  });
  it("cada troca só roda se a tabela existir (ordem das migrations não importa)", () => {
    for (const t of ["seasonal_theme_approvals", "seasonal_occasions", "wrapped_viewers", "wrapped_editions"]) {
      expect(s).toContain(`to_regclass('public.${t}')`);
    }
  });
  it("as políticas antigas citadas existem nas migrations originais (nomes batem)", () => {
    expect(sql("seasonal_themes_migration.sql")).toContain('"seasonal_approvals_admin_write"');
    expect(sql("seasonal_occasions_migration.sql")).toContain('"seasonal_occasions_admin_write"');
    const w = sql("wrapped_migration.sql");
    for (const p of ["wrapped_viewers_select", "wrapped_viewers_admin_write", "wrapped_editions_select", "wrapped_editions_admin_write"]) {
      expect(w).toContain(`"${p}"`);
    }
  });
});

describe("feature_flags_migration.sql", () => {
  const s = sql("feature_flags_migration.sql");
  it("todos leem, só admin escreve, sem e-mail fixo", () => {
    expect(s).toMatch(/create table if not exists public\.feature_flags/i);
    expect(s).toMatch(/for select to authenticated\s+using \(true\)/i);
    expect(s).toMatch(/for all to authenticated\s+using \(public\.is_app_admin\(\)\)\s+with check \(public\.is_app_admin\(\)\)/i);
    expect(s).not.toMatch(EMAIL);
  });
  it("o app usa as colunas que a tabela tem", () => {
    const svc = readFileSync(resolve(__dirname, "../lib/featureFlagsService.ts"), "utf-8");
    for (const col of ["feature_id", "enabled", "updated_by", "updated_at"]) {
      expect(s).toContain(col);
      expect(svc).toContain(col);
    }
  });
});

describe("bolao_permissions_migration.sql", () => {
  const s = sql("bolao_permissions_migration.sql");
  const guarded: [string, string[]][] = [
    ["reset_pool_scores", ["p_pool_id"]],
    ["update_pool_scoring_model", ["p_pool_id", "p_scoring_model", "p_scoring_config"]],
    ["update_pool_goal_base", ["p_pool_id", "p_goal_base"]],
    ["update_pool_variation_mode", ["p_pool_id", "p_variation_mode"]],
    ["update_pool_stage_multipliers", ["p_pool_id", "p_stage_multipliers"]],
  ];

  it.each(guarded)("%s checa quem chama (admin ou criador) antes de alterar", (name) => {
    const body = s.split(new RegExp(`create or replace function public\\.${name}\\(`, "i"))[1]?.split(/\$\$ language/i)[0] ?? "";
    expect(body, `função ${name} não encontrada`).not.toBe("");
    expect(body).toMatch(/if not public\.can_manage_bolao_pool\(p_pool_id\) then/i);
    expect(body).toMatch(/errcode = '42501'/);
    // a checagem vem ANTES de qualquer update
    expect(body.search(/can_manage_bolao_pool/)).toBeLessThan(body.search(/\bupdate public\./i));
  });

  it.each(guarded)("%s tem os mesmos parâmetros que o app envia", (name, params) => {
    const call = new RegExp(`rpc\\("${name}",\\s*\\{([^}]*)\\}`).exec(service);
    expect(call, `o app não chama ${name}`).not.toBeNull();
    const sent = [...call![1].matchAll(/(p_\w+)/g)].map((m) => m[1]);
    for (const p of sent) expect(params).toContain(p);               // tudo que o app manda existe na função
    const header = s.split(new RegExp(`create or replace function public\\.${name}\\(`, "i"))[1].split(/\)\s*returns/i)[0];
    for (const p of params) expect(header).toContain(p);
  });

  it("a permissão é só admin ou criador do bolão, e usa is_app_admin()", () => {
    const fn = s.split(/create or replace function public\.can_manage_bolao_pool/i)[1].split(/\$\$;/)[0];
    expect(fn).toMatch(/public\.is_app_admin\(\)/);
    expect(fn).toMatch(/created_by = auth\.uid\(\)/);
    expect(s).toMatch(/revoke all on function public\.can_manage_bolao_pool\(uuid\) from public/i);
  });

  it("NÃO restringe score_match_predictions (qualquer membro pontua ao abrir o bolão)", () => {
    expect(s).not.toMatch(/function public\.score_match_predictions/i);
    expect(service).toMatch(/syncPoolResults/);
  });

  it("todas as funções ficam SECURITY DEFINER com search_path fixo", () => {
    const count = (s.match(/security definer\s+set search_path = public/gi) ?? []).length;
    expect(count).toBe(6); // can_manage + as 5 protegidas
  });
});

describe("chat_stats_migration.sql", () => {
  const s = sql("chat_stats_migration.sql");
  const code = s.replace(/--.*$/gm, "");
  it("cria as duas tabelas com RLS ligada", () => {
    expect(code).toMatch(/create table if not exists public\.chat_stats_snapshots/i);
    expect(code).toMatch(/create table if not exists public\.chat_stats_viewers/i);
    expect(code.match(/enable row level security/gi)?.length).toBe(2);
  });
  it("só admin escreve (is_app_admin), sem e-mail fixo", () => {
    expect(code).not.toMatch(EMAIL);
    expect(code).toMatch(/"chat_stats_snapshots_admin_write"[\s\S]*?for all to authenticated\s+using \(public\.is_app_admin\(\)\)\s+with check \(public\.is_app_admin\(\)\)/i);
    expect(code).toMatch(/"chat_stats_viewers_admin_write"[\s\S]*?using \(public\.is_app_admin\(\)\)\s+with check \(public\.is_app_admin\(\)\)/i);
  });
  it("leitura do snapshot exige estar na lista de viewers (ou ser admin) e estar ativo", () => {
    const sel = code.match(/create policy "chat_stats_snapshots_select"[\s\S]*?;/i)![0];
    expect(sel).toMatch(/is_active/);
    expect(sel).toMatch(/from public\.chat_stats_viewers/);
    expect(sel).toMatch(/v\.user_id = auth\.uid\(\)/);
    expect(sel).toMatch(/public\.is_app_admin\(\)/);
  });
  it("viewer só enxerga a própria linha", () => {
    expect(code).toMatch(/"chat_stats_viewers_select"[\s\S]*?user_id = auth\.uid\(\) or public\.is_app_admin\(\)/i);
  });
  it("nenhuma política dá acesso a anon ou a todos", () => {
    expect(code).not.toMatch(/to anon|to public|using \(true\)/i);
  });
});
