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

describe("awards_migration.sql", () => {
  const s = sql("awards_migration.sql");
  const code = s.replace(/--.*$/gm, "");
  const awardsSvc = readFileSync(resolve(__dirname, "../features/awards/awardsService.ts"), "utf-8");

  it("cria as 6 tabelas com RLS ligada e sem e-mail fixo", () => {
    for (const t of ["editions", "categories", "nominees", "votes", "viewers", "admins"]) {
      expect(code).toMatch(new RegExp(`create table if not exists public\\.awards_${t}`, "i"));
      expect(code).toMatch(new RegExp(`alter table public\\.awards_${t} enable row level security`, "i"));
    }
    expect(code).not.toMatch(EMAIL);
  });
  const fnBody = (name: string) => code.match(new RegExp(`function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"))![0];
  const policy = (name: string) => code.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`, "i"))![0];
  it("não há INSERT direto em categorias/indicados nem policy em votos (só RPC)", () => {
    expect(code).not.toMatch(/for insert to authenticated[\s\S]{0,80}awards_(categories|nominees)/i);
    expect(code).not.toMatch(/create policy "[^"]*"\s+on public\.awards_(categories|nominees)\s+for (insert|all)/i);
    expect(code).not.toMatch(/create policy[^;]*on public\.awards_votes/i);
  });
  it("limites (5 categorias, 10 indicados) contam o que o próprio usuário criou; admin do awards isento", () => {
    const category = fnBody("create_award_category");
    const nominee = fnBody("add_award_nominee");
    expect(category).toMatch(/created_by = auth\.uid\(\)/);
    expect(category).toMatch(/if v_count >= 5 /);
    expect(category).toMatch(/not public\.is_awards_admin\(p_edition\)/);
    expect(nominee).toMatch(/category_id = p_category_id and created_by = auth\.uid\(\)/);
    expect(nominee).toMatch(/if v_count >= 10 /);
    expect(nominee).toMatch(/if not v_admin then\s+select count/);
  });
  it("indicar só na própria categoria (ou admin do awards)", () => {
    expect(fnBody("add_award_nominee")).toMatch(/\(v_owner <> auth\.uid\(\) and not v_admin\)/);
  });
  it("indicar exige fase nominations; votar exige fase voting e categoria aprovada", () => {
    expect(fnBody("create_award_category")).toMatch(/v_phase <> 'nominations' and not public\.is_awards_admin/);
    expect(fnBody("add_award_nominee")).toMatch(/v_phase <> 'nominations' and not v_admin/);
    const vote = fnBody("cast_award_vote");
    expect(vote).toMatch(/v_phase is distinct from 'voting'/);
    expect(vote).toMatch(/if v_approved is null then/);
    expect(vote).toMatch(/where id = p_nominee_id and category_id = p_category_id/);
  });
  it("admin do awards = admin do app ou lista da edição; só o admin do app monta a lista", () => {
    expect(fnBody("is_awards_admin")).toMatch(
      /public\.is_app_admin\(\) or exists \(\s+select 1 from public\.awards_admins a where a\.slug = p_slug and a\.user_id = auth\.uid\(\)/,
    );
    expect(policy("awards_admins_app_admin_write")).toMatch(/using \(public\.is_app_admin\(\)\)\s+with check \(public\.is_app_admin\(\)\)/);
    expect(policy("awards_admins_select")).toMatch(/user_id = auth\.uid\(\) or public\.is_awards_admin\(slug\)/);
  });
  it("resultado e aprovação são só dos admins do awards", () => {
    const results = fnBody("award_results");
    expect(results).toMatch(/if not public\.is_awards_admin\(p_edition\) then\s+raise exception/);
    expect(results).not.toMatch(/closed/);
    expect(fnBody("set_award_category_approval")).toMatch(/not public\.is_awards_admin\(v_slug\)[\s\S]*raise exception[\s\S]*update public\.awards_categories/);
  });
  it("categoria só é lida por admin, dono, ou por todos quando aprovada e em votação", () => {
    const p = policy("awards_categories_select");
    expect(p).toMatch(/public\.awards_can_view\(edition_slug\)\s+and \(/);
    expect(p).toMatch(/public\.is_awards_admin\(edition_slug\)\s+or created_by = auth\.uid\(\)\s+or \(approved_at is not null and exists/);
    expect(p).toMatch(/e\.phase = 'voting'/);
    expect(policy("awards_nominees_select")).toMatch(/using \(public\.awards_can_see_category\(category_id\)\)/);
    const see = fnBody("awards_can_see_category");
    expect(see).toMatch(/public\.awards_can_view\(c\.edition_slug\)/);
    expect(see).toMatch(/or c\.created_by = auth\.uid\(\)\s+or \(e\.phase = 'voting' and c\.approved_at is not null\)/);
    expect(see).not.toMatch(/awards_nominees/); // quem indicou na categoria alheia não a vê
  });
  it("dono renomeia/apaga categoria só na indicação e sem aprovação; admin sempre", () => {
    for (const name of ["awards_categories_update", "awards_categories_delete"]) {
      const p = policy(name);
      expect(p).toMatch(/public\.is_awards_admin\(edition_slug\)\s+or \(created_by = auth\.uid\(\) and approved_at is null/);
      expect(p).toMatch(/phase = 'nominations'/);
    }
  });
  it("indicados são alterados pelo dono da categoria (não por quem indicou) ou admin", () => {
    for (const name of ["awards_nominees_update", "awards_nominees_delete"]) {
      const p = policy(name);
      expect(p).toMatch(/public\.is_awards_admin\(c\.edition_slug\)/);
      expect(p).toMatch(/c\.created_by = auth\.uid\(\) and e\.phase = 'nominations'/);
      expect(p).not.toMatch(/awards_nominees\.created_by/);
    }
  });
  it("update direto não alcança dono nem aprovação (só colunas de conteúdo)", () => {
    expect(code).toMatch(/revoke update on public\.awards_categories from anon, authenticated;/);
    expect(code).toMatch(/grant update \(title, description, image_url, position\) on public\.awards_categories to authenticated;/);
    expect(code).toMatch(/revoke update on public\.awards_nominees from anon, authenticated;/);
    expect(code).toMatch(/grant update \(label, image_url\) on public\.awards_nominees to authenticated;/);
  });
  it("edição oculta só aparece aos admins; fora disso vale a audiência (todos ou lista)", () => {
    const fn = fnBody("awards_can_view");
    expect(fn).toMatch(/public\.is_awards_admin\(p_slug\) or exists/);
    expect(fn).toMatch(/e\.phase <> 'hidden'/);
    expect(fn).toMatch(/e\.audience = 'all'/);
    expect(fn).toMatch(/from public\.awards_viewers v where v\.slug = e\.slug and v\.user_id = auth\.uid\(\)/);
    expect(policy("awards_editions_select")).toMatch(/using \(public\.awards_can_view\(slug\)\)/);
  });
  it("audiência e fase: admin do awards edita; criar/apagar edição só o admin do app", () => {
    expect(code).toMatch(/add column if not exists audience text not null default 'all' check \(audience in \('all', 'selected'\)\)/i);
    expect(policy("awards_viewers_select")).toMatch(/user_id = auth\.uid\(\) or public\.is_awards_admin\(slug\)/);
    expect(policy("awards_viewers_admin_write")).toMatch(/using \(public\.is_awards_admin\(slug\)\)\s+with check \(public\.is_awards_admin\(slug\)\)/);
    expect(policy("awards_editions_manager_update")).toMatch(/for update to authenticated/);
    expect(policy("awards_editions_admin_write")).toMatch(/for all to authenticated\s+using \(public\.is_app_admin\(\)\)/);
  });
  it("não apaga dados ao rodar de novo", () => {
    expect(code).not.toMatch(/drop table|truncate|delete from/i);
    expect(code).toMatch(/add column if not exists approved_at/);
  });
  it("indicar, votar e ver as próprias coisas respeitam a audiência", () => {
    for (const fn of ["create_award_category", "add_award_nominee", "cast_award_vote", "my_award_votes"]) {
      expect(fnBody(fn)).toMatch(/awards_can_view/);
    }
  });
  const rpcs = ["create_award_category", "add_award_nominee", "cast_award_vote", "my_award_votes", "award_results", "set_award_category_approval", "is_awards_admin"];
  it("funções são SECURITY DEFINER com search_path fixo e só authenticated executa", () => {
    const total = rpcs.length + 2; // + awards_can_view e awards_can_see_category
    expect((code.match(/security definer\s+set search_path = public/gi) ?? []).length).toBe(total);
    expect((code.match(/revoke all on function public\.\w+\([^)]*\) from public/gi) ?? []).length).toBe(total);
    expect((code.match(/grant execute on function public\.\w+\([^)]*\) to authenticated/gi) ?? []).length).toBe(total);
  });
  it("os parâmetros que o service envia batem com as funções", () => {
    for (const p of ["p_edition", "p_title", "p_description", "p_image_url", "p_category_id", "p_label", "p_nominee_id", "p_approved", "p_slug"]) {
      expect(code).toMatch(new RegExp(`\\b${p}\\b`));
      expect(awardsSvc).toMatch(new RegExp(`\\b${p}\\b`));
    }
    for (const fn of rpcs) {
      expect(code).toMatch(new RegExp(`function public\\.${fn}`, "i"));
      expect(awardsSvc).toContain(`"${fn}"`);
    }
  });
  it("bucket awards: upload na própria pasta, leitura pública, apagar dono/admin", () => {
    expect(code).toMatch(/'awards',\s*'awards',\s*true/);
    expect(code).toMatch(/bucket_id = 'awards' and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
    expect(code).toMatch(/"awards_delete_own_or_admin"[\s\S]*?public\.is_app_admin\(\)/);
  });
});
