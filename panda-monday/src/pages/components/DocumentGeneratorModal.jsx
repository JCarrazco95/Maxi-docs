/**
 * DocumentGeneratorModal — Selección directa de plantilla
 * Clic en plantilla → abre EditorPage en nueva pestaña inmediatamente
 */
import { useState, useEffect } from 'react'
import mondaySdk from 'monday-sdk-js'
import api from '../../api/client.js'
import { openEditorTab } from '../EditorPage.jsx'
import { getContext } from '../../api/client.js'

const monday = mondaySdk()

const IconX     = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconAlert = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const IconOpen  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>

export default function DocumentGeneratorModal({ itemId, boardId, onClose, onGenerated }) {
  const [templates,   setTemplates]   = useState([])
  const [loadingTpl,  setLoadingTpl]  = useState(true)
  const [selectedTpl, setSelectedTpl] = useState(null)
  const [docName,     setDocName]     = useState('')
  const [itemName,    setItemName]    = useState('')
  const [error,       setError]       = useState(null)
  const [opening,     setOpening]     = useState(false)

  useEffect(() => {
    api.get('/api/templates')
      .then(r => setTemplates(r.data))
      .catch(() => setError('Error cargando plantillas'))
      .finally(() => setLoadingTpl(false))
  }, [])

  useEffect(() => {
    if (!itemId) return
    monday.api(`query { items(ids:[${itemId}]) { name } }`)
      .then(res => {
        const name = res.data?.items?.[0]?.name
        if (name) setItemName(name)
      }).catch(() => {})
  }, [itemId])

  function handleSelectTemplate(tpl) {
    setSelectedTpl(tpl)
    if (!docName || docName === (selectedTpl?.name ?? '') || docName === `${selectedTpl?.name} — ${itemName}`) {
      setDocName(itemName ? `${tpl.name} — ${itemName}` : tpl.name)
    }
  }

  async function handleOpenEditor() {
    if (!selectedTpl) { setError('Selecciona una plantilla'); return }
    const name = docName.trim() || (itemName ? `${selectedTpl.name} — ${itemName}` : selectedTpl.name)
    setError(null); setOpening(true)

    const { accountId, userId, isAdmin } = getContext()

    openEditorTab({
      templateId: selectedTpl.id,
      docName:    name,
      boardId,
      itemId,
      accountId,
      userId,
      isAdmin,
      fieldValues: {},
    })

    // Escuchar cuando el editor guarda el documento
    window.addEventListener('mxd-doc-generated', (e) => {
      onGenerated?.(e.detail)
      onClose()
    }, { once: true })

    setOpening(false)
    onClose()
  }

  async function handleImport() {
    try {
      setLoadingTpl(true)
      await api.post('/api/templates/migrate-dev')
      const r = await api.get('/api/templates')
      setTemplates(r.data)
    } catch (e) { setError(e.response?.data?.error || 'Error importando') }
    finally { setLoadingTpl(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-md" style={{ maxWidth: 620 }}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">Nuevo documento</div>
            <div className="modal-subtitle">Selecciona una plantilla para comenzar</div>
          </div>
          <button className="close-btn" onClick={onClose}><IconX /></button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {error && (
            <div className="error-msg" style={{ marginBottom: 12 }}>
              <IconAlert /> {error}
            </div>
          )}

          {/* Nombre del documento */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Nombre del documento</label>
            <input
              className="form-input"
              value={docName}
              onChange={e => setDocName(e.target.value)}
              placeholder={selectedTpl ? (itemName ? `${selectedTpl.name} — ${itemName}` : selectedTpl.name) : 'Se llenará al seleccionar la plantilla'}
            />
          </div>

          {/* Grid de plantillas */}
          <div className="form-group">
            <label className="form-label">Plantilla *</label>

            {loadingTpl ? (
              <div className="dg-loading-row">
                <span className="spinner-sm" /> Cargando plantillas…
              </div>
            ) : templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ color: '#676879', fontSize: 13, marginBottom: 12 }}>No hay plantillas creadas aún</div>
                <button className="btn btn-secondary btn-sm" onClick={handleImport}>
                  📥 Importar plantillas MAXIRent
                </button>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: 10,
              }}>
                {templates.map(t => {
                  const active = selectedTpl?.id === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t)}
                      style={{
                        border: active ? '2px solid #0073ea' : '1px solid #e0e2ea',
                        borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                        background: active ? '#f0f7ff' : 'white', padding: 0, textAlign: 'left',
                        boxShadow: active ? '0 0 0 3px rgba(0,115,234,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {/* Thumbnail */}
                      {t.thumbnail_url
                        ? <img src={t.thumbnail_url} alt={t.name} style={{ width: '100%', height: 94, objectFit: 'cover', display: 'block' }} />
                        : (
                          <div style={{ width: '100%', height: 94, background: active ? '#dbeafe' : '#f0f1f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#0073ea' : '#9699a6', fontSize: 30 }}>
                            📄
                          </div>
                        )
                      }
                      {/* Nombre */}
                      <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#0073ea' : '#323338', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderTop: active ? '1px solid #bfdbfe' : '1px solid #f0f1f5' }}>
                        {active && <span style={{ marginRight: 3 }}>✓</span>}
                        {t.name}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleOpenEditor}
            disabled={!selectedTpl || opening}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {opening
              ? <><span className="spinner-sm" /> Abriendo…</>
              : <><IconOpen /> Abrir editor</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
