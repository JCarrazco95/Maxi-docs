import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/connection.js';
import { requireEditor } from '../middleware/mondayAuth.js';
import { logEvent } from '../services/auditService.js';

const router = Router();

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'sk-ant-...') return null;
  return new Anthropic({ apiKey: key });
}

// POST /api/ai/summarize — genera resumen de un documento con Claude
router.post('/summarize', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { document_id, force_refresh } = req.body;

  if (!document_id) return res.status(400).json({ error: 'document_id es requerido' });

  // Verificar que el documento pertenece a la cuenta
  const docRes = await query(
    `SELECT id, name, content_html FROM documents WHERE id = $1 AND monday_account_id = $2`,
    [document_id, accountId]
  );
  const doc = docRes.rows[0];
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  // Revisar si ya existe resumen reciente (menos de 24h) y no se pide refresh
  if (!force_refresh) {
    const cached = await query(
      `SELECT * FROM document_summaries WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [document_id]
    );
    if (cached.rows[0] && new Date() - new Date(cached.rows[0].created_at) < 86400000) {
      return res.json({ ...cached.rows[0], cached: true });
    }
  }

  const client = getClient();
  if (!client) {
    return res.status(503).json({
      error: 'Claude AI no configurado. Agrega ANTHROPIC_API_KEY al .env',
      configured: false,
    });
  }

  // Extraer texto del HTML (strip tags)
  const text = (doc.content_html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000); // Límite de contexto

  if (!text || text.length < 50) {
    return res.status(400).json({ error: 'El documento no tiene suficiente contenido para resumir' });
  }

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role:    'user',
      content: `Eres un asistente especializado en documentos comerciales y contratos.

Analiza el siguiente documento y proporciona:
1. Un resumen ejecutivo de 2-3 párrafos
2. Los 5 puntos clave más importantes
3. Identifica cualquier fecha límite, monto económico o compromiso importante

Documento: "${doc.name}"

Contenido:
${text}

Responde en JSON con esta estructura exacta:
{
  "summary": "resumen ejecutivo aquí",
  "key_points": ["punto 1", "punto 2", "punto 3", "punto 4", "punto 5"],
  "highlights": ["fecha/monto/compromiso importante 1", "..."]
}`,
    }],
  });

  let parsed;
  try {
    const raw = message.content[0].text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    parsed = { summary: message.content[0].text, key_points: [], highlights: [] };
  }

  // Guardar en BD
  const saved = await query(
    `INSERT INTO document_summaries (document_id, summary, key_points, model, tokens_used)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      document_id,
      parsed.summary || '',
      JSON.stringify(parsed.key_points || []),
      message.model,
      (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0),
    ]
  );

  logEvent({
    documentId: document_id,
    action:     'document.ai_summarized',
    metadata:   { model: message.model, tokens: saved.rows[0].tokens_used },
  });

  res.json({ ...saved.rows[0], highlights: parsed.highlights || [], cached: false });
});

// POST /api/ai/draft — genera un borrador de sección con Claude
router.post('/draft', requireEditor, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ error: 'Claude AI no configurado', configured: false });
  }

  const { prompt, context, type = 'section' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt es requerido' });

  const systemPrompt = type === 'email'
    ? 'Eres un experto en redacción de emails comerciales profesionales en español.'
    : 'Eres un experto en redacción de propuestas comerciales, contratos y documentos empresariales en español. Responde solo con HTML limpio para insertar en un editor de documentos, sin markdown, sin bloques de código.';

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system:     systemPrompt,
    messages: [{
      role:    'user',
      content: context
        ? `Contexto del documento: ${context}\n\nGenera: ${prompt}`
        : prompt,
    }],
  });

  res.json({
    content: message.content[0].text,
    tokens:  (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0),
  });
});

// GET /api/ai/config — verifica si AI está configurado
router.get('/config', (_req, res) => {
  res.json({ configured: !!getClient(), model: 'claude-haiku-4-5-20251001' });
});

export default router;
