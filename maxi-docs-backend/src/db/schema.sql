-- =============================================
-- MAXI-DOCS — Schema completo
-- Idempotente: seguro ejecutar múltiples veces
-- =============================================

-- ── Función de updated_at automático ─────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Secuencia para folio único por cuenta ─────────────────────────
CREATE SEQUENCE IF NOT EXISTS doc_number_seq START 1 INCREMENT 1;

-- =================================================================
-- WORKSPACES — Multi-workspace por cuenta
-- =================================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id  VARCHAR(100) NOT NULL,
  name               VARCHAR(255) NOT NULL,
  slug               VARCHAR(255),
  description        TEXT,
  is_default         BOOLEAN DEFAULT false,
  created_by         VARCHAR(100),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_account ON workspaces(monday_account_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_default ON workspaces(monday_account_id, is_default);

-- =================================================================
-- TEMPLATES — Plantillas HTML con variables {{campo}}
-- =================================================================
CREATE TABLE IF NOT EXISTS templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  content_html      TEXT NOT NULL,
  variables         JSONB DEFAULT '[]',
  monday_user_id    VARCHAR(100),
  monday_account_id VARCHAR(100),
  workspace_id      UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_account   ON templates(monday_account_id);
CREATE INDEX IF NOT EXISTS idx_templates_workspace ON templates(workspace_id);

CREATE OR REPLACE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =================================================================
-- DOCUMENTS — Instancias generadas de una plantilla
-- =================================================================
CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       UUID REFERENCES templates(id) ON DELETE SET NULL,
  workspace_id      UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  name              VARCHAR(255) NOT NULL,
  doc_number        VARCHAR(50),
  monday_board_id   VARCHAR(100),
  monday_item_id    VARCHAR(100),
  monday_account_id VARCHAR(100),
  monday_user_id    VARCHAR(100),
  filled_data       JSONB DEFAULT '{}',
  content_html      TEXT,
  pdf_url           TEXT,
  pdf_hash          VARCHAR(64),
  status            VARCHAR(50) DEFAULT 'draft',  -- draft | sent | signed | rejected | awaiting_payment | paid
  approval_status   VARCHAR(50),                  -- pending_approval | approved | rejected | NULL
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_account   ON documents(monday_account_id);
CREATE INDEX IF NOT EXISTS idx_documents_item      ON documents(monday_item_id);
CREATE INDEX IF NOT EXISTS idx_documents_status    ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_user      ON documents(monday_account_id, monday_user_id);

CREATE OR REPLACE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =================================================================
-- SIGNATURES — Solicitudes de firma por documento
-- =================================================================
CREATE TABLE IF NOT EXISTS signatures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_name           VARCHAR(255) NOT NULL,
  signer_email          VARCHAR(255) NOT NULL,
  status                VARCHAR(50) DEFAULT 'pending',  -- pending | signed | rejected | expired
  opensign_document_id  TEXT,                           -- reutilizado para fieldConfig JSON
  sign_url              TEXT,
  signing_order         INT DEFAULT 1,
  viewed_at             TIMESTAMPTZ,
  signed_at             TIMESTAMPTZ,
  time_spent_seconds    INT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_order    ON signatures(document_id, signing_order);
CREATE INDEX IF NOT EXISTS idx_signatures_status   ON signatures(status);

-- =================================================================
-- DOCUMENT_ATTACHMENTS — Archivos de soporte adjuntos a un documento
-- =================================================================
CREATE TABLE IF NOT EXISTS document_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  monday_account_id VARCHAR(100),
  filename          VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(150),
  size_bytes        INTEGER,
  storage_key       TEXT NOT NULL,   -- key en R2 o path relativo en uploads/attachments/
  file_url          TEXT,            -- URL pública si R2 está configurado
  uploaded_by       VARCHAR(100),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_attachments_document ON document_attachments(document_id);

-- =================================================================
-- DOCUMENT_EVENTS — Auditoría completa de acciones
-- =================================================================
CREATE TABLE IF NOT EXISTS document_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  action      VARCHAR(100) NOT NULL,
  actor_id    VARCHAR(100),
  actor_name  VARCHAR(255),
  actor_email VARCHAR(255),
  ip          VARCHAR(50),
  pdf_hash    VARCHAR(64),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_document ON document_events(document_id);
CREATE INDEX IF NOT EXISTS idx_events_action   ON document_events(action);
CREATE INDEX IF NOT EXISTS idx_events_created  ON document_events(created_at);

-- =================================================================
-- APPROVALS — Flujo de aprobación interna antes de enviar
-- =================================================================
CREATE TABLE IF NOT EXISTS approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  approver_id       VARCHAR(100),
  approver_name     VARCHAR(255),
  approver_email    VARCHAR(255) NOT NULL,
  status            VARCHAR(50) DEFAULT 'pending',  -- pending | approved | rejected
  comment           TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_document ON approvals(document_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status   ON approvals(document_id, status);

-- =================================================================
-- CONTENT_BLOCKS — Biblioteca de contenido reutilizable
-- =================================================================
CREATE TABLE IF NOT EXISTS content_blocks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id VARCHAR(100) NOT NULL,
  monday_user_id    VARCHAR(100),
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  content_html      TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_blocks_account ON content_blocks(monday_account_id);

CREATE OR REPLACE TRIGGER content_blocks_updated_at
  BEFORE UPDATE ON content_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =================================================================
-- CPQ_RULES — Reglas de cotización (Configure-Price-Quote)
-- =================================================================
CREATE TABLE IF NOT EXISTS cpq_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id VARCHAR(100) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  condition         JSONB NOT NULL,  -- { field, op, value }
  action            JSONB NOT NULL,  -- { type: 'require_approval' | 'alert', message? }
  active            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpq_rules_account ON cpq_rules(monday_account_id, active);

-- =================================================================
-- ACCOUNT_SETTINGS — Configuración por cuenta
-- =================================================================
CREATE TABLE IF NOT EXISTS account_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id VARCHAR(100) NOT NULL UNIQUE,
  company_name      VARCHAR(255) DEFAULT 'MAXIRent Renta Empresarial',
  logo_url          TEXT,
  primary_color     VARCHAR(20) DEFAULT '#1B3055',
  email_from_name   VARCHAR(255) DEFAULT 'MaxiDocs',
  notify_email      VARCHAR(255),
  webhook_url       TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- WEBHOOK_CONFIGS — Webhooks salientes configurables
-- =================================================================
CREATE TABLE IF NOT EXISTS webhook_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id VARCHAR(100) NOT NULL,
  url               TEXT NOT NULL,
  events            TEXT[] DEFAULT ARRAY['document.sent', 'document.signed'],
  active            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_account ON webhook_configs(monday_account_id, active);

-- =================================================================
-- DEAL_ROOMS — Espacios de colaboración con clientes
-- =================================================================
CREATE TABLE IF NOT EXISTS deal_rooms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id VARCHAR(100) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  owner_id          VARCHAR(100),
  access_token      VARCHAR(64) NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_account ON deal_rooms(monday_account_id);
CREATE INDEX IF NOT EXISTS idx_rooms_token   ON deal_rooms(access_token);

CREATE TABLE IF NOT EXISTS room_documents (
  room_id     UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_room_docs_room ON room_documents(room_id);

CREATE TABLE IF NOT EXISTS room_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  author_name  VARCHAR(255),
  author_email VARCHAR(255),
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_msgs_room ON room_messages(room_id);

-- =================================================================
-- API_KEYS — Claves para integración con Zapier / Make
-- =================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id VARCHAR(100) NOT NULL,
  key_hash          VARCHAR(64) NOT NULL UNIQUE,
  name              VARCHAR(255) NOT NULL,
  scopes            TEXT[] DEFAULT ARRAY['documents:read', 'documents:write', 'signatures:write'],
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_account ON api_keys(monday_account_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON api_keys(key_hash);

-- =================================================================
-- USER_EMAIL_INTEGRATIONS — OAuth Gmail/Outlook por usuario de Monday
-- Permite enviar correos desde la cuenta personal del vendedor
-- =================================================================
CREATE TABLE IF NOT EXISTS user_email_integrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id  VARCHAR(100) NOT NULL,
  monday_user_id     VARCHAR(100) NOT NULL,
  provider           VARCHAR(20)  NOT NULL DEFAULT 'gmail',  -- gmail | outlook (futuro)
  email              VARCHAR(255) NOT NULL,                  -- cuenta conectada
  refresh_token      TEXT         NOT NULL,                  -- cifrado AES con APP_ENCRYPTION_KEY
  scopes             TEXT,                                   -- scopes otorgados
  connected_at       TIMESTAMPTZ DEFAULT NOW(),
  last_used_at       TIMESTAMPTZ,
  UNIQUE (monday_account_id, monday_user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_email_integ_user ON user_email_integrations(monday_account_id, monday_user_id);

-- =================================================================
-- EMBED_TOKENS — JWT revocables para firma embebida
-- =================================================================
CREATE TABLE IF NOT EXISTS embed_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id UUID NOT NULL REFERENCES signatures(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  used         BOOLEAN DEFAULT false,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embed_tokens_sig     ON embed_tokens(signature_id);
CREATE INDEX IF NOT EXISTS idx_embed_tokens_expires ON embed_tokens(expires_at);

-- =================================================================
-- Columnas adicionales en tablas existentes (re-ejecución segura)
-- =================================================================
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_number        VARCHAR(50);
ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS monday_group_id TEXT;
ALTER TABLE catalog_products   ADD COLUMN IF NOT EXISTS monday_item_id  TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pdf_hash          VARCHAR(64);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approval_status   VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id      UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS monday_user_id    VARCHAR(100);

ALTER TABLE templates ADD COLUMN IF NOT EXISTS workspace_id      UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS thumbnail_url    TEXT;  -- PNG de la primera página

ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signing_order    INT DEFAULT 1;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS viewed_at        TIMESTAMPTZ;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS time_spent_seconds INT;

-- =================================================================
-- CATALOG_CATEGORIES — Categorías del catálogo de productos
-- =================================================================
CREATE TABLE IF NOT EXISTS catalog_categories (
  id                SERIAL PRIMARY KEY,
  monday_account_id TEXT NOT NULL,
  name              TEXT NOT NULL,
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cat_cat_account ON catalog_categories(monday_account_id);
DO $$ BEGIN
  ALTER TABLE catalog_categories ADD CONSTRAINT uq_cat_account_name UNIQUE (monday_account_id, name);
EXCEPTION WHEN duplicate_table THEN NULL;
END; $$;

-- =================================================================
-- CATALOG_PRODUCTS — Productos / servicios del catálogo
-- =================================================================
CREATE TABLE IF NOT EXISTS catalog_products (
  id                SERIAL PRIMARY KEY,
  monday_account_id TEXT NOT NULL,
  category_id       INTEGER REFERENCES catalog_categories(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  sku               TEXT DEFAULT '',
  price             NUMERIC(14,2) DEFAULT 0,
  description       TEXT DEFAULT '',
  unit              TEXT DEFAULT '',
  sort_order        INTEGER DEFAULT 0,
  active            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cat_prod_account  ON catalog_products(monday_account_id);
CREATE INDEX IF NOT EXISTS idx_cat_prod_category ON catalog_products(category_id);

CREATE OR REPLACE TRIGGER set_catalog_products_updated_at
  BEFORE UPDATE ON catalog_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
