import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/client.js'

function resolvePdfUrl(url) {
  if (!url) return null
  if (url.startsWith('http://localhost:3001')) return url.replace('http://localhost:3001', '')
  return url
}

// ── Header ────────────────────────────────────────────────────
function PortalHeader() {
  return (
    <header className="portal-header">
      <div className="portal-logo">
        <div className="portal-logo-icon">M</div>
        <span className="portal-logo-text">Maxi<span>Docs</span></span>
      </div>
      <span className="portal-logo-sub">Firma Electrónica · MAXIRent Renta Empresarial</span>
    </header>
  )
}

// ── Ya firmado ─────────────────────────────────────────────────
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
          Puedes cerrar esta ventana.
        </p>
      </div>
    </div>
  )
}

// ── Canvas de firma ────────────────────────────────────────────
function SignatureCanvas({ onSigned }) {
  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  function startDraw(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
    isDrawing.current = true
  }

  function draw(e) {
    if (!isDrawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1B3055'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.stroke()
    setHasSignature(true)
  }

  function endDraw() { isDrawing.current = false }

  function clear() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  function confirm() {
    const canvas = canvasRef.current
    onSigned(canvas.toDataURL('image/png'))
  }

  return (
    <div className="portal-sig-wrap">
      <div className="portal-sig-label">
        Dibuja tu firma dentro del recuadro:
      </div>
      <div className="portal-sig-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="portal-sig-canvas"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasSignature && (
          <div className="portal-sig-placeholder">Firma aquí</div>
        )}
      </div>
      <div className="portal-sig-actions">
        <button type="button" className="portal-btn-outline" onClick={clear}>
          Limpiar
        </button>
        <button
          type="button"
          className="portal-btn portal-btn-primary"
          onClick={confirm}
          disabled={!hasSignature}
        >
          ✍️ Confirmar firma
        </button>
      </div>
    </div>
  )
}

// ── Vista principal de firma ────────────────────────────────────
function PortalSign({ data, onSigned }) {
  const [activeTab, setActiveTab] = useState('sign') // 'sign' | 'preview'
  const [signing, setSigning]    = useState(false)
  const [error, setError]        = useState(null)
  const pdfUrl = resolvePdfUrl(data.document.pdf_url)

  async function handleSigned(signatureDataUrl) {
    setSigning(true)
    setError(null)
    try {
      const signerIp = await fetch('https://api.ipify.org?format=json')
        .then(r => r.json()).then(d => d.ip).catch(() => '')

      await api.post(`/api/signatures/${data.signature.id}/sign`, {
        signatureDataUrl,
        signerIp,
      })
      onSigned()
    } catch (e) {
      setError(e.response?.data?.error || 'Error al registrar la firma')
      setSigning(false)
    }
  }

  return (
    <div className="portal-body">
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Info del documento */}
        <div className="portal-doc-info" style={{ marginBottom: 20 }}>
          <div className="portal-doc-chip">
            <span className="portal-doc-chip-label">Propuesta para</span>
            <span className="portal-doc-chip-name">{data.signature.signer_name}</span>
          </div>
          <span className="portal-badge-pending">Pendiente de firma</span>
        </div>

        {/* Tabs */}
        <div className="portal-tabs">
          <button className={`portal-tab ${activeTab==='sign' ? 'active' : ''}`}
            onClick={() => setActiveTab('sign')}>✍️ Firmar</button>
          <button className={`portal-tab ${activeTab==='preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}>📄 Ver documento</button>
        </div>

        <div className="portal-content">
          {activeTab === 'sign' ? (
            <div className="portal-sign-wrap" style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: '#555', marginBottom: 20, lineHeight: 1.6 }}>
                Al firmar, aceptas los términos y condiciones de la propuesta comercial de
                <strong> MAXIRent Renta Empresarial</strong>. Tu firma tiene validez legal
                conforme al CCOM de México.
              </p>

              {error && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', color: '#dc2626', marginBottom: 16, fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}

              {signing ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                  <p>Registrando firma y generando PDF firmado…</p>
                </div>
              ) : (
                <SignatureCanvas onSigned={handleSigned} />
              )}
            </div>
          ) : (
            <div className="portal-preview-wrap">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="portal-preview-frame"
                  title="Vista previa del documento"
                />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
                  PDF no disponible
                </div>
              )}
            </div>
          )}
        </div>

        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16 }}>
          Firma segura generada por MaxiDocs · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────
export default function PortalPage() {
  const { signatureId } = useParams()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [signed, setSigned]   = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    api.get(`/api/portal/${signatureId}`)
      .then(res => {
        setData(res.data)
        if (res.data.signature.status === 'signed') setSigned(true)
      })
      .catch(() => setError('No se encontró el enlace de firma'))
      .finally(() => setLoading(false))
  }, [signatureId])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader />
      <div className="portal-body">
        <div className="portal-error-card">
          <h2>Enlace no válido</h2>
          <p>Este enlace de firma no existe o ha expirado.</p>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f6f7fb' }}>
      <PortalHeader />
      {(signed || data?.signature?.status === 'signed')
        ? <PortalSigned data={data} />
        : <PortalSign data={data} onSigned={() => setSigned(true)} />
      }
      <div className="portal-footer">
        Firma Electrónica · MaxiDocs · Válido en México (CCOM Art. 89-90)
      </div>
    </div>
  )
}
