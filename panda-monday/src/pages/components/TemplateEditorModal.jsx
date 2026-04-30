import { useState } from 'react'
import api from '../../api/client.js'
import WysiwygEditor from './WysiwygEditor.jsx'

function extractVars(html) {
  const matches = [...html.matchAll(/\{\{(\w+)\}\}/g)]
  return [...new Set(matches.map(m => m[1]))]
}

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const IconTemplate = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="9" y1="21" x2="9" y2="9"/>
  </svg>
)

const IconAlertCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

const IconCheckCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
)

export default function TemplateEditorModal({ template, onClose, onSaved }) {
  const isEditing = !!template

  const [name, setName]        = useState(template?.name ?? '')
  const [description, setDesc] = useState(template?.description ?? '')
  const [contentHtml, setHtml] = useState(template?.content_html ?? EXAMPLE_HTML)
  const [saving, setSaving]    = useState(false)
  const [error, setError]      = useState(null)

  const vars = extractVars(contentHtml)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !contentHtml.trim()) {
      setError('El nombre y el contenido HTML son requeridos')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = { name, description, content_html: contentHtml }
      const res = isEditing
        ? await api.put(`/api/templates/${template.id}`, payload)
        : await api.post('/api/templates', payload)
      onSaved(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar la plantilla')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div className="modal-header-icon">
            <div className="modal-header-icon-wrap primary">
              <IconTemplate />
            </div>
            <div>
              <div className="modal-title">
                {isEditing ? 'Editar plantilla' : 'Nueva plantilla'}
              </div>
              <div className="modal-subtitle">
                {isEditing
                  ? `Modificando: ${template.name}`
                  : 'Define el contenido HTML y variables dinámicas'}
              </div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} type="button" aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="error-msg">
                <IconAlertCircle />
                {error}
              </div>
            )}

            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: Contrato de servicios"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input
                  className="form-input"
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Descripción opcional"
                />
              </div>
            </div>

            <hr className="divider" />

            <div className="form-group">
              <label className="form-label">Contenido del documento *</label>
              <WysiwygEditor
                value={contentHtml}
                onChange={html => setHtml(html)}
              />
              <div className="form-hint" style={{ marginTop: 6 }}>
                Usa el botón <strong>{'{{var}}'}</strong> en la barra para insertar campos dinámicos que se llenarán con datos de Monday.com
              </div>
            </div>

            {vars.length > 0 && (
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconCheckCircle style={{ width: 12, height: 12, stroke: 'var(--success)' }} />
                  Variables detectadas ({vars.length})
                </label>
                <div className="variables-preview">
                  {vars.map(v => (
                    <span key={v} className="var-chip">{'{{' + v + '}}'}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? <><span className="spinner-sm" /> Guardando…</>
                : isEditing ? 'Actualizar plantilla' : 'Crear plantilla'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const EXAMPLE_HTML = `<h1>{{titulo}}</h1>

<p>
  El presente contrato se celebra entre <strong>{{empresa}}</strong>
  y el cliente <strong>{{nombre_cliente}}</strong>,
  con fecha {{fecha}}.
</p>

<h2>Descripción del servicio</h2>
<p>{{descripcion_servicio}}</p>

<h2>Condiciones</h2>
<p>El monto acordado es de <strong>{{monto}}</strong>.</p>

<div class="signature-block">
  <div class="signature-line">Firma del cliente<br/>{{nombre_cliente}}</div>
  <div class="signature-line">Firma de la empresa<br/>{{empresa}}</div>
</div>`
