-- =============================================
-- MAXI-DOCS — Schema de base de datos
-- =============================================

-- Plantillas de documentos
-- Cada plantilla tiene HTML con variables {{campo}}
CREATE TABLE IF NOT EXISTS templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  content_html  TEXT NOT NULL,                  -- HTML con variables {{nombre}}, {{empresa}}, etc.
  variables     JSONB DEFAULT '[]',             -- Lista de variables detectadas
  monday_user_id VARCHAR(100),                  -- ID del usuario de Monday que la creo
  monday_account_id VARCHAR(100),               -- ID de la cuenta de Monday
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos generados (instancias de una plantilla con datos reales)
CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       UUID REFERENCES templates(id) ON DELETE SET NULL,
  name              VARCHAR(255) NOT NULL,
  monday_board_id   VARCHAR(100),               -- Board de origen
  monday_item_id    VARCHAR(100),               -- Item de origen
  monday_account_id VARCHAR(100),
  monday_user_id    VARCHAR(100),               -- Usuario que generó el documento
  filled_data       JSONB DEFAULT '{}',         -- Datos con los que se rellenaron las variables
  content_html      TEXT,                       -- HTML final (ya con variables reemplazadas)
  pdf_url           TEXT,                       -- URL en R2 del PDF generado
  status            VARCHAR(50) DEFAULT 'draft', -- draft | sent | signed | rejected
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar columna si ya existe la tabla (re-ejecuciones seguras)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS monday_user_id VARCHAR(100);

-- Firmas asociadas a documentos
CREATE TABLE IF NOT EXISTS signatures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_name           VARCHAR(255) NOT NULL,
  signer_email          VARCHAR(255) NOT NULL,
  status                VARCHAR(50) DEFAULT 'pending', -- pending | signed | rejected | expired
  opensign_document_id  VARCHAR(255),                   -- ID del documento en OpenSign
  sign_url              TEXT,                           -- Link de firma para enviar al firmante
  signed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Indice para buscar documentos por item de Monday rapidamente
CREATE INDEX IF NOT EXISTS idx_documents_monday_item ON documents(monday_item_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_id);

-- Funcion para actualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
