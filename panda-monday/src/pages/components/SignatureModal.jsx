import { useState } from 'react'
import mondaySdk from 'monday-sdk-js'
import api from '../../api/client.js'

const monday = mondaySdk()

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)

const IconFileText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)

const IconUser = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

const IconAlertCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

export default function SignatureModal({ document, itemId, onClose, onSent }) {
  const [signers, setSigners]   = useState([{ name: '', email: '' }])
  const [expireDays, setExpire] = useState('7')
  const [sending, setSending]   = useState(false)
  const [error, setError]       = useState(null)

  function addSigner() {
    setSigners(prev => [...prev, { name: '', email: '' }])
  }

  function removeSigner(i) {
    setSigners(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateSigner(i, field, value) {
    setSigners(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  async function handleSend(e) {
    e.preventDefault()
    const validSigners = signers.filter(s => s.name.trim() && s.email.trim())
    if (validSigners.length === 0) {
      setError('Agrega al menos un firmante con nombre y email válidos')
      return
    }
    setSending(true)
    setError(null)
    try {
      await api.post('/api/signatures/send', {
        document_id:  document.id,
        signers:      validSigners,
        expire_days:  expireDays ? Number(expireDays) : null,
      })

      // Notificación en el item de Monday
      if (itemId) {
        const signerNames = validSigners.map(s => s.name).join(', ')
        monday.api(`
          mutation {
            create_update(item_id: ${itemId}, body: "✍️ Se envió \\"${document.name}\\" a firma a: ${signerNames}.") {
              id
            }
          }
        `).catch(() => {})
      }

      onSent(document)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al enviar a firma')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <div className="modal-header-icon">
            <div className="modal-header-icon-wrap success">
              <IconSend />
            </div>
            <div>
              <div className="modal-title">Enviar a firma</div>
              <div className="modal-subtitle">Define los firmantes del documento</div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} type="button" aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        <form onSubmit={handleSend}>
          <div className="modal-body">
            <div className="doc-info-strip">
              <IconFileText />
              <div>
                <div className="doc-info-strip-label">Documento</div>
                <div className="doc-info-strip-name">{document.name}</div>
              </div>
            </div>

            {error && (
              <div className="error-msg">
                <IconAlertCircle />
                {error}
              </div>
            )}

            <div className="signers-section-label">
              <IconUser />
              Firmantes ({signers.length})
            </div>

            {signers.map((s, i) => (
              <div key={i} className="signer-row">
                <input
                  className="form-input"
                  placeholder="Nombre completo"
                  value={s.name}
                  onChange={e => updateSigner(i, 'name', e.target.value)}
                />
                <input
                  className="form-input"
                  type="email"
                  placeholder="correo@empresa.com"
                  value={s.email}
                  onChange={e => updateSigner(i, 'email', e.target.value)}
                />
                {signers.length > 1 && (
                  <button
                    type="button"
                    className="close-btn"
                    onClick={() => removeSigner(i)}
                    title="Quitar firmante"
                    style={{ width: 28, height: 28 }}
                  >
                    <IconClose />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addSigner}
              style={{ marginTop: 4 }}
            >
              <IconPlus /> Agregar firmante
            </button>

            <hr className="divider" style={{ margin: '16px 0 12px' }} />

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 12 }}>
                Vigencia de la solicitud
              </label>
              <select
                className="form-select"
                value={expireDays}
                onChange={e => setExpire(e.target.value)}
                style={{ fontSize: 13 }}
              >
                <option value="3">3 días</option>
                <option value="7">7 días (recomendado)</option>
                <option value="15">15 días</option>
                <option value="30">30 días</option>
                <option value="">Sin expiración</option>
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending
                ? <><span className="spinner-sm" /> Enviando…</>
                : <><IconSend /> Enviar a firma</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
