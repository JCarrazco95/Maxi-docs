import { useState, useEffect, useCallback } from 'react'
import api from '../api/client.js'
import TemplateEditorModal from './components/TemplateEditorModal.jsx'

const IconFileText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
)

const IconEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)

const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/>
    <path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
)

const IconAlertCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

function formatRelativeDate(iso) {
  if (!iso) return null
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [migrating, setMigrating] = useState(false)

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // Seed siempre actualiza el contenido de la plantilla MAXIRent
      api.post('/api/templates/seed').catch(() => {})
      const res = await api.get('/api/templates')
      setTemplates(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar plantillas. Verifica que el backend esté corriendo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta plantilla? Esta acción no se puede deshacer.')) return
    try {
      await api.delete(`/api/templates/${id}`)
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch (e) {
      alert(e.response?.data?.error || 'Error al eliminar la plantilla')
    }
  }

  function openCreate() {
    setEditingTemplate(null)
    setModalOpen(true)
  }

  function openEdit(tpl) {
    setEditingTemplate(tpl)
    setModalOpen(true)
  }

  function handleSaved(saved) {
    if (editingTemplate) {
      setTemplates(prev => prev.map(t => t.id === saved.id ? saved : t))
    } else {
      setTemplates(prev => [saved, ...prev])
    }
    setModalOpen(false)
  }

  async function handleMigrateDev() {
    if (!confirm('¿Importar las plantillas creadas en local (dev) a tu cuenta de Monday.com?')) return
    setMigrating(true)
    try {
      const res = await api.post('/api/templates/migrate-dev')
      alert(res.data.message)
      if (res.data.migrated > 0) loadTemplates()
    } catch (e) {
      alert(e.response?.data?.error || 'Error al importar plantillas')
    } finally {
      setMigrating(false)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Cargando plantillas…
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Plantillas</div>
          <div className="page-subtitle">
            Crea plantillas con variables dinámicas
            {templates.length > 0 && (
              <span className="badge badge-draft" style={{ fontSize: 11, padding: '2px 8px' }}>
                {templates.length} {templates.length === 1 ? 'plantilla' : 'plantillas'}
              </span>
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleMigrateDev} disabled={migrating}>
            {migrating
              ? <><span className="spinner-sm" /> Importando…</>
              : <><IconUpload /> Importar desde local</>
            }
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <IconPlus /> Nueva plantilla
          </button>
        </div>
      </div>

      {error && (
        <div className="error-msg">
          <IconAlertCircle />
          {error}
        </div>
      )}

      {templates.length === 0 && !error ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconFileText />
          </div>
          <h3>Sin plantillas todavía</h3>
          <p>Crea tu primera plantilla de documento con variables dinámicas para empezar a generar documentos.</p>
          <button className="btn btn-primary" onClick={openCreate}>
            <IconPlus /> Nueva plantilla
          </button>
        </div>
      ) : (
        <div className="cards-grid">
          {templates.map(tpl => (
            <div key={tpl.id} className="card">
              <div className="card-icon-row">
                <div className="card-icon">
                  <IconFileText />
                </div>
                {tpl.variables?.length > 0 && (
                  <div className="card-vars-badge">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="4" y1="6" x2="20" y2="6"/>
                      <line x1="4" y1="12" x2="14" y2="12"/>
                      <line x1="4" y1="18" x2="18" y2="18"/>
                    </svg>
                    {tpl.variables.length} {tpl.variables.length === 1 ? 'variable' : 'variables'}
                  </div>
                )}
              </div>

              <div className="card-name">{tpl.name}</div>
              <div className="card-desc">{tpl.description || 'Sin descripción'}</div>

              {tpl.variables?.length > 0 && (
                <div className="card-meta">
                  {tpl.variables.slice(0, 4).map(v => (
                    <span key={v} className="tag">{'{{' + v + '}}'}</span>
                  ))}
                  {tpl.variables.length > 4 && (
                    <span className="tag" style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                      +{tpl.variables.length - 4}
                    </span>
                  )}
                </div>
              )}

              {tpl.updated_at && (
                <div className="card-date">
                  <IconClock />
                  {formatRelativeDate(tpl.updated_at)}
                </div>
              )}

              <div className="card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(tpl)}>
                  <IconEdit /> Editar
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(tpl.id)}>
                  <IconTrash /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
