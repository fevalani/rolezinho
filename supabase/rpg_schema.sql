-- ═══════════════════════════════════════════════════════════════
-- RPG TABLES — Mesas, Fichas, Feed, Sessões
-- ═══════════════════════════════════════════════════════════════

-- Mesas de RPG
CREATE TABLE IF NOT EXISTS rpg_tables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,
  invite_code TEXT UNIQUE NOT NULL DEFAULT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  master_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_active   BOOLEAN DEFAULT false,   -- sessão em andamento
  session_count INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Membros de uma Mesa (jogadores + mestre)
CREATE TABLE IF NOT EXISTS rpg_table_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    UUID NOT NULL REFERENCES rpg_tables(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  total_sessions INT DEFAULT 0,
  total_minutes  INT DEFAULT 0,
  UNIQUE(table_id, user_id)
);

-- Fichas de personagem (D&D 5.5e)
CREATE TABLE IF NOT EXISTS rpg_sheets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Identidade
  character_name TEXT NOT NULL,
  class_name  TEXT DEFAULT '',
  subclass    TEXT DEFAULT '',
  race        TEXT DEFAULT '',
  background  TEXT DEFAULT '',
  alignment   TEXT DEFAULT '',
  level       INT DEFAULT 1,
  experience  INT DEFAULT 0,
  -- Atributos base
  strength    INT DEFAULT 10,
  dexterity   INT DEFAULT 10,
  constitution INT DEFAULT 10,
  intelligence INT DEFAULT 10,
  wisdom      INT DEFAULT 10,
  charisma    INT DEFAULT 10,
  -- Vida & Defesa
  max_hp      INT DEFAULT 10,
  current_hp  INT DEFAULT 10,
  temp_hp     INT DEFAULT 0,
  armor_class INT DEFAULT 10,
  speed       INT DEFAULT 30,
  initiative  INT DEFAULT 0,
  hit_dice    TEXT DEFAULT '1d8',
  hit_dice_used INT DEFAULT 0,
  -- Proficiências & Salvaguardas (bitmask ou JSON)
  saving_throws JSONB DEFAULT '{"strength":false,"dexterity":false,"constitution":false,"intelligence":false,"wisdom":false,"charisma":false}',
  skill_proficiencies JSONB DEFAULT '{}',
  skill_expertise JSONB DEFAULT '{}',
  proficiency_bonus INT DEFAULT 2,
  -- Traços
  personality_traits TEXT DEFAULT '',
  ideals      TEXT DEFAULT '',
  bonds       TEXT DEFAULT '',
  flaws       TEXT DEFAULT '',
  backstory   TEXT DEFAULT '',
  -- Equipamento & Inventário
  equipment   JSONB DEFAULT '[]',
  currency    JSONB DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}',
  -- Magias
  spellcasting_ability TEXT DEFAULT '',
  spell_save_dc INT DEFAULT 8,
  spell_attack_bonus INT DEFAULT 0,
  spells      JSONB DEFAULT '{"cantrips":[],"level1":[],"level2":[],"level3":[],"level4":[],"level5":[],"level6":[],"level7":[],"level8":[],"level9":[]}',
  spell_slots JSONB DEFAULT '{"level1":{"max":0,"used":0},"level2":{"max":0,"used":0},"level3":{"max":0,"used":0},"level4":{"max":0,"used":0},"level5":{"max":0,"used":0},"level6":{"max":0,"used":0},"level7":{"max":0,"used":0},"level8":{"max":0,"used":0},"level9":{"max":0,"used":0}}',
  -- Ataques
  attacks     JSONB DEFAULT '[]',
  -- Habilidades especiais
  features    JSONB DEFAULT '[]',
  -- Notas
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Vínculo ficha ↔ mesa (um usuário pode ter fichas diferentes em mesas diferentes)
CREATE TABLE IF NOT EXISTS rpg_sheet_table_link (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id    UUID NOT NULL REFERENCES rpg_sheets(id) ON DELETE CASCADE,
  table_id    UUID NOT NULL REFERENCES rpg_tables(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(table_id, user_id)
);

-- Feed permanente da Mesa (posts do Mestre)
CREATE TABLE IF NOT EXISTS rpg_feed_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    UUID NOT NULL REFERENCES rpg_tables(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     TEXT DEFAULT '',
  image_url   TEXT,
  video_url   TEXT,
  post_type   TEXT DEFAULT 'text' CHECK (post_type IN ('text','image','video','system')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Rolagens dentro de uma Mesa (efêmeras, 60s de visibilidade)
CREATE TABLE IF NOT EXISTS rpg_table_rolls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    UUID NOT NULL REFERENCES rpg_tables(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dice_type   TEXT NOT NULL,
  results     JSONB NOT NULL DEFAULT '[]',
  total       INT NOT NULL,
  is_master   BOOLEAN DEFAULT false,  -- rolagem secreta do mestre
  batch_id    UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Biblioteca da Mesa (editável pelo Mestre)
CREATE TABLE IF NOT EXISTS rpg_library_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    UUID NOT NULL REFERENCES rpg_tables(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT DEFAULT '',
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Sessões registradas
CREATE TABLE IF NOT EXISTS rpg_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    UUID NOT NULL REFERENCES rpg_tables(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  duration_minutes INT
);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE rpg_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpg_table_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpg_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpg_sheet_table_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpg_feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpg_table_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpg_library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpg_sessions ENABLE ROW LEVEL SECURITY;

-- rpg_tables: membros veem, mestre edita
CREATE POLICY "members can view tables" ON rpg_tables FOR SELECT
  USING (id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid())
      OR master_id = auth.uid());

CREATE POLICY "authenticated can create tables" ON rpg_tables FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "master can update table" ON rpg_tables FOR UPDATE
  USING (master_id = auth.uid());

CREATE POLICY "master can delete table" ON rpg_tables FOR DELETE
  USING (master_id = auth.uid());

-- rpg_table_members
CREATE POLICY "members can view members" ON rpg_table_members FOR SELECT
  USING (table_id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid())
      OR table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));

CREATE POLICY "authenticated can join" ON rpg_table_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "member can leave" ON rpg_table_members FOR DELETE
  USING (user_id = auth.uid());

-- rpg_sheets: dono vê e edita
CREATE POLICY "owner can manage sheet" ON rpg_sheets FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "table members can view linked sheets" ON rpg_sheets FOR SELECT
  USING (id IN (
    SELECT sheet_id FROM rpg_sheet_table_link stl
    JOIN rpg_table_members m ON m.table_id = stl.table_id
    WHERE m.user_id = auth.uid()
  ));

-- rpg_sheet_table_link
CREATE POLICY "member can manage own link" ON rpg_sheet_table_link FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "table members can view links" ON rpg_sheet_table_link FOR SELECT
  USING (table_id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid()));

-- rpg_feed_posts: membros veem, mestre escreve
CREATE POLICY "members can view feed" ON rpg_feed_posts FOR SELECT
  USING (table_id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid())
      OR table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));

