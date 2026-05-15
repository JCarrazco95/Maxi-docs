import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client.js'

const STATUS_LABEL = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' }
const STATUS_CLASS  = { pending: 'badge-sent', approved: 'badge-signed', rejected: 'badge-rejected' }

const IconCheck  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconX      = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconPlus   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconShield = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ApprovalPanel({ documentId, documentStatus, onStatusChange }) {
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [email, setEmail]         = useState('')
  const [name, setName]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resolving, setResolving]   = useState(null)
  const [comment, setComment]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/api/approvals/${documentId}`)
      setApprovals(res.data)
    } catch { setApprovals([]) }
    finally { setLoading(false) }
  }, [documentId])

  useEffect(() => { load() }, [load])

  async function handleRequest(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    try {
      await api.post('/api/approvals/request', {
        document_id: documentId,
        approver_email: email.trim(),
        approver_name: name.trim() || email.trim(),
      })
      setEmail(''); setName(''); setShowForm(false)
      await load()
      onStatusChange?.('pending_approval')
    } catch (err) {
      alert(err.response?.data?.error || 'Error al solicitar aprobación')
    } finally { setSubmitting(false) }
  }

  async function handleResolve(approvalId, decision) {
    setResolving(approvalId)
    try {
      const res = await api.post(`/api/approvals/${approvalId}/resolve`, { decision, comment })
      setComment('')
      await load()
      onStatusChange?.(res.data.documentApprovalStatus)
    } catch (err) {
      alert(err.response?.data?.error || 'Error')
    } finally { setResolving(null) }
  }

  async function handleDelete(approvalId) {
    if (!confirm('¿Cancelar esta solicitud de aprobación?')) return
    try {
      await api.delete(`/api/approvals/${approvalId}`)
      await load()
      onStatusChange?.(null)
    } catch { }
  }

  const pendingCount  = approvals.filter(a => a.status === 'pending').length
  const approvedCount = approvals.filter(a => a.status === 'approved').length

  return (
    <div className="sig-panel">
      <div className="sig-panel-header">
        <div className="sig-panel-title">
          <IconShield />
          <span>Aprobaciones ({approvals.length})</span>
          {pendingCount > 0 && <span className="sig-summary pending">{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</span>}
          {approvals.length > 0 && pendingCount === 0 && <span className="sig-summary signed"><IconCheck /> Todas resueltas</span>}
        </div>
        {documentStatus === 'draft' && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(v => !v)}>
            <IconPlus /> Solicitar aprobación
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleRequest} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input className="form-input" placeholder="Email del aprobador *" type="email" value={email}
              onChange={e => setEmail(e.target.value)} style={{ fontSize: 13 }} required autoFocus />
            <input className="form-input" placeholder="Nombre (opcional)" value={name}
              onChange={e => setName(e.target.value)} style={{ fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Solicitar'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="sig-panel-loading"><span className="spinner-sm" /> Cargando…</div>
      ) : approvals.length === 0 ? (
        <div className="sig-panel-empty">Sin solicitudes de aprobación</div>
      ) : (
        <div className="sig-list">
          {approvals.map(ap => (
            <div key={ap.id} className={`sig-row sig-row-${ap.status === 'approved' ? 'signed' : ap.status === 'rejected' ? 'rejected' : 'pending'}`}>
              <div className="sig-avatar">{(ap.approver_name || ap.approver_email).charAt(0).toUpperCase()}</div>
              <div className="sig-info">
                <div className="sig-name">{ap.approver_name || ap.approver_email}</div>
                <div className="sig-email">{ap.approver_email}</div>
                {ap.comment && <div className="sig-date" style={{ fontStyle: 'italic' }}>"{ap.comment}"</div>}
                {ap.resolved_at && <div className="sig-date">{formatDate(ap.resolved_at)}</div>}
              </div>
              <div className="sig-actions">
                <span className={`badge ${STATUS_CLASS[ap.status]}`}>
                  {STATUS_LABEL[ap.status]}
                </span>
                {ap.status === 'pending' && (
                  <>
                    <input
                      className="form-input"
                      placeholder="Comentario…"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      style={{ fontSize: 12, padding: '3px 8px', width: 120 }}
                    />
                    <button
                      className="btn btn-sm"
                      style={{ background: '#22c55e', color: 'white', border: 'none' }}
                      disabled={resolving === ap.id}
                      onClick={() => handleResolve(ap.id, 'approved')}
                      title="Aprobar"
                    >
                      <IconCheck />
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={resolving === ap.id}
                      onClick={() => handleResolve(ap.id, 'rejected')}
                      title="Rechazar"
                    >
                      <IconX />
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(ap.id)} title="Cancelar">
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
