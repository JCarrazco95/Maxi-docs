import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client.js'

const STATUS_LABELS = { pending: 'Pendiente', signed: 'Firmado', rejected: 'Rechazado', expired: 'Expirado' }
const STATUS_CLASS  = { pending: 'badge-sent', signed: 'badge-signed', rejected: 'badge-rejected', expired: 'badge-draft' }

const IconCheck   = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconClock   = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IconCopy    = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const IconRefresh = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
const IconUser    = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function SignatureStatusPanel({ documentId, documentStatus }) {
  const [signatures, setSignatures] = useState([])
  const [loading, setLoading]       = useState(true)
  const [copied, setCopied]         = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/api/signatures/${documentId}`)
      setSignatures(res.data)
    } catch {
      setSignatures([])
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { load() }, [load])

  async function copyLink(sig) {
    if (!sig.sign_url) return
    try {
      await navigator.clipboard.writeText(sig.sign_url)
      setCopied(sig.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // fallback: open the link
      window.open(sig.sign_url, '_blank')
    }
  }

  const signedCount   = signatures.filter(s => s.status === 'signed').length
  const pendingCount  = signatures.filter(s => s.status === 'pending').length
  const allSigned     = signatures.length > 0 && signedCount === signatures.length

  return (
    <div className="sig-panel">
      <div className="sig-panel-header">
        <div className="sig-panel-title">
          <IconUser />
          <span>Firmantes ({signatures.length})</span>
          {allSigned
            ? <span className="sig-summary signed"><IconCheck /> Todos firmaron</span>
            : signatures.length > 0
              ? <span className="sig-summary pending"><IconClock /> {signedCount}/{signatures.length} firmados</span>
              : null
          }
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading} title="Actualizar estado">
          <IconRefresh /> {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {loading ? (
        <div className="sig-panel-loading"><span className="spinner-sm" /> Cargando firmantes…</div>
      ) : signatures.length === 0 ? (
        <div className="sig-panel-empty">Sin firmantes registrados</div>
      ) : (
        <div className="sig-list">
          {signatures.map(sig => (
            <div key={sig.id} className={`sig-row sig-row-${sig.status}`}>
              <div className="sig-avatar">
                {sig.signer_name.charAt(0).toUpperCase()}
              </div>
              <div className="sig-info">
                <div className="sig-name">{sig.signer_name}</div>
                <div className="sig-email">{sig.signer_email}</div>
                {sig.signed_at && (
                  <div className="sig-date">Firmado: {formatDate(sig.signed_at)}</div>
                )}
              </div>
              <div className="sig-actions">
                <span className={`badge ${STATUS_CLASS[sig.status] ?? 'badge-draft'}`}>
                  {STATUS_LABELS[sig.status] ?? sig.status}
                </span>
                {sig.status === 'pending' && sig.sign_url && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => copyLink(sig)}
                    title="Copiar link de firma"
                  >
                    <IconCopy />
                    {copied === sig.id ? '¡Copiado!' : 'Copiar link'}
                  </button>
                )}
                {sig.status === 'signed' && (
                  <span className="sig-check-icon"><IconCheck /></span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
