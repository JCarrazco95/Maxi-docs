import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import api from '../api/client.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

// ── Utilidades ───────────────────────────────────────────────────
function resolvePdfUrl(url) {
  if (!url) return null
  if (url.startsWith('http://localhost')) {
    try { return new URL(url).pathname } catch { return url }
  }
  if (url.includes('railway.app')) {
    try { return new URL(url).pathname } catch { return url }
  }
  return url
}

// Tracking de tiempo de lectura
function useTimeTracking(signatureId, active) {
  const startRef = useRef(null)
  useEffect(() => {
    if (!active || !signatureId) return
    startRef.current = Date.now()
    const flush = () => {
      if (!startRef.current) return
      const secs = Math.round((Date.now() - startRef.current) / 1000)
      if (secs > 2) api.post(`/api/signatures/${signatureId}/time-spent`, { seconds: secs }).catch(() => {})
      startRef.current = null
    }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
      else startRef.current = Date.now()
    })
    return () => { flush(); window.removeEventListener('beforeunload', flush) }
  }, [signatureId, active])
}

// ── Vista principal: preview del documento + descarga ────────────
function DocumentReview({ data }) {
  const pdfUrl       = resolvePdfUrl(data.document.pdf_url)
  const canvasRef    = useRef(null)
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pdfDoc,     setPdfDoc]     = useState(null)
  const renderRef    = useRef(null)

  useEffect(() => {
    if (!pdfUrl) return
    pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise
      .then(doc => { setPdfDoc(doc); setTotalPages(doc.numPages) })
      .catch(() => {})
  }, [pdfUrl])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    pdfDoc.getPage(page).then(p => {
      const vp     = p.getViewport({ scale: 1.2 })
      const canvas = canvasRef.current
      canvas.width  = vp.width
      canvas.height = vp.height
      if (renderRef.current) { try { renderRef.current.cancel() } catch {} }
      const task = p.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
      renderRef.current = task
      task.promise.catch(() => {})
    })
  }, [pdfDoc, page])

  return (
    <div style={{ maxWidth: 700, margin: '32px auto', padding: 16 }}>
      {/* Tarjeta principal */}
      <div style={{ background: 'white', borderRadius: 16, padding: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
        <h2 style={{ margin: '0 0 6px', color: '#323338', fontSize: 20 }}>{data.document.name}</h2>
        <p style={{ color: '#676879', fontSize: 14, margin: '0 0 20px' }}>
          Propuesta comercial para <strong>{data.signature.signer_name}</strong>
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0073ea', color: 'white', borderRadius: 8, padding: '9px 20px', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
              📥 Descargar PDF
            </a>
          )}
        </div>
      </div>

      {/* Preview del PDF */}
      {pdfUrl && (
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ background: '#f6f7fb', borderBottom: '1px solid #e0e2ea', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#323338' }}>
              Vista previa — {data.document.name}
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ background: '#e0e2ea', border: 'none', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 16 }}>‹</button>
                <span style={{ fontSize: 12, color: '#676879' }}>Pág {page}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ background: '#e0e2ea', border: 'none', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 16 }}>›</button>
              </div>
            )}
          </div>
          <div style={{ background: '#525659', padding: 20, display: 'flex', justifyContent: 'center', minHeight: 300 }}>
            {pdfDoc
              ? <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', maxWidth: '100%' }} />
              : <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9699a6', fontSize: 14 }}>
                  <div style={pv.spinner} /> Cargando documento…
                </div>
            }
          </div>
        </div>
      )}

      <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 16 }}>
        MaxiDocs · MAXIRent Renta Empresarial
      </p>
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────
function PortalHeader() {
  return (
    <header style={{ background: '#1B3055', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#0073ea,#0060c0)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: 18 }}>M</div>
      <span style={{ color: 'white', fontWeight: 700, fontSize: 18 }}>Maxi<span style={{ color: '#60a5fa' }}>Docs</span></span>
      <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 4 }}>· Documentos</span>
    </header>
  )
}

// ── Componente principal ─────────────────────────────────────────
export default function PortalPage() {
  const { signatureId } = useParams()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    api.get(`/api/signatures/portal/${signatureId}`)
      .then(res => setData(res.data))
      .catch(() => setError('No se encontró el enlace o ya expiró.'))
      .finally(() => setLoading(false))
  }, [signatureId])

  useTimeTracking(signatureId, !loading && !!data)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f7fb' }}>
      <div style={pv.spinner} />
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#f6f7fb' }}>
      <div style={{ fontSize: 48 }}>🔗</div>
      <h2 style={{ margin: 0, color: '#323338' }}>Enlace no válido</h2>
      <p style={{ margin: 0, color: '#676879', fontSize: 14 }}>{error}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader />
      <DocumentReview data={data} />
    </div>
  )
}

// ── Estilos compartidos ──────────────────────────────────────────
const pv = {
  spinner: { width: 28, height: 28, borderRadius: '50%', border: '3px solid #e0e2ea', borderTopColor: '#0073ea', animation: 'spin 0.8s linear infinite', flexShrink: 0 },
}
