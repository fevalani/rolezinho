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
