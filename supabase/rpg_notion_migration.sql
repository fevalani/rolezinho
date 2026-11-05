-- ═══════════════════════════════════════════════════════════════
-- RPG — Conexão com Notion (um token por mesa, cadastrado pelo mestre)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rpg_notion_connections (
  table_id        UUID PRIMARY KEY REFERENCES rpg_tables(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,
  workspace_name  TEXT,
  bot_name        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rpg_notion_connections ENABLE ROW LEVEL SECURITY;

-- Somente o mestre atual da mesa enxerga e gerencia a conexão.
-- O cliente nunca seleciona access_token (só o api/notion-proxy.ts lê).
CREATE POLICY "master manages notion connection" ON rpg_notion_connections
  FOR ALL
  USING (table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()))
  WITH CHECK (table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));

-- Páginas-raiz escolhidas pelo mestre: [{ "id", "type", "title" }]
ALTER TABLE rpg_notion_connections
  ADD COLUMN IF NOT EXISTS root_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════
-- Cópia (cache) do conteúdo do Notion, sincronizada pelo mestre
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rpg_notion_pages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         UUID NOT NULL REFERENCES rpg_tables(id) ON DELETE CASCADE,
  notion_id        TEXT NOT NULL,
  parent_notion_id TEXT,
  type             TEXT NOT NULL DEFAULT 'page',  -- 'page' | 'database'
  title            TEXT NOT NULL DEFAULT '',
  icon             TEXT,
  blocks           JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order       INT NOT NULL DEFAULT 0,
  sync_run         TEXT,
  synced_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (table_id, notion_id)
);

CREATE INDEX IF NOT EXISTS rpg_notion_pages_table_idx ON rpg_notion_pages(table_id);

ALTER TABLE rpg_notion_pages ENABLE ROW LEVEL SECURITY;

-- Membros leem (o mestre decide o que sincronizar escolhendo as páginas-raiz)
CREATE POLICY "members view notion pages" ON rpg_notion_pages FOR SELECT
  USING (table_id IN (SELECT table_id FROM rpg_table_members WHERE user_id = auth.uid())
      OR table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));

CREATE POLICY "master manages notion pages" ON rpg_notion_pages FOR ALL
  USING (table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()))
  WITH CHECK (table_id IN (SELECT id FROM rpg_tables WHERE master_id = auth.uid()));
