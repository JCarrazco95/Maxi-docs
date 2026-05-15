import { useState, useEffect, useCallback } from 'react'
import api from '../api/client.js'

const STAGES = [
  { key: 'draft',            label: 'Borrador',       color: '#94a3b8', emoji: '📝' },
  { key: 'pending_approval', label: 'En Aprobación',  color: '#f59e0b', emoji: '⏳' },
  { key: 'sent',             label: 'Enviado',         color: '#3b82f6', emoji: '📤' },
  { key: 'signed',           label: 'Firmado',         color: '#22c55e', emoji: '✅' },
  { key: 'rejected',         label: 'Rechazado',       color: '#ef4444', emoji: '❌' },
]

const IconRefresh = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
const IconExLink  = () => <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>

function resolvePdfUrl(url) {
  if (!url) return null
  if (url.startsWith('http://localhost:3001')) return url.replace('http://localhost:3001', '')
  return url
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

function DocCard({ doc }) {
  const pdfUrl = resolvePdfUrl(doc.pdf_url)
  return (
    <div style={{
      background: 'white', borderRadius: 8, padding: '10px 12px',
      border: '1px solid #e0e2ea', marginBottom: 8, fontSize: 13,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'default',
    }}>
      <div style={{ fontWeight: 600, color: '#323338', marginBottom: 4, lineHeight: 1.3, fontSize: 12 }}>
        {doc.name}
      </div>
      <div style={{ color: '#94a3b8', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{formatDate(doc.created_at)}</span>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none', fontSize: 11 }}>
            PDF <IconExLink />
          </a>
        )}
      </div>
      {doc.monday_item_id && (
        <div style={{ fontSize: 10, color: '#c0c4d0', marginTop: 3 }}>Item #{doc.monday_item_id}</div>
      )}
    </div>
  )
}

function StageColumn({ stage, docs, total }) {
  return (
    <div style={{ flex: '0 0 200px', minHeight: 400, display: 'flex', flexDirection: 'column' }}>
      {/* Header de columna */}
      <div style={{
        padding: '10px 12px', borderRadius: '8px 8px 0 0',
        background: stage.color + '18',
        borderTop: `3px solid ${stage.color}`,
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#323338' }}>
            {stage.emoji} {stage.label}
          </span>
          <span style={{
            background: stage.color, color: 'white', borderRadius: 12,
            padding: '1px 8px', fontSize: 11, fontWeight: 700,
          }}>
            {docs.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
        {docs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#c0c4d0', fontSize: 12, padding: '20px 8px' }}>
            Sin documentos
          </div>
        ) : (
          docs.map(doc => <DocCard key={doc.id} doc={doc} />)
        )}
      </div>
    </div>
  )
}

export default function PipelinePage({ isAdmin }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [stats, setStats]         = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [docsRes, statsRes] = await Promise.all([
        api.get('/api/documents'),
        api.get('/api/documents/stats').catch(() => ({ data: null })),
      ])
      setDocuments(docsRes.data)
      setStats(statsRes.data)
    } catch { }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = documents.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  )

  const byStage = stage => filtered.filter(d =>
    d.approval_status === 'pending_approval'
      ? stage === 'pending_approval'
      : d.status === stage && d.approval_status !== 'pending_approval'
  )

  const totalValue = documents.length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Pipeline de Documentos</div>
          <div className="page-subtitle">
            Vista Kanban · {totalValue} documentos en total
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <IconRefresh /> {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* KPI row */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Promedio firma', value: stats.avgSigningDays != null ? `${stats.avgSigningDays} días` : '—', color: '#3b82f6' },
            { label: 'Vencidos (+7d)', value: stats.overdue, color: '#ef4444' },
            { label: 'Firmados', value: stats.signed || 0, color: '#22c55e' },
            { label: 'Enviados', value: stats.sent || 0, color: '#f59e0b' },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: 'white', borderRadius: 8, padding: '10px 16px',
              border: `1px solid ${kpi.color}30`, flex: '1 0 120px',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <input
        className="form-input"
        placeholder="Buscar documentos…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ maxWidth: 280, marginBottom: 16, fontSize: 13 }}
      />

      {/* Kanban board */}
      {loading ? (
        <div className="loading"><div className="spinner" /> Cargando pipeline…</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
          {STAGES.map(stage => (
            <StageColumn
              key={stage.key}
              stage={stage}
              docs={byStage(stage.key)}
              total={totalValue}
            />
          ))}
        </div>
      )}
    </div>
  )
}
