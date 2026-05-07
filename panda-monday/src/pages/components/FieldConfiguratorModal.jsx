import { useState, useRef, useCallback, useEffect } from 'react'
import mondaySdk from 'monday-sdk-js'
import api from '../../api/client.js'

const monday = mondaySdk()

// ── Field type definitions (igual que DocuSeal) ────────────────
const FIELD_TYPES = [
  { type: 'signature', label: 'Firma',     color: '#1B3055', bg: '#E8EFF8', icon: '✍️', w: 35, h: 8 },
  { type: 'initials',  label: 'Iniciales', color: '#6B3FB5', bg: '#F0EBFA', icon: 'AB', w: 18, h: 6 },
  { type: 'date',      label: 'Fecha',     color: '#0F7B5A', bg: '#E6F5F0', icon: '📅', w: 22, h: 6 },
  { type: 'text',      label: 'Texto',     color: '#B45309', bg: '#FEF3E2', icon: 'T',  w: 30, h: 6 },
  { type: 'number',    label: 'Número',    color: '#0369A1', bg: '#E0F2FE', icon: '#',  w: 22, h: 6 },
  { type: 'checkbox',  label: 'Casilla',   color: '#6D28D9', bg: '#EDE9FE', icon: '☑', w: 8,  h: 5 },
  { type: 'select',    label: 'Selección', color: '#B91C1C', bg: '#FEE2E2', icon: '▾', w: 30, h: 6 },
]

const SIGNER_PALETTE = ['#1B3055', '#6B3FB5', '#0F7B5A', '#B45309', '#C0392B']

function resolvePdfUrl(url) {
  if (!url) return null
  // Usar ruta relativa: pasa por el proxy de Vite → localhost:3001
  // Funciona tanto en local (8301) como via ngrok (HTTPS)
  if (url.startsWith('http://localhost:3001')) {
    return url.replace('http://localhost:3001', '')
  }
  return url
}

// ── Icons ──────────────────────────────────────────────────────
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)
const IconUser = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)
const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const IconChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

// ── Step progress bar ──────────────────────────────────────────
function StepBar({ step }) {
  return (
    <div className="fce-stepbar">
      <div className={`fce-stepbar-item ${step >= 0 ? 'fce-stepbar-active' : ''} ${step > 0 ? 'fce-stepbar-done' : ''}`}>
        <span className="fce-stepbar-num">{step > 0 ? '✓' : '1'}</span>
        <span>Firmantes</span>
      </div>
      <div className="fce-stepbar-line" />
      <div className={`fce-stepbar-item ${step >= 1 ? 'fce-stepbar-active' : ''}`}>
        <span className="fce-stepbar-num">2</span>
        <span>Campos</span>
      </div>
    </div>
  )
}

// ── Step 0: Signers form ───────────────────────────────────────
function SignersStep({ signers, expireDays, senderNote, senderName, error, onAdd, onRemove, onUpdate, onExpire, onNote, onSenderName, onNext, onClose }) {
  return (
    <>
      <div className="modal-body">
        {error && (
          <div className="error-msg"><IconAlert />{error}</div>
        )}

        <div className="signers-section-label"><IconUser /> Firmantes ({signers.length})</div>

        {signers.map((s, i) => (
          <div key={i} className="signer-row">
            <input
              className="form-input"
              placeholder="Nombre completo"
              value={s.name}
              onChange={e => onUpdate(i, 'name', e.target.value)}
            />
            <input
              className="form-input"
              type="email"
              placeholder="correo@empresa.com"
              value={s.email}
              onChange={e => onUpdate(i, 'email', e.target.value)}
            />
            {signers.length > 1 && (
              <button type="button" className="close-btn" onClick={() => onRemove(i)}
                style={{ width: 28, height: 28 }}>
                <IconClose />
              </button>
            )}
          </div>
        ))}

        <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd} style={{ marginTop: 4 }}>
          <IconPlus /> Agregar firmante
        </button>

        <hr className="divider" style={{ margin: '16px 0 12px' }} />

        {/* Nombre del representante (para el email) */}
        <div className="form-group">
          <label className="form-label" style={{ fontSize: 12 }}>
            Tu nombre (representante MAXIRent)
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 4 }}>— aparece en el email</span>
          </label>
          <input
            className="form-input"
            value={senderName}
            onChange={e => onSenderName(e.target.value)}
            placeholder="Ej: Carlos Hernández"
            style={{ fontSize: 13 }}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ fontSize: 12 }}>
            Mensaje personalizado <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(opcional)</span>
          </label>
          <textarea
            className="form-textarea"
            value={senderNote}
            onChange={e => onNote(e.target.value)}
            placeholder="Ej: Adjunto la propuesta acordada. Por favor revísala y fírmala cuando puedas."
            style={{ minHeight: 60, fontSize: 13, resize: 'vertical' }}
            maxLength={500}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 12 }}>Vigencia de la solicitud</label>
          <select className="form-select" value={expireDays} onChange={e => onExpire(e.target.value)} style={{ fontSize: 13 }}>
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
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Siguiente: Colocar campos <IconChevronRight />
        </button>
      </div>
    </>
  )
}

