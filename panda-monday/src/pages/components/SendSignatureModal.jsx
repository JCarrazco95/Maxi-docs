import { useState, useEffect } from 'react'
import mondaySdk from 'monday-sdk-js'
import api from '../../api/client.js'
import PdfSignatureEditor from './PdfSignatureEditor.jsx'

const monday = mondaySdk()

const IconX     = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconSend  = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const IconAlert = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const IconCheck = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconPlus  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
const IconEdit  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

const emptySignerRow = () => ({ name: '', email: '', autoFilled: false })

// ── Paso 1: Configurar firmantes ─────────────────────────────────
function StepSigners({ document, itemId, signers, setSigners, sequential, setSequential, note, setNote, expire, setExpire, onNext, onClose }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!itemId) return
    monday.api(`query { items(ids:[${itemId}]) { name column_values { id title text type } } }`)
      .then(res => {
        const item = res.data?.items?.[0]
        if (!item) return
        const emailCol = item.column_values.find(c =>
          c.type === 'email' ||
          c.title.toLowerCase().includes('mail') ||
          c.title.toLowerCase().includes('correo')
        )
        const nameCol = item.column_values.find(c =>
          c.title.toLowerCase().includes('contacto') ||
          c.title.toLowerCase().includes('nombre') ||
          c.title.toLowerCase().includes('contact')
        )
        const autoEmail = emailCol?.text?.trim() || ''
        const autoName  = nameCol?.text?.trim()  || item.name || ''
        if (autoEmail || autoName) {
          setSigners(prev => [
            { ...prev[0], name: autoName || prev[0].name, email: autoEmail || prev[0].email, autoFilled: !!autoEmail },
            ...prev.slice(1),
          ])
        }
      }).catch(() => {})
  }, [itemId])

  function updateSigner(idx, field, value) {
    setSigners(prev => prev.map((s, i) => i === idx
      ? { ...s, [field]: value, autoFilled: field === 'email' ? false : s.autoFilled }
      : s))
  }

  function validate() {
    for (const s of signers) {
      if (!s.name.trim()) { setError('Todos los firmantes requieren nombre'); return false }
      if (!s.email.trim()) { setError('Todos los firmantes requieren email'); return false }
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRe.test(s.email.trim())) { setError(`Email inválido: ${s.email}`); return false }
    }
    return true
  }

  function handleNext(e) {
    e.preventDefault()
    if (!validate()) return
    onNext()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <div>
            <div className="modal-title">Enviar a firma</div>
            <div className="modal-subtitle" style={{ fontSize: 12, marginTop: 2, color: 'var(--text-tertiary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {document.name}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}><IconX /></button>
        </div>

        <form onSubmit={handleNext}>
          <div className="modal-body">
            {error && <div className="error-msg"><IconAlert /> {error}</div>}

            {/* Firmantes */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>
                  Firmantes {signers.length > 1 && <span style={{ color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 400 }}>({signers.length})</span>}
                </label>
                {signers.length > 1 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={sequential} onChange={e => setSequential(e.target.checked)} style={{ width: 14, height: 14 }} />
                    Firma secuencial
                  </label>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {signers.map((signer, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                    {signers.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)' }}>
                          Firmante {idx + 1} {sequential && signers.length > 1 ? `(orden ${idx + 1})` : '(paralelo)'}
                        </span>
                        <button type="button" onClick={() => setSigners(p => p.filter((_, i) => i !== idx))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2, display: 'flex' }}>
                          <IconTrash />
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input className="form-input" value={signer.name}
                        onChange={e => updateSigner(idx, 'name', e.target.value)}
                        placeholder="Nombre completo" style={{ fontSize: 13 }} autoFocus={idx === 0} />
                      <div style={{ position: 'relative' }}>
                        <input className={`form-input ${signer.autoFilled ? 'auto-filled' : ''}`}
                          type="email" value={signer.email}
                          onChange={e => updateSigner(idx, 'email', e.target.value)}
                          placeholder="correo@empresa.com"
                          style={{ fontSize: 13, paddingRight: signer.autoFilled ? 28 : undefined }} />
                        {signer.autoFilled && (
                          <span title="Auto-llenado desde Monday" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--success)' }}>
                            <IconCheck />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => setSigners(p => [...p, emptySignerRow()])}
                style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 500 }}>
                <IconPlus /> Agregar firmante
              </button>
            </div>

            {/* Mensaje */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: 12 }}>
                Mensaje <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(opcional)</span>
              </label>
              <textarea className="form-textarea" value={note} onChange={e => setNote(e.target.value)}
                placeholder="Adjunto la propuesta. Por favor revísala y fírmala."
                style={{ minHeight: 60, fontSize: 13, resize: 'vertical' }} maxLength={400} />
            </div>

            {/* Vigencia */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 12 }}>Vigencia del enlace</label>
              <select className="form-select" value={expire} onChange={e => setExpire(e.target.value)} style={{ fontSize: 13 }}>
                <option value="3">3 días</option>
                <option value="7">7 días (recomendado)</option>
                <option value="15">15 días</option>
                <option value="30">30 días</option>
                <option value="">Sin expiración</option>
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">
              <IconEdit /> Colocar campos →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Componente principal (wizard) ────────────────────────────────
export default function SendSignatureModal({ document, itemId, onClose, onSent }) {
  const [step,       setStep]       = useState('signers')   // 'signers' | 'fields'
  const [signers,    setSigners]    = useState([emptySignerRow()])
  const [sequential, setSequential] = useState(true)
  const [note,       setNote]       = useState('')
  const [expire,     setExpire]     = useState('7')
  const [sending,    setSending]    = useState(false)
  const [sendError,  setSendError]  = useState(null)

  // ── Cuando el usuario confirma los campos en el editor ──────────
  async function handleFieldsConfirmed(perSignerFields) {
    setSending(true)
    setSendError(null)
    try {
      // perSignerFields[i] = array de campos para signers[i]
      // El backend espera field_config = array de campos para TODOS los firmantes en orden
      // Aplanamos con signerIndex para que el backend lo asigne correctamente
      const flatFields = perSignerFields.flatMap((fields, signerIdx) =>
        fields.map(f => ({ ...f, signerIndex: signerIdx }))
      )

      await api.post('/api/signatures/send', {
        document_id: document.id,
        signers: signers.map((s, i) => ({
          name:  s.name.trim(),
          email: s.email.trim(),
          order: sequential ? i + 1 : 1,
        })),
        field_config: flatFields.length > 0 ? flatFields : null,
        expire_days:  expire ? Number(expire) : null,
        sender_note:  note.trim() || null,
      })

      if (itemId) {
        const names = signers.map(s => s.name).join(', ')
        monday.api(`mutation { create_update(item_id:${itemId}, body:"✍️ Propuesta \\"${document.name}\\" enviada a firma a ${names}.") { id } }`)
          .catch(() => {})
      }

      onSent(document)
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Error al enviar'
      console.error('[SendSignature] Error:', err.response?.status, msg, err.response?.data)
      setSendError(msg)
      setSending(false)
      // NO redirigir — mostrar el error en pantalla
    }
  }

  if (sending) {
    return (
      <div className="modal-overlay">
        <div className="modal modal-sm" style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Enviando documento a firma…</div>
        </div>
      </div>
    )
  }

  // Error al enviar — mostrar sin perder el contexto
  if (sendError && step === 'fields') {
    return (
      <div className="modal-overlay">
        <div className="modal modal-sm" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#323338', marginBottom: 8 }}>
            Error al enviar
          </div>
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
            padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 20, textAlign: 'left',
          }}>
            {sendError}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => { setSendError(null); setStep('signers') }}>
              Cambiar firmantes
            </button>
            <button className="btn btn-primary" onClick={() => setSendError(null)}>
              Volver al editor de campos
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'fields') {
    if (!document.pdf_url) {
      return (
        <div className="modal-overlay">
          <div className="modal modal-sm" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Sin PDF generado</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
              Genera el PDF del documento antes de enviar a firma.
            </div>
            <button className="btn btn-secondary" onClick={() => setStep('signers')}>Volver</button>
          </div>
        </div>
      )
    }

    return (
      <PdfSignatureEditor
        pdfUrl={document.pdf_url}
        signers={signers.map(s => ({ name: s.name.trim(), email: s.email.trim() }))}
        onConfirm={handleFieldsConfirmed}
        onCancel={() => setStep('signers')}
      />
    )
  }

  return (
    <StepSigners
      document={document}
      itemId={itemId}
      signers={signers}
      setSigners={setSigners}
      sequential={sequential}
      setSequential={setSequential}
      note={note}
      setNote={setNote}
      expire={expire}
      setExpire={setExpire}
      onNext={() => setStep('fields')}
      onClose={onClose}
      error={sendError}
    />
  )
}
