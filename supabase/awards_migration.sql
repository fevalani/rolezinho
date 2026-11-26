-- Awards (/awards): o grupo monta categorias e indicados e, depois, vota. Rodar no SQL Editor do Supabase.
-- Fases da edição (awards_editions.phase): hidden (só admins veem) → nominations (indicação) → voting (votação)
-- → closed (encerrado). Quem muda a fase é um admin do awards, em /awards/gerenciar ou /admin/awards.
-- Admin do awards (is_awards_admin) = admin do app OU quem está em awards_admins daquela edição.
-- Só o admin do app monta a lista de admins do awards.
-- Quem vê a edição (fora a fase hidden): audience = 'all' (todos) ou 'selected' (só quem está em awards_viewers).
-- Admins do awards sempre veem.
-- O que cada um vê: a pessoa comum só enxerga as categorias que ela criou, com todos os indicados delas (inclusive
-- os que outras pessoas indicaram antes desta regra; quem indicou na categoria alheia deixa de ver). Na fase
-- voting, todos que veem a edição também enxergam as categorias APROVADAS (para a cédula). Admins veem tudo.
-- Limites por pessoa (impostos nas RPCs; a tela só reflete): 5 categorias por edição e 10 indicados por categoria
-- (contam só os que a própria pessoa indicou). Admins do awards são isentos.
-- Aprovação: só admin do awards (RPC set_award_category_approval). Categoria aprovada não pode mais ser renomeada
-- nem apagada pelo dono, mas ele ainda completa os indicados na fase de indicação. Só aprovadas recebem voto.
-- Resultado (award_results): só admins do awards, em qualquer fase.
-- Não há INSERT direto em categorias/indicados: a criação passa por create_award_category / add_award_nominee.
-- Votos (awards_votes) não têm policy: só as RPCs (cast_award_vote, my_award_votes, award_results) acessam, e
-- ninguém consegue ver quem votou em quem.
-- Rodar de novo é seguro (idempotente) e não apaga dados: quem já rodou uma versão anterior só ganha o que é novo.
-- Depende de public.is_app_admin() (admin_roles_migration.sql).
-- Rodada em produção em 26/11/2026 (esta versão).

-- ─── Tabelas ────────────────────────────────────────────────────────────────