// ── Step 1: Field placement on PDF ────────────────────────────
function FieldsStep({
  pdfUrl, fields, armed, currentPage, totalPages,
  signers, sending, error, previewSrcDoc, pdfLoading, pdfError,
  overlayRef, dragRef,
  onArm, onOverlayClick, onOverlayMouseMove, onOverlayMouseUp,
  onDeleteField, onUpdateField,
  onPageChange, onBack, onSend,
}) {
  // Usa HTML del documento como preview (no depende del archivo PDF en disco)

  const getTypeInfo = (type) => FIELD_TYPES.find(f => f.type === type) ?? FIELD_TYPES[0]

  return (
    <div className="fce-fields-layout">
      {/* ── Left sidebar ───────────────────────────────── */}
      <div className="fce-sidebar">
        <div className="fce-sidebar-section">
          <div className="fce-sidebar-title">Tipo de campo</div>
          <div className="fce-type-grid">
            {FIELD_TYPES.map(ft => (
              <button
                key={ft.type}
                type="button"
                className={`fce-type-btn ${armed === ft.type ? 'fce-type-btn-active' : ''}`}
                style={armed === ft.type ? { borderColor: ft.color, background: ft.bg, color: ft.color } : {}}
                onClick={() => onArm(armed === ft.type ? null : ft.type)}
                title={`Colocar campo: ${ft.label}`}
              >
                <span className="fce-type-icon">{ft.icon}</span>
                <span className="fce-type-label">{ft.label}</span>
              </button>
            ))}
          </div>
          {armed && (
            <div className="fce-armed-hint">
              Haz clic sobre el documento para colocar el campo <strong>{getTypeInfo(armed).label}</strong>
            </div>
          )}
          {!armed && fields.length === 0 && (
            <div className="fce-armed-hint">
              Selecciona un tipo de campo y haz clic en el documento para colocarlo
            </div>
          )}
        </div>

        <div className="fce-sidebar-section fce-sidebar-fields">
          <div className="fce-sidebar-title">Campos colocados ({fields.filter(f => f.page === currentPage).length} en esta página, {fields.length} total)</div>
          {fields.length === 0 ? (
            <div className="fce-no-fields">No hay campos aún</div>
          ) : (
            <div className="fce-fields-list">
              {fields.map(f => {
                const ft = getTypeInfo(f.type)
                return (
                  <div key={f.id} className={`fce-field-item ${f.page !== currentPage ? 'fce-field-item-other-page' : ''}`}>
                    <span className="fce-field-item-icon" style={{ color: ft.color }}>{ft.icon}</span>
                    <div className="fce-field-item-info">
                      <span className="fce-field-item-label">{ft.label}</span>
                      {f.page !== currentPage && (
                        <span className="fce-field-item-page">Pág {f.page}</span>
                      )}
                    </div>
                    {signers.length > 1 && (
                      <select
                        className="fce-signer-select"
                        value={f.signerIndex}
                        onChange={e => onUpdateField(f.id, { signerIndex: Number(e.target.value) })}
                        title="Asignar a firmante"
                      >
                        {signers.map((s, i) => (
                          <option key={i} value={i}>F{i + 1}{s.name ? `: ${s.name.split(' ')[0]}` : ''}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="fce-field-del" onClick={() => onDeleteField(f.id)} title="Eliminar campo">
                      <IconTrash />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div className="fce-sidebar-section">
            <div className="fce-sidebar-title">Página</div>
            <div className="fce-page-nav">
              <button type="button" className="fce-page-btn" onClick={() => onPageChange(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                <IconChevronLeft />
              </button>
              <span className="fce-page-label">{currentPage} / {totalPages}</span>
              <button type="button" className="fce-page-btn" onClick={() => onPageChange(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                <IconChevronRight />
              </button>
            </div>
          </div>
        )}

        <div className="fce-sidebar-note">
          💡 Las posiciones son aproximadas. DocuSeal mostrará los campos al firmante.
        </div>
      </div>

      {/* ── PDF preview + overlay ──────────────────────── */}
      <div className="fce-preview-area">
        <div className="fce-preview-scroll">
          {pdfLoading ? (
            <div className="fce-no-pdf">
              <span className="spinner-sm" style={{ borderTopColor: '#fff' }} /> Cargando documento…
            </div>
          ) : pdfError ? (
            <div className="fce-no-pdf">
              No se pudo cargar la vista previa.<br/>
              <small>Puedes enviar a firma directamente — se usará la firma por defecto.</small>
            </div>
          ) : !previewSrcDoc ? (
            <div className="fce-no-pdf">Genera el documento primero para ver la vista previa</div>
          ) : (
            <div className="fce-page-container">
              <iframe
                key={previewSrcDoc?.length}
                srcDoc={previewSrcDoc}
                className="fce-pdf-iframe"
                scrolling="no"
                title="Vista previa del documento"
                sandbox="allow-same-origin"
                onLoad={e => {
                  try {
                    const h = e.target.contentDocument?.body?.scrollHeight
                    if (h > 100) {
                      e.target.style.height = h + 'px'
                      e.target.parentElement.style.height = h + 'px'
                    }
                  } catch {}
                }}
              />
              <div
                ref={overlayRef}
                className={`fce-overlay ${armed ? 'fce-overlay-armed' : ''}`}
                onClick={onOverlayClick}
                onMouseMove={onOverlayMouseMove}
                onMouseUp={onOverlayMouseUp}
                onMouseLeave={onOverlayMouseUp}
              >
                {fields.filter(f => f.page === currentPage).map(f => {
                  const ft = getTypeInfo(f.type)
                  const signerColor = SIGNER_PALETTE[f.signerIndex % SIGNER_PALETTE.length]
                  return (
                    <div
                      key={f.id}
                      className="fce-field-chip"
                      style={{
                        left:   `${f.x}%`,
                        top:    `${f.y}%`,
                        width:  `${f.w}%`,
                        height: `${f.h}%`,
                        borderColor: signerColor,
                        background:  `${ft.bg}ee`,
                        color:       signerColor,
                      }}
                      onMouseDown={e => {
                        if (armed) return
                        e.stopPropagation()
                        const rect = overlayRef.current.getBoundingClientRect()
                        dragRef.current = {
                          fieldId: f.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          startFx: f.x,
                          startFy: f.y,
                          rw: rect.width,
                          rh: rect.height,
                        }
                      }}
                      title={`${ft.label} — Arrastrar para mover`}
                    >
                      <span className="fce-chip-icon">{ft.icon}</span>
                      <span className="fce-chip-label">{ft.label}</span>
                      {signers.length > 1 && (
                        <span className="fce-chip-signer" style={{ background: signerColor }}>
                          F{f.signerIndex + 1}
                        </span>
                      )}
                      <button
                        type="button"
                        className="fce-chip-del"
                        onClick={e => { e.stopPropagation(); onDeleteField(f.id) }}
                        title="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer within field step */}
        <div className="fce-preview-footer">
          {error && <div className="error-msg" style={{ margin: 0, flex: 1 }}><IconAlert />{error}</div>}
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            <IconChevronLeft /> Volver
          </button>
          <div style={{ flex: 1 }} />
          {fields.length === 0 && (
            <span className="fce-skip-hint">Sin campos configurados se usará la firma por defecto</span>
          )}
          <button type="button" className="btn btn-primary" onClick={onSend} disabled={sending}>
            {sending
              ? <><span className="spinner-sm" /> Enviando…</>
              : <><IconSend /> Enviar a firma</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────
export default function FieldConfiguratorModal({ document, itemId, onClose, onSent }) {
  const [step, setStep] = useState(0)

  // Step 0 state
  const [signers, setSigners]   = useState([{ name: '', email: '' }])
  const [expireDays, setExpire] = useState('7')
  const [senderNote, setNote]       = useState('')
  const [senderName, setSenderName] = useState('')

  // Auto-llenar firmante desde columnas de Monday
  useEffect(() => {
    if (!itemId) return
    monday.api(`
      query {
        items(ids: [${itemId}]) {
          name
          column_values { id title text type }
        }
      }
    `).then(res => {
      const item = res.data?.items?.[0]
      if (!item) return

      // Buscar columna de email
      const emailCol = item.column_values.find(c =>
        c.type === 'email' ||
        c.title.toLowerCase().includes('mail') ||
        c.title.toLowerCase().includes('correo')
      )
      // Buscar columna de contacto/nombre
      const nameCol = item.column_values.find(c =>
        c.type === 'text' &&
        (c.title.toLowerCase().includes('contacto') ||
         c.title.toLowerCase().includes('nombre') ||
         c.title.toLowerCase().includes('contact'))
      )

      const autoEmail = emailCol?.text?.trim() || ''
      const autoName  = nameCol?.text?.trim()  || item.name || ''

      if (autoEmail || autoName) {
        setSigners([{ name: autoName, email: autoEmail }])
      }
    }).catch(() => {})
  }, [itemId])

  // Step 1 state
  const [fields, setFields]         = useState([])
  const [armed, setArmed]           = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages]                = useState(1)

  const [sending, setSending] = useState(false)
  const [error, setError]     = useState(null)

  const overlayRef = useRef(null)
  const dragRef    = useRef(null)

  const pdfUrl = resolvePdfUrl(document?.pdf_url)
  const [previewSrcDoc, setPreviewSrcDoc] = useState(null)
  const [pdfLoading, setPdfLoading]       = useState(false)
  const [pdfError, setPdfError]           = useState(false)
  const activeSigners = signers.filter(s => s.name.trim() && s.email.trim())

  // Cargar HTML del documento para mostrar preview (más confiable que el PDF)
  useEffect(() => {
    if (step !== 1 || !document?.id) return
    setPdfLoading(true)
    setPdfError(false)
    api.get(`/api/documents/${document.id}`)
      .then(res => {
        const html = res.data.content_html || ''
        // Construir documento HTML completo para el iframe srcDoc
        const doc = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222;background:white;}
  img{max-width:100%;display:block;}
  table{width:100%;border-collapse:collapse;}
  th,td{border:1px solid #ddd;padding:6px 8px;font-size:9pt;}
  th{background:#F5A000;color:white;font-weight:bold;}
</style>
</head><body>${html}</body></html>`
        setPreviewSrcDoc(doc)
      })
      .catch(() => setPdfError(true))
      .finally(() => setPdfLoading(false))
  }, [step, document?.id])

  // ── Signer handlers ────────────────────────────────────────
  const addSigner    = () => setSigners(prev => [...prev, { name: '', email: '' }])
  const removeSigner = i  => setSigners(prev => prev.filter((_, idx) => idx !== i))
  const updateSigner = (i, field, value) =>
    setSigners(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  function goToStep1() {
    if (activeSigners.length === 0) {
      setError('Agrega al menos un firmante con nombre y email válidos')
      return
    }
    setError(null)
    setStep(1)
  }

  // ── Field handlers ─────────────────────────────────────────
  const handleOverlayClick = useCallback((e) => {
    if (!armed || dragRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width)  * 100
    const y = ((e.clientY - rect.top)  / rect.height) * 100
    const ft = FIELD_TYPES.find(f => f.type === armed)
    setFields(prev => [...prev, {
      id: Date.now(),
      type: armed,
      x: Math.max(0, Math.min(100 - ft.w, x - ft.w / 2)),
      y: Math.max(0, Math.min(100 - ft.h, y - ft.h / 2)),
      w: ft.w,
      h: ft.h,
      page: currentPage,
      signerIndex: 0,
    }])
  }, [armed, currentPage])

  const handleOverlayMouseMove = useCallback((e) => {
    if (!dragRef.current) return
    const { fieldId, startX, startY, startFx, startFy, rw, rh } = dragRef.current
    const dx = ((e.clientX - startX) / rw) * 100
    const dy = ((e.clientY - startY) / rh) * 100
    setFields(prev => prev.map(f =>
      f.id === fieldId
        ? { ...f, x: Math.max(0, Math.min(100 - f.w, startFx + dx)), y: Math.max(0, Math.min(100 - f.h, startFy + dy)) }
        : f
    ))
  }, [])

  const handleOverlayMouseUp = useCallback(() => { dragRef.current = null }, [])

  const deleteField  = id => setFields(prev => prev.filter(f => f.id !== id))
  const updateField  = (id, updates) => setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))

  // ── Send ───────────────────────────────────────────────────
  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      await api.post('/api/signatures/send', {
        document_id:  document.id,
        signers:      activeSigners,
        expire_days:  expireDays ? Number(expireDays) : null,
        sender_note:  senderNote.trim() || null,
        sender_name:  senderName.trim() || null,
        field_config: fields.length > 0
          ? fields.map(f => ({ type: f.type, x: f.x, y: f.y, w: f.w, h: f.h, page: f.page, signerIndex: f.signerIndex }))
          : null,
      })

      if (itemId) {
        const names = activeSigners.map(s => s.name).join(', ')
        monday.api(`mutation { create_update(item_id: ${itemId}, body: "✍️ Se envió \\"${document.name}\\" a firma a: ${names}.") { id } }`).catch(() => {})
      }

      onSent(document)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al enviar a firma')
      setSending(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${step === 1 ? 'modal-fce' : 'modal-sm'}`}>
        <div className="modal-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="modal-title">Enviar a firma</div>
            <StepBar step={step} />
          </div>
          <button className="close-btn" onClick={onClose} type="button" aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        {step === 0 ? (
          <SignersStep
            signers={signers}
            expireDays={expireDays}
            senderNote={senderNote}
            senderName={senderName}
            error={error}
            onAdd={addSigner}
            onRemove={removeSigner}
            onUpdate={updateSigner}
            onExpire={setExpire}
            onNote={setNote}
            onSenderName={setSenderName}
            onNext={goToStep1}
            onClose={onClose}
          />
        ) : (
          <FieldsStep
            pdfUrl={pdfUrl}
            previewSrcDoc={previewSrcDoc}
            pdfLoading={pdfLoading}
            pdfError={pdfError}
            fields={fields}
            armed={armed}
            currentPage={currentPage}
            totalPages={totalPages}
            signers={activeSigners}
            sending={sending}
            error={error}
            overlayRef={overlayRef}
            dragRef={dragRef}
            onArm={setArmed}
            onOverlayClick={handleOverlayClick}
            onOverlayMouseMove={handleOverlayMouseMove}
            onOverlayMouseUp={handleOverlayMouseUp}
            onDeleteField={deleteField}
            onUpdateField={updateField}
            onPageChange={setCurrentPage}
            onBack={() => { setStep(0); setError(null) }}
            onSend={handleSend}
          />
        )}
      </div>
    </div>
  )
}
