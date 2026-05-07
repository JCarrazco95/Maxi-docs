import { useState, useEffect, useCallback } from 'react'
import api from '../api/client.js'
import DocumentGeneratorModal from './components/DocumentGeneratorModal.jsx'
import FieldConfiguratorModal from './components/FieldConfiguratorModal.jsx'
import SignatureStatusPanel from './components/SignatureStatusPanel.jsx'

const STATUS_LABELS = {
  draft:    'Borrador',
  sent:     'Enviado',
  signed:   'Firmado',
  rejected: 'Rechazado',
}

function resolvePdfUrl(url) {
  if (!url) return null
  if (url.startsWith('http://localhost:3001')) {
    return url.replace('http://localhost:3001', '')
  }
  return url
}

const IconFileText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)

const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
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

const IconExternalLink = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
)

const IconAlertCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

const IconChevron = ({ open }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

export default function DocumentsPage({ itemId, boardId, userId, userName, isAdmin }) {
  const [documents, setDocuments]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [signModalDoc, setSignModalDoc]   = useState(null)
  const [expandedDocId, setExpandedDocId] = useState(null)
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [exporting, setExporting]         = useState(false)

  function toggleExpand(docId) {
    setExpandedDocId(prev => prev === docId ? null : docId)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await api.get('/api/documents/export', {
        responseType: 'blob',
        headers: { Accept: 'text/csv' },
      })
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }))
      const link = document.createElement('a')
      link.href  = url
      link.download = `maxi-docs-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  // Filtrado client-side
  const filtered = documents.filter(doc => {
    const matchStatus = statusFilter === 'all' || doc.status === statusFilter
    const matchSearch = !search || doc.name.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = itemId ? { monday_item_id: String(itemId) } : {}
      const res = await api.get('/api/documents', { params })
      setDocuments(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar documentos. Verifica que el backend esté corriendo.')
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return
    try {
      await api.delete(`/api/documents/${id}`)
      setDocuments(prev => prev.filter(d => d.id !== id))
    } catch (e) {
      alert(e.response?.data?.error || 'Error al eliminar el documento')
    }
  }

  function handleGenerated(doc) {
    setDocuments(prev => [doc, ...prev])
    setGeneratorOpen(false)
  }

  function handleSignSent(doc) {
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'sent' } : d))
    setSignModalDoc(null)
  }

  const formatDate = iso =>
    new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Cargando documentos…
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Documentos</div>
          <div className="page-subtitle">
            {itemId
              ? `Contacto #${itemId}`
              : isAdmin
                ? 'Todos los documentos'
                : 'Tus documentos'}
            {isAdmin && (
              <span className="badge badge-admin">
                Vista Admin
              </span>
            )}
            {documents.length > 0 && (
              <span className="badge badge-draft" style={{ fontSize: 11, padding: '2px 8px' }}>
                {documents.length} {documents.length === 1 ? 'documento' : 'documentos'}
              </span>
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting} title="Exportar a Excel/CSV">
            <IconDownload /> {exporting ? 'Exportando…' : 'Exportar CSV'}
          </button>
          <button className="btn btn-primary" onClick={() => setGeneratorOpen(true)}>
            <IconPlus /> Generar documento
          </button>
        </div>
      </div>

      {error && <div className="error-msg"><IconAlertCircle />{error}</div>}

      {/* ── Barra de filtros ─────────────────────────────── */}
      <div className="filter-bar">
        <div className="filter-search">
          <IconSearch />
          <input
            className="filter-search-input"
            placeholder="Buscar documento…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-tabs">
          {[
            { key: 'all',      label: 'Todos',    count: documents.length },
            { key: 'draft',    label: 'Borradores' },
            { key: 'sent',     label: 'Enviados' },
            { key: 'signed',   label: 'Firmados' },
            { key: 'rejected', label: 'Rechazados' },
          ].map(f => {
            const count = f.key === 'all'
              ? documents.length
              : documents.filter(d => d.status === f.key).length
            return count > 0 || f.key === 'all' ? (
              <button
                key={f.key}
                className={`filter-tab ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
                <span className="filter-tab-count">{count}</span>
              </button>
            ) : null
          })}
        </div>
      </div>

      {documents.length === 0 && !error ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconFileText />
          </div>
          <h3>Sin documentos todavía</h3>
          <p>Genera tu primer documento a partir de una plantilla para verlo aquí.</p>
          <button className="btn btn-primary" onClick={() => setGeneratorOpen(true)}>
            <IconPlus /> Generar documento
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                {isAdmin && <th>Usuario</th>}
                <th>Estado</th>
                <th>Fecha</th>
                <th>PDF</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  No hay documentos que coincidan con el filtro
                </td></tr>
              )}
              {filtered.map(doc => (
                <>
                <tr key={doc.id} className={expandedDocId === doc.id ? 'row-expanded' : ''}>
                  <td>
                    <div className="doc-name-row">
                      <div className="doc-icon"><IconFileText /></div>
                      <div>
                        <span className="doc-name">{doc.name}</span>
                        {(doc.status === 'sent' || doc.status === 'signed') && (
                          <button
                            className="sig-expand-btn"
                            onClick={() => toggleExpand(doc.id)}
                            title={expandedDocId === doc.id ? 'Ocultar firmantes' : 'Ver firmantes'}
                          >
                            <IconChevron open={expandedDocId === doc.id} />
                            {expandedDocId === doc.id ? 'Ocultar firmas' : 'Ver firmas'}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  {isAdmin && (
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {doc.monday_user_id
                        ? (String(doc.monday_user_id) === String(userId)
                            ? (userName ?? doc.monday_user_id)
                            : `ID: ${doc.monday_user_id}`)
                        : '—'}
                    </td>
                  )}
                  <td>
                    <span className={`badge badge-${doc.status}`}>
                      {STATUS_LABELS[doc.status] ?? doc.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatDate(doc.created_at)}
                  </td>
                  <td>
                    {doc.pdf_url ? (
                      <a
                        className="doc-pdf-link"
                        href={resolvePdfUrl(doc.pdf_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver PDF
                        <IconExternalLink />
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      {doc.status === 'draft' && doc.pdf_url && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSignModalDoc(doc)}
                          title="Enviar a firma"
                        >
                          <IconSend /> Enviar a firma
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm btn-icon"
                        onClick={() => handleDelete(doc.id)}
                        title="Eliminar documento"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedDocId === doc.id && (
                  <tr key={`${doc.id}-panel`} className="row-panel">
                    <td colSpan={isAdmin ? 6 : 5} style={{ padding: 0 }}>
                      <SignatureStatusPanel
                        documentId={doc.id}
                        documentName={doc.name}
                        documentStatus={doc.status}
                      />
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {generatorOpen && (
        <DocumentGeneratorModal
          itemId={itemId}
          boardId={boardId}
          onClose={() => setGeneratorOpen(false)}
          onGenerated={handleGenerated}
        />
      )}

      {signModalDoc && (
        <FieldConfiguratorModal
          document={signModalDoc}
          itemId={itemId}
          onClose={() => setSignModalDoc(null)}
          onSent={handleSignSent}
        />
      )}
    </div>
  )
}