CREATE POLICY "master can manage feed" ON rpg_feed_posts FOR ALL
  USING (author_id = auth.uid());

-- rpg_table_rolls: membros veem (exceto is_master=true), todos rolam
CREATE POLICY "members can view rolls" ON rpg_table_rolls FOR SELECT
  USING (
    (is_master = false OR user_id = auth.uid())
    AND table_id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid())
  );

CREATE POLICY "members can insert rolls" ON rpg_table_rolls FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND table_id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid())
  );

-- rpg_library_entries
CREATE POLICY "members can view library" ON rpg_library_entries FOR SELECT
  USING (table_id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid())
      OR table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));

CREATE POLICY "master can manage library" ON rpg_library_entries FOR ALL
  USING (table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));

-- rpg_sessions
CREATE POLICY "members can view sessions" ON rpg_sessions FOR SELECT
  USING (table_id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid())
      OR table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));

CREATE POLICY "master can manage sessions" ON rpg_sessions FOR ALL
  USING (table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════
-- Realtime
-- ═══════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE rpg_table_rolls;
ALTER PUBLICATION supabase_realtime ADD TABLE rpg_feed_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE rpg_tables;

-- ═══════════════════════════════════════════════════════════════
-- Helper RPCs
-- ═══════════════════════════════════════════════════════════════

-- Incrementa contadores de sessão dos membros
CREATE OR REPLACE FUNCTION increment_member_stats(p_table_id UUID, p_minutes INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE rpg_table_members
  SET total_sessions = total_sessions + 1,
      total_minutes = total_minutes + p_minutes
  WHERE table_id = p_table_id;
END;
$$;

-- Incrementa contagem de sessões da mesa
CREATE OR REPLACE FUNCTION increment_table_session_count(p_table_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE rpg_tables
  SET session_count = session_count + 1,
      updated_at = now()
  WHERE id = p_table_id;
END;
$$;
