-- Bolão: as funções que MUDAM AS REGRAS de um bolão passam a checar quem chama.
-- Antes eram SECURITY DEFINER sem checagem: qualquer usuário logado podia chamá-las direto
-- (só a tela escondia o botão). Agora só o ADMIN ou o CRIADOR do bolão.
-- Rodar no SQL Editor do Supabase DEPOIS de admin_roles_migration.sql (usa is_app_admin()).
-- Seguro rodar de novo.
--
-- NÃO mexe em score_match_predictions: ela é chamada automaticamente por qualquer membro ao
-- abrir o bolão (sincroniza o resultado e pontua). Restringi-la quebraria a pontuação de todos.

create or replace function public.can_manage_bolao_pool(p_pool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
      or exists (select 1 from public.bolao_pools where id = p_pool_id and created_by = auth.uid());
$$;

revoke all on function public.can_manage_bolao_pool(uuid) from public;
grant execute on function public.can_manage_bolao_pool(uuid) to authenticated;

create or replace function public.reset_pool_scores(p_pool_id uuid)
returns void as $$
begin
  if not public.can_manage_bolao_pool(p_pool_id) then
    raise exception 'Sem permissão para alterar este bolão' using errcode = '42501';
  end if;
  update public.bolao_predictions
  set points_earned = null,
      updated_at    = now()
  where pool_id = p_pool_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.update_pool_scoring_model(
  p_pool_id        uuid,
  p_scoring_model  text,
  p_scoring_config jsonb default null
)
returns void as $$
begin
  if not public.can_manage_bolao_pool(p_pool_id) then
    raise exception 'Sem permissão para alterar este bolão' using errcode = '42501';
  end if;
  update public.bolao_pools
  set scoring_model  = p_scoring_model,
      scoring_config = p_scoring_config,
      updated_at     = now()
  where id = p_pool_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.update_pool_goal_base(
  p_pool_id   uuid,
  p_goal_base text
)
returns void as $$
begin
  if not public.can_manage_bolao_pool(p_pool_id) then
    raise exception 'Sem permissão para alterar este bolão' using errcode = '42501';
  end if;
  update public.bolao_pools
  set goal_base  = p_goal_base,
      updated_at = now()
  where id = p_pool_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.update_pool_variation_mode(
  p_pool_id        uuid,
  p_variation_mode text
)
returns void as $$
begin
  if not public.can_manage_bolao_pool(p_pool_id) then
    raise exception 'Sem permissão para alterar este bolão' using errcode = '42501';
  end if;
  update public.bolao_pools
  set variation_mode = p_variation_mode,
      updated_at     = now()
  where id = p_pool_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.update_pool_stage_multipliers(
  p_pool_id           uuid,
  p_stage_multipliers jsonb
)
returns void as $$
begin
  if not public.can_manage_bolao_pool(p_pool_id) then
    raise exception 'Sem permissão para alterar este bolão' using errcode = '42501';
  end if;
  update public.bolao_pools
  set stage_multipliers = coalesce(p_stage_multipliers, '{}'::jsonb),
      updated_at         = now()
  where id = p_pool_id;
end;
$$ language plpgsql security definer set search_path = public;
