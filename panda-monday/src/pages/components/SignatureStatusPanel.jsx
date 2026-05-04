import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client.js'

const STATUS_LABELS = { pending: 'Pendiente', signed: 'Firmado', rejected: 'Rechazado', expired: 'Expirado' }
const STATUS_CLASS  = { pending: 'badge-sent', signed: 'badge-signed', rejected: 'badge-rejected', expired: 'badge-draft' }

const IconCheck   = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconClock   = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IconCopy    = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const IconRefresh = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
const IconUser    = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>

// Ícono de WhatsApp (SVG oficial simplificado)
const IconWhatsApp = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
  </svg>
)

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function buildWhatsAppUrl(sig, documentName) {
  const msg = encodeURIComponent(
    `Hola ${sig.signer_name} 👋\n\n` +
    `Te comparto el documento *"${documentName}"* para tu revisión y firma digital.\n\n` +
    `🔗 Firmar aquí: ${sig.sign_url}\n\n` +
    `_Enviado via MaxiDocs_`
  )
  return `https://wa.me/?text=${msg}`
}

export default function SignatureStatusPanel({ documentId, documentName, documentStatus }) {
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
      window.open(sig.sign_url, '_blank')
    }
  }

  const signedCount = signatures.filter(s => s.status === 'signed').length
  const allSigned   = signatures.length > 0 && signedCount === signatures.length

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
              <div className="sig-avatar">{sig.signer_name.charAt(0).toUpperCase()}</div>

              <div className="sig-info">
                <div className="sig-name">{sig.signer_name}</div>
                <div className="sig-email">{sig.signer_email}</div>
                {sig.signed_at && <div className="sig-date">Firmado: {formatDate(sig.signed_at)}</div>}
              </div>

              <div className="sig-actions">
                <span className={`badge ${STATUS_CLASS[sig.status] ?? 'badge-draft'}`}>
                  {STATUS_LABELS[sig.status] ?? sig.status}
                </span>

                {sig.status === 'pending' && sig.sign_url && (
                  <>
                    {/* Copiar link */}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyLink(sig)}
                      title="Copiar link de firma"
                    >
                      <IconCopy />
                      {copied === sig.id ? '¡Copiado!' : 'Copiar'}
                    </button>

                    {/* WhatsApp */}
                    <a
                      className="btn btn-whatsapp btn-sm"
                      href={buildWhatsAppUrl(sig, documentName ?? 'documento')}
                      target="_blank"
                      rel="noreferrer"
                      title="Enviar por WhatsApp"
                    >
                      <IconWhatsApp />
                      WhatsApp
                    </a>
                  </>
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
