/**
 * RecipientsPanel — Panel de destinatarios/firmantes del documento
 * Autofill desde Monday.com, firma secuencial configurable.
 */
import { useState, useEffect } from 'react'
import mondaySdk from 'monday-sdk-js'

const monday = mondaySdk()

const emptyRow = () => ({ name: '', email: '', autoFilled: false })

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RecipientsPanel({ itemId, signers, setSigners, sequential, setSequential, onClose }) {
  const [loading, setLoading] = useState(false)

  // Autofill desde el item de Monday
  useEffect(() => {
    if (!itemId || signers.some(s => s.autoFilled)) return
    setLoading(true)
    monday.api(`query { items(ids:[${itemId}]) { name column_values { id title text type } } }`)
      .then(res => {
        const item = res.data?.items?.[0]
        if (!item) return
        const emailCol = item.column_values.find(c =>
          c.type === 'email' || c.title.toLowerCase().includes('mail') || c.title.toLowerCase().includes('correo')
        )
        const nameCol = item.column_values.find(c =>
          c.title.toLowerCase().includes('contacto') ||
          c.title.toLowerCase().includes('nombre') ||
          c.title.toLowerCase().includes('contact')
        )
        const autoEmail = emailCol?.text?.trim() || ''
        const autoName  = nameCol?.text?.trim()  || item.name || ''
        if (autoEmail || autoName) {
          setSigners([{ name: autoName, email: autoEmail, autoFilled: true }])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [itemId])

  function update(idx, field, val) {
    setSigners(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val, autoFilled: field === 'email' ? false : s.autoFilled } : s))
  }
  function add()        { setSigners(p => [...p, emptyRow()]) }
  function remove(idx)  { setSigners(p => p.filter((_, i) => i !== idx)) }

  const valid = signers.every(s => s.name.trim() && emailRe.test(s.email.trim()))

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>Destinatarios</span>
        {onClose && <button onClick={onClose} style={s.close}>×</button>}
      </div>

      <div style={s.body}>
        {loading && <div style={s.hint}>Cargando datos de Monday…</div>}

        {signers.length > 1 && (
          <label style={s.seqLabel}>
            <input type="checkbox" checked={sequential} onChange={e => setSequential(e.target.checked)} style={{ marginRight: 6 }} />
            Firma secuencial (en orden)
          </label>
        )}

        {signers.map((sig, idx) => (
          <div key={idx} style={s.card}>
            <div style={s.cardHeader}>
              <div style={s.badge}>{sequential && signers.length > 1 ? `${idx + 1}°` : '●'} Firmante {idx + 1}</div>
              {signers.length > 1 && (
                <button onClick={() => remove(idx)} style={s.removeBtn}>×</button>
              )}
            </div>
            <input
              value={sig.name}
              onChange={e => update(idx, 'name', e.target.value)}
              placeholder="Nombre completo"
              style={{ ...s.input, marginBottom: 6 }}
            />
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                value={sig.email}
                onChange={e => update(idx, 'email', e.target.value)}
                placeholder="correo@empresa.com"
                style={{
                  ...s.input,
                  borderColor: sig.email && !emailRe.test(sig.email) ? '#fca5a5' : undefined,
                  paddingRight: sig.autoFilled ? 28 : undefined,
                }}
              />
              {sig.autoFilled && (
                <span title="Auto-llenado desde Monday" style={s.checkIcon}>✓</span>
              )}
            </div>
          </div>
        ))}

        <button onClick={add} style={s.addBtn}>
          + Agregar firmante
        </button>

        {!valid && signers.some(s => s.name || s.email) && (
          <div style={s.warn}>Completa nombre y email válido en todos los firmantes</div>
        )}

        <div style={s.divider} />

        <div style={{ fontSize: 12, color: '#676879', lineHeight: 1.5 }}>
          <strong>Nota:</strong> Al generar el PDF y hacer clic en <em>"Enviar a firma"</em> en el header, podrás colocar los campos de firma sobre el documento antes de enviarlo.
        </div>
      </div>
    </div>
  )
}

const s = {
  panel:    { width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fafbfc', borderLeft: '1px solid #e0e2ea', overflow: 'hidden' },
  header:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: '1px solid #e0e2ea', flexShrink: 0 },
  title:    { fontSize: 13, fontWeight: 700, color: '#1B3055' },
  close:    { background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 18, lineHeight: 1 },
  body:     { flex: 1, overflowY: 'auto', padding: 12 },
  hint:     { fontSize: 12, color: '#94a3b8', padding: '8px 0' },
  seqLabel: { display: 'flex', alignItems: 'center', fontSize: 12, color: '#323338', marginBottom: 12, cursor: 'pointer' },
  card:     { background: 'white', border: '1px solid #e0e2ea', borderRadius: 8, padding: 10, marginBottom: 10 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge:    { fontSize: 11, fontWeight: 700, color: '#0073ea' },
  removeBtn:{ background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 16, lineHeight: 1 },
  input:    { width: '100%', padding: '6px 8px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', outline: 'none' },
  checkIcon:{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#22c55e', fontSize: 14 },
  addBtn:   { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#0073ea', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: 12 },
  warn:     { fontSize: 11, color: '#dc2626', background: '#fee2e2', padding: '6px 8px', borderRadius: 6, marginBottom: 10 },
  divider:  { height: 1, background: '#f0f1f5', margin: '12px 0' },
}
