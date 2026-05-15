import { Router } from 'express';
import Stripe from 'stripe';
import { query } from '../db/connection.js';
import { logEvent } from '../services/auditService.js';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === 'sk_test_...') return null;
  return new Stripe(key, { apiVersion: '2025-04-30' });
}

// POST /api/payments/create-intent — crear PaymentIntent para un documento
router.post('/create-intent', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe no configurado. Agrega STRIPE_SECRET_KEY al .env' });
  }

  const { document_id, amount_cents, currency = 'mxn', description } = req.body;
  if (!document_id || !amount_cents) {
    return res.status(400).json({ error: 'document_id y amount_cents son requeridos' });
  }

  const docRes = await query(`SELECT * FROM documents WHERE id = $1`, [document_id]);
  const doc    = docRes.rows[0];
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  const intent = await stripe.paymentIntents.create({
    amount:   Math.round(amount_cents),
    currency,
    metadata: { document_id, document_name: doc.name },
    description: description || `Pago por ${doc.name}`,
  });

  // Guardar payment_intent_id en el documento
  await query(
    `UPDATE documents SET status = 'awaiting_payment' WHERE id = $1`,
    [document_id]
  );

  logEvent({
    documentId: document_id,
    action:     'document.payment_initiated',
    metadata:   { amount_cents, currency, payment_intent: intent.id },
  });

  res.json({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  });
});

// POST /api/payments/confirm — webhook de Stripe o confirmación manual
router.post('/confirm', async (req, res) => {
  const { document_id, payment_intent_id } = req.body;

  const stripe = getStripe();
  if (stripe && payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (intent.status !== 'succeeded') {
      return res.status(400).json({ error: 'El pago no fue completado', status: intent.status });
    }
  }

  await query(`UPDATE documents SET status = 'paid' WHERE id = $1`, [document_id]);

  logEvent({
    documentId: document_id,
    action:     'document.paid',
    metadata:   { payment_intent_id },
  });

  res.json({ ok: true, status: 'paid' });
});

// GET /api/payments/config — devuelve si Stripe está configurado y la clave pública
router.get('/config', (_req, res) => {
  const configured = !!(process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_SECRET_KEY !== 'sk_test_...');
  res.json({
    configured,
    publishableKey: configured ? (process.env.STRIPE_PUBLISHABLE_KEY || '') : null,
  });
});

export default router;
