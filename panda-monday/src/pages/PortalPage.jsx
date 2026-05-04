import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/client.js'

function resolvePdfUrl(url) {
  if (!url) return null
  if (url.startsWith('http://localhost:3001')) return url.replace('http://localhost:3001', window.location.origin)
  return url
}

// ── Vistas ────────────────────────────────────────────────────

function PortalHeader() {
  return (
    <header className="portal-header">
      <div className="portal-logo">
        <div className="portal-logo-icon">M</div>
        <span className="portal-logo-text">Maxi<span>Docs</span></span>
      </div>
      <span className="portal-logo-sub">Gestión de documentos · MAXIRent</span>
    </header>
  )
}

function PortalSigned({ data }) {
  const pdfUrl = resolvePdfUrl(data.document.pdf_url)
  return (
    <div className="portal-body">
      <div className="portal-success-card">
        <div className="portal-success-icon">✅</div>
        <h2 className="portal-success-title">¡Documento firmado!</h2>
        <p className="portal-success-sub">
          <strong>{data.signature.signer_name}</strong>, tu firma fue registrada correctamente.
        </p>
        <div className="portal-doc-chip">
          <span className="portal-doc-chip-label">Documento</span>
          <span className="portal-doc-chip-name">{data.document.name}</span>
        </div>
        {pdfUrl && (
          <a className="portal-btn portal-btn-success" href={pdfUrl} target="_blank" rel="noreferrer">
            📄 Descargar PDF firmado
          </a>
        )}
        <p className="portal-success-note">
          Recibirás una copia por email. Puedes cerrar esta ventana.
        </p>
      </div>
    </div>
  )
}

function PortalPending({ data }) {
  const [view, setView] = useState('sign') // 'sign' | 'preview'
  const pdfUrl  = resolvePdfUrl(data.document.pdf_url)
  const signUrl = data.signature.sign_url

  return (
    <div className="portal-body portal-body-wide">
      {/* Info del documento */}
      <div className="portal-doc-info">
        <div className="portal-doc-icon">📄</div>
        <div>
          <div className="portal-doc-name">{data.document.name}</div>
          <div className="portal-doc-signer">
            Para: <strong>{data.signature.signer_name}</strong>
            <span className="portal-signer-email">({data.signature.signer_email})</span>
          </div>
        </div>
        <span className="portal-badge-pending">Pendiente de firma</span>
      </div>

      {/* Tabs */}
      <div className="portal-tabs">
        <button
          className={`portal-tab ${view === 'sign' ? 'active' : ''}`}
          onClick={() => setView('sign')}
        >
          ✍️ Firmar documento
        </button>
        {pdfUrl && (
          <button
            className={`portal-tab ${view === 'preview' ? 'active' : ''}`}
            onClick={() => setView('preview')}
          >
            👁 Vista previa
          </button>
        )}
      </div>

      {/* Contenido */}
      <div className="portal-content">
        {view === 'sign' && signUrl && (
          <div className="portal-sign-wrap">
            <iframe
              src={signUrl}
              className="portal-sign-frame"
              title="Firma tu documento"
              allow="camera"
            />
            <div className="portal-sign-fallback">
              <p>¿El formulario no carga?</p>
              <a href={signUrl} target="_blank" rel="noreferrer" className="portal-btn portal-btn-primary">
                Abrir en pantalla completa ↗
              </a>
            </div>
          </div>
        )}

        {view === 'preview' && pdfUrl && (
          <div className="portal-preview-wrap">
            <iframe
              src={pdfUrl}
              className="portal-preview-frame"
              title="Vista previa del documento"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function PortalNotFound() {
  return (
    <div className="portal-body">
      <div className="portal-error-card">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h2>Firma no encontrada</h2>
        <p>El enlace puede haber expirado o ser inválido.</p>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────

export default function PortalPage() {
  const { signatureId } = useParams()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    api.get(`/api/portal/${signatureId}`)
      .then(res => setData(res.data))
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true)
      })
      .finally(() => setLoading(false))
  }, [signatureId])

  return (
    <div className="portal-root">
      <PortalHeader />

      {loading && (
        <div className="portal-loading">
          <div className="spinner" />
          <span>Cargando documento…</span>
        </div>
      )}

      {!loading && notFound && <PortalNotFound />}

      {!loading && data && (
        data.signature.status === 'signed'
          ? <PortalSigned  data={data} />
          : <PortalPending data={data} />
      )}

      <footer className="portal-footer">
        <p>Powered by MaxiDocs · MAXIRent Renta Empresarial</p>
        <p style={{ marginTop: 4, fontSize: 11 }}>
          maxirentempresas.com.mx
        </p>
      </footer>
    </div>
  )
}