create table if not exists public.awards_editions (
  slug        text primary key check (slug ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$'),
  title       text not null check (char_length(title) between 1 and 80),
  subtitle    text check (subtitle is null or char_length(subtitle) <= 160),
  phase       text not null default 'hidden' check (phase in ('hidden', 'nominations', 'voting', 'closed')),
  created_at  timestamptz not null default now()
);

alter table public.awards_editions
  add column if not exists audience text not null default 'all' check (audience in ('all', 'selected'));

create table if not exists public.awards_viewers (
  slug        text not null references public.awards_editions(slug) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (slug, user_id)
);

create table if not exists public.awards_admins (
  slug        text not null references public.awards_editions(slug) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (slug, user_id)
);

create table if not exists public.awards_categories (
  id            uuid primary key default gen_random_uuid(),
  edition_slug  text not null references public.awards_editions(slug) on delete cascade,
  title         text not null check (char_length(title) between 1 and 80),
  description   text check (description is null or char_length(description) <= 300),
  image_url     text,
  position      integer not null default 0,
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now()
);

alter table public.awards_categories
  add column if not exists approved_at timestamptz;
alter table public.awards_categories
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

create index if not exists awards_categories_edition_idx on public.awards_categories (edition_slug);
create index if not exists awards_categories_owner_idx on public.awards_categories (edition_slug, created_by);

create table if not exists public.awards_nominees (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.awards_categories(id) on delete cascade,
  label        text check (label is null or char_length(label) between 1 and 80),
  image_url    text,
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint awards_nominee_has_content check (label is not null or image_url is not null)
);

create index if not exists awards_nominees_category_idx on public.awards_nominees (category_id);
create index if not exists awards_nominees_owner_idx on public.awards_nominees (category_id, created_by);

create table if not exists public.awards_votes (
  category_id  uuid not null references public.awards_categories(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  nominee_id   uuid not null references public.awards_nominees(id) on delete cascade,
  updated_at   timestamptz not null default now(),
  primary key (category_id, user_id)
);

alter table public.awards_editions enable row level security;
alter table public.awards_viewers enable row level security;
alter table public.awards_admins enable row level security;
alter table public.awards_categories enable row level security;
alter table public.awards_nominees enable row level security;
alter table public.awards_votes enable row level security;
-- awards_votes: sem nenhuma policy de propósito (acesso só pelas RPCs SECURITY DEFINER).

-- ─── Quem administra e quem vê ──────────────────────────────────────────────

-- SECURITY DEFINER para ler awards_admins/awards_viewers sem esbarrar na RLS (e sem recursão nas policies).
create or replace function public.is_awards_admin(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin() or exists (
    select 1 from public.awards_admins a where a.slug = p_slug and a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_awards_admin(text) from public;
grant execute on function public.is_awards_admin(text) to authenticated;

create or replace function public.awards_can_view(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_awards_admin(p_slug) or exists (
    select 1 from public.awards_editions e
    where e.slug = p_slug
      and e.phase <> 'hidden'
      and (
        e.audience = 'all'
        or exists (select 1 from public.awards_viewers v where v.slug = e.slug and v.user_id = auth.uid())
      )
  );
$$;

revoke all on function public.awards_can_view(text) from public;
grant execute on function public.awards_can_view(text) to authenticated;

-- Quem enxerga uma categoria (e os indicados dela): admin do awards, o dono, ou todos se aprovada e em votação.
create or replace function public.awards_can_see_category(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.awards_categories c
    join public.awards_editions e on e.slug = c.edition_slug
    where c.id = p_category_id
      and public.awards_can_view(c.edition_slug)
      and (
        public.is_awards_admin(c.edition_slug)
        or c.created_by = auth.uid()
        or (e.phase = 'voting' and c.approved_at is not null)
      )
  );
$$;

revoke all on function public.awards_can_see_category(uuid) from public;
grant execute on function public.awards_can_see_category(uuid) to authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────

drop policy if exists "awards_editions_select" on public.awards_editions;
create policy "awards_editions_select"
  on public.awards_editions
  for select to authenticated
  using (public.awards_can_view(slug));

drop policy if exists "awards_editions_admin_write" on public.awards_editions;
create policy "awards_editions_admin_write"
  on public.awards_editions
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Admin do awards troca fase e audiência (criar/apagar edição continua só com o admin do app).
drop policy if exists "awards_editions_manager_update" on public.awards_editions;
create policy "awards_editions_manager_update"
  on public.awards_editions
  for update to authenticated
  using (public.is_awards_admin(slug))
  with check (public.is_awards_admin(slug));

drop policy if exists "awards_viewers_select" on public.awards_viewers;
create policy "awards_viewers_select"
  on public.awards_viewers
  for select to authenticated
  using (user_id = auth.uid() or public.is_awards_admin(slug));

drop policy if exists "awards_viewers_admin_write" on public.awards_viewers;
create policy "awards_viewers_admin_write"
  on public.awards_viewers
  for all to authenticated
  using (public.is_awards_admin(slug))
  with check (public.is_awards_admin(slug));

drop policy if exists "awards_admins_select" on public.awards_admins;
create policy "awards_admins_select"
  on public.awards_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_awards_admin(slug));

drop policy if exists "awards_admins_app_admin_write" on public.awards_admins;
create policy "awards_admins_app_admin_write"
  on public.awards_admins
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Colunas editáveis direto pelo app. Dono, aprovação e vínculo (created_by, approved_*, edition_slug,
-- category_id) só mudam pelas RPCs; sem isso daria para se autoaprovar ou burlar os limites.
revoke update on public.awards_categories from anon, authenticated;
grant update (title, description, image_url, position) on public.awards_categories to authenticated;
revoke update on public.awards_nominees from anon, authenticated;
grant update (label, image_url) on public.awards_nominees to authenticated;

drop policy if exists "awards_categories_select" on public.awards_categories;
create policy "awards_categories_select"
  on public.awards_categories
  for select to authenticated
  using (
    public.awards_can_view(edition_slug)
    and (
      public.is_awards_admin(edition_slug)
      or created_by = auth.uid()
      or (approved_at is not null and exists (
        select 1 from public.awards_editions e where e.slug = awards_categories.edition_slug and e.phase = 'voting'
      ))
    )
  );

-- Dono edita/apaga a categoria só na indicação e enquanto não aprovada; admin do awards sempre.
drop policy if exists "awards_categories_update" on public.awards_categories;
create policy "awards_categories_update"
  on public.awards_categories
  for update to authenticated
  using (
    public.is_awards_admin(edition_slug)
    or (created_by = auth.uid() and approved_at is null and public.awards_can_view(edition_slug) and exists (
      select 1 from public.awards_editions e where e.slug = awards_categories.edition_slug and e.phase = 'nominations'
    ))
  )
  with check (
    public.is_awards_admin(edition_slug)
    or (created_by = auth.uid() and approved_at is null and public.awards_can_view(edition_slug) and exists (
      select 1 from public.awards_editions e where e.slug = awards_categories.edition_slug and e.phase = 'nominations'
    ))
  );

drop policy if exists "awards_categories_delete" on public.awards_categories;
create policy "awards_categories_delete"
  on public.awards_categories
  for delete to authenticated
  using (
    public.is_awards_admin(edition_slug)
    or (created_by = auth.uid() and approved_at is null and public.awards_can_view(edition_slug) and exists (
      select 1 from public.awards_editions e where e.slug = awards_categories.edition_slug and e.phase = 'nominations'
    ))
  );

drop policy if exists "awards_nominees_select" on public.awards_nominees;
create policy "awards_nominees_select"
  on public.awards_nominees
  for select to authenticated
  using (public.awards_can_see_category(category_id));

-- Quem cuida dos indicados é o DONO DA CATEGORIA (na indicação, aprovada ou não) ou o admin do awards.
drop policy if exists "awards_nominees_update" on public.awards_nominees;
create policy "awards_nominees_update"
  on public.awards_nominees
  for update to authenticated
  using (exists (
    select 1 from public.awards_categories c
    join public.awards_editions e on e.slug = c.edition_slug
    where c.id = awards_nominees.category_id and (
      public.is_awards_admin(c.edition_slug)
      or (c.created_by = auth.uid() and e.phase = 'nominations' and public.awards_can_view(c.edition_slug))
    )
  ))
  with check (exists (
    select 1 from public.awards_categories c
    join public.awards_editions e on e.slug = c.edition_slug
    where c.id = awards_nominees.category_id and (
      public.is_awards_admin(c.edition_slug)
      or (c.created_by = auth.uid() and e.phase = 'nominations' and public.awards_can_view(c.edition_slug))
    )
  ));

drop policy if exists "awards_nominees_delete" on public.awards_nominees;
create policy "awards_nominees_delete"
  on public.awards_nominees
  for delete to authenticated
  using (exists (
    select 1 from public.awards_categories c
    join public.awards_editions e on e.slug = c.edition_slug
    where c.id = awards_nominees.category_id and (
      public.is_awards_admin(c.edition_slug)
      or (c.created_by = auth.uid() and e.phase = 'nominations' and public.awards_can_view(c.edition_slug))
    )
  ));

-- ─── RPCs ───────────────────────────────────────────────────────────────────

-- Cria uma categoria (limite: 5 por pessoa na edição; admin do awards isento).
create or replace function public.create_award_category(
  p_edition text,
  p_title text,
  p_description text default null,
  p_image_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_count integer;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login para indicar.';
  end if;
  select phase into v_phase from public.awards_editions where slug = p_edition;
  if v_phase is null or not public.awards_can_view(p_edition) then
    raise exception 'Edição não encontrada.';
  end if;
  if v_phase <> 'nominations' and not public.is_awards_admin(p_edition) then
    raise exception 'As indicações não estão abertas.';
  end if;
  if v_title is null then
    raise exception 'Dê um nome para a categoria.';
  end if;
  if not public.is_awards_admin(p_edition) then
    select count(*) into v_count from public.awards_categories
      where edition_slug = p_edition and created_by = auth.uid();
    if v_count >= 5 then
      raise exception 'Você já indicou 5 categorias. Apague uma para indicar outra.';
    end if;
  end if;
  insert into public.awards_categories (edition_slug, title, description, image_url, position, created_by)
  values (
    p_edition,
    v_title,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(p_image_url, ''),
    coalesce((select max(position) + 1 from public.awards_categories where edition_slug = p_edition), 0),
    auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Adiciona um indicado. Só o dono da categoria (ou admin do awards). Limite: 10 por pessoa em cada categoria,
-- contando só o que a própria pessoa indicou; admin do awards isento.
create or replace function public.add_award_nominee(
  p_category_id uuid,
  p_label text default null,
  p_image_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_slug text;
  v_owner uuid;
  v_admin boolean;
  v_count integer;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_image text := nullif(p_image_url, '');
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login para indicar.';
  end if;
  select e.phase, c.edition_slug, c.created_by into v_phase, v_slug, v_owner
    from public.awards_categories c
    join public.awards_editions e on e.slug = c.edition_slug
    where c.id = p_category_id and public.awards_can_view(c.edition_slug);
  v_admin := public.is_awards_admin(v_slug);
  if v_phase is null or (v_owner <> auth.uid() and not v_admin) then
    raise exception 'Categoria não encontrada.';
  end if;
  if v_phase <> 'nominations' and not v_admin then
    raise exception 'As indicações não estão abertas.';
  end if;
  if v_label is null and v_image is null then
    raise exception 'Informe um nome ou uma imagem.';
  end if;
  if not v_admin then
    select count(*) into v_count from public.awards_nominees
      where category_id = p_category_id and created_by = auth.uid();
    if v_count >= 10 then
      raise exception 'Você já indicou 10 nomes nesta categoria. Apague um para indicar outro.';
    end if;
  end if;
  insert into public.awards_nominees (category_id, label, image_url, created_by)
  values (p_category_id, v_label, v_image, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Vota (ou troca o voto) em uma categoria APROVADA. Só na fase de votação.
create or replace function public.cast_award_vote(p_category_id uuid, p_nominee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_approved timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Faça login para votar.';
  end if;
  select e.phase, c.approved_at into v_phase, v_approved
    from public.awards_categories c
    join public.awards_editions e on e.slug = c.edition_slug
    where c.id = p_category_id and public.awards_can_view(c.edition_slug);
  if v_phase is distinct from 'voting' then
    raise exception 'A votação não está aberta.';
  end if;
  if v_approved is null then
    raise exception 'Esta categoria não está na votação.';
  end if;
  if not exists (select 1 from public.awards_nominees where id = p_nominee_id and category_id = p_category_id) then
    raise exception 'Indicado inválido para esta categoria.';
  end if;
  insert into public.awards_votes (category_id, user_id, nominee_id, updated_at)
  values (p_category_id, auth.uid(), p_nominee_id, now())
  on conflict (category_id, user_id)
  do update set nominee_id = excluded.nominee_id, updated_at = now();
end;
$$;

-- Só os votos de quem chama.
create or replace function public.my_award_votes(p_edition text)
returns table (category_id uuid, nominee_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select v.category_id, v.nominee_id
  from public.awards_votes v
  join public.awards_categories c on c.id = v.category_id
  where c.edition_slug = p_edition and v.user_id = auth.uid() and public.awards_can_view(p_edition);
$$;

-- Contagem por indicado. Só admins do awards. Nunca expõe quem votou.
create or replace function public.award_results(p_edition text)
returns table (category_id uuid, nominee_id uuid, votes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_awards_admin(p_edition) then
    raise exception 'Resultado indisponível.';
  end if;
  return query
    select v.category_id, v.nominee_id, count(*)::bigint
    from public.awards_votes v
    join public.awards_categories c on c.id = v.category_id
    where c.edition_slug = p_edition
    group by v.category_id, v.nominee_id;
end;
$$;

-- Aprova (ou tira a aprovação de) uma categoria. Só admins do awards.
create or replace function public.set_award_category_approval(p_category_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  select edition_slug into v_slug from public.awards_categories where id = p_category_id;
  if v_slug is null or not public.is_awards_admin(v_slug) then
    raise exception 'Só um admin do awards pode aprovar categorias.';
  end if;
  update public.awards_categories
    set approved_at = case when p_approved then coalesce(approved_at, now()) end,
        approved_by = case when p_approved then coalesce(approved_by, auth.uid()) end
    where id = p_category_id;
end;
$$;

revoke all on function public.create_award_category(text, text, text, text) from public;
revoke all on function public.add_award_nominee(uuid, text, text) from public;
revoke all on function public.cast_award_vote(uuid, uuid) from public;
revoke all on function public.my_award_votes(text) from public;
revoke all on function public.award_results(text) from public;
revoke all on function public.set_award_category_approval(uuid, boolean) from public;
grant execute on function public.create_award_category(text, text, text, text) to authenticated;
grant execute on function public.add_award_nominee(uuid, text, text) to authenticated;
grant execute on function public.cast_award_vote(uuid, uuid) to authenticated;
grant execute on function public.my_award_votes(text) to authenticated;
grant execute on function public.award_results(text) to authenticated;
grant execute on function public.set_award_category_approval(uuid, boolean) to authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────

do $$
begin
  begin
    alter publication supabase_realtime add table public.awards_categories;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.awards_nominees;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.awards_editions;
  exception when duplicate_object then null;
  end;
end $$;

-- ─── Storage: bucket das imagens ────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'awards',
  'awards',
  true,
  1048576, -- 1MB (o app comprime antes de enviar)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "awards_upload_own_folder" on storage.objects;
create policy "awards_upload_own_folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'awards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "awards_delete_own_or_admin" on storage.objects;
create policy "awards_delete_own_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'awards'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_app_admin())
  );

drop policy if exists "awards_public_read" on storage.objects;
create policy "awards_public_read"
  on storage.objects for select to public
  using (bucket_id = 'awards');
