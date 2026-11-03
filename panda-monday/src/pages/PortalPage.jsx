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

// ── Formato ──────────────────────────────────────────────────────
const fmtMXN = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n) || 0)
const fmtFecha = f => f ? new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const BRAND = { orange: '#CC6227', navy: '#1A394C', green: '#258750', muted: '#5b6b74', line: '#e2e8ec', soft: '#f4f6f7' }

// ── Vista previa del PDF de una propuesta ────────────────────────
function PdfPreview({ nombre, pdfUrl: rawUrl }) {
  const pdfUrl       = resolvePdfUrl(rawUrl)
  const canvasRef    = useRef(null)
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pdfDoc,     setPdfDoc]     = useState(null)
  const renderRef    = useRef(null)

  useEffect(() => {
    if (!pdfUrl) return
    setPdfDoc(null); setPage(1)
    pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise
      .then(doc => { setPdfDoc(doc); setTotalPages(doc.numPages) })
      .catch(() => {})
  }, [pdfUrl])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    pdfDoc.getPage(page).then(p => {
      const vp     = p.getViewport({ scale: 1.2 })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width  = vp.width
      canvas.height = vp.height
      if (renderRef.current) { try { renderRef.current.cancel() } catch {} }
      const task = p.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
      renderRef.current = task
      task.promise.catch(() => {})
    })
  }, [pdfDoc, page])

  if (!pdfUrl) return null
  return (
    <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
      <div style={{ background: '#f6f7fb', borderBottom: '1px solid #e0e2ea', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#323338' }}>Vista previa — {nombre}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {totalPages > 1 && (
            <>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background: '#e0e2ea', border: 'none', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 16 }}>‹</button>
              <span style={{ fontSize: 12, color: '#676879' }}>Pág {page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ background: '#e0e2ea', border: 'none', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 16 }}>›</button>
            </>
          )}
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, fontWeight: 700, color: BRAND.navy, textDecoration: 'none', border: `1px solid ${BRAND.line}`, borderRadius: 6, padding: '4px 10px', background: 'white' }}>
            📥 Descargar PDF
          </a>
        </div>
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
  )
}

// ── Tarjeta de una propuesta ─────────────────────────────────────
function PropuestaCard({ p, viendo, hayAprobada, confirmando, aprobando, onVer, onAprobar, onConfirmar, onCancelar }) {
  const aprobada  = p.seleccion === 'approved'
  const descartada = p.seleccion === 'not_selected'
  const borde = aprobada ? BRAND.green : viendo ? BRAND.orange : BRAND.line
  return (
    <div style={{
      background: 'white', borderRadius: 12, border: `2px solid ${borde}`, padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12, opacity: descartada ? 0.6 : 1,
      boxShadow: viendo ? '0 4px 18px rgba(204,98,39,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: BRAND.orange }}>{p.folio || 'Propuesta'}</span>
        {aprobada  && <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: BRAND.green, borderRadius: 20, padding: '3px 9px' }}>✓ Aprobada</span>}
        {descartada && <span style={{ fontSize: 11, fontWeight: 700, color: BRAND.muted, background: BRAND.soft, borderRadius: 20, padding: '3px 9px' }}>No seleccionada</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.navy, lineHeight: 1.3 }}>{p.nombre}</div>

      <div style={{ fontSize: 13, color: BRAND.muted, display: 'grid', gap: 6 }}>
        <Fila etiqueta="🚚 Unidades" valor={p.unidades.length ? `${p.unidades.join(', ')}${p.unidades_count > 1 ? ` (${p.unidades_count})` : ''}` : '—'} />
        <Fila etiqueta="📅 Plazo" valor={p.plazo || '—'} />
        <Fila etiqueta="💳 Renta mensual" valor={p.renta_mensual ? fmtMXN(p.renta_mensual) : '—'} />
      </div>

      <div style={{ background: BRAND.soft, borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: BRAND.muted }}>Valor de la propuesta (sin IVA)</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.navy }}>{fmtMXN(p.valor_sin_iva)}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        <button onClick={onVer} disabled={viendo}
          style={{ ...btn.secundario, ...(viendo ? { color: BRAND.orange, borderColor: BRAND.orange, cursor: 'default' } : {}) }}>
          {viendo ? '👁 Viendo esta propuesta' : 'Ver propuesta'}
        </button>
        {!hayAprobada && !confirmando && (
          <button onClick={onAprobar} style={btn.primario}>Aprobar esta propuesta</button>
        )}
        {!hayAprobada && confirmando && (
          <div style={{ border: `1px solid ${BRAND.orange}`, borderRadius: 8, padding: 10, background: '#fbeee8' }}>
            <div style={{ fontSize: 12.5, color: BRAND.navy, marginBottom: 8, lineHeight: 1.45 }}>
              ¿Confirmas que apruebas <strong>{p.folio || p.nombre}</strong>?
              {' '}Las demás propuestas quedarán como no seleccionadas.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onConfirmar} disabled={aprobando} style={{ ...btn.primario, flex: 1, opacity: aprobando ? 0.7 : 1 }}>
                {aprobando ? 'Aprobando…' : 'Sí, aprobar'}
              </button>
              <button onClick={onCancelar} disabled={aprobando} style={{ ...btn.secundario, flex: 1 }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Fila({ etiqueta, valor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ whiteSpace: 'nowrap' }}>{etiqueta}</span>
      <span style={{ color: BRAND.navy, fontWeight: 700, textAlign: 'right' }}>{valor}</span>
    </div>
  )
}

// ── Vista principal: comparar propuestas, aprobar una y ver su PDF ──
function DocumentReview({ data, signatureId, onActualizado }) {
  const propuestas = data.propuestas?.length
    ? data.propuestas
    : [{ id: data.document.id, nombre: data.document.name, pdf_url: data.document.pdf_url, unidades: [], seleccion: null }]
  const aprobada   = propuestas.find(p => p.id === data.aprobada_id) ?? null
  const [viendoId,    setViendoId]    = useState(aprobada?.id ?? data.document.id)
  const [confirmarId, setConfirmarId] = useState(null)
  const [aprobando,   setAprobando]   = useState(false)
  const [mensaje,     setMensaje]     = useState(null)
  const viendo = propuestas.find(p => p.id === viendoId) ?? propuestas[0]
  const varias = propuestas.length > 1
  const previewRef = useRef(null)

  function ver(id) {
    setViendoId(id)
    setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function aprobar(id) {
    setAprobando(true); setMensaje(null)
    try {
      const r = await api.post(`/api/signatures/portal/${signatureId}/aprobar`, { document_id: id })
      onActualizado({ propuestas: r.data.propuestas, aprobada_id: r.data.aprobada_id })
      setViendoId(id)
    } catch (e) {
      setMensaje(e.response?.data?.error || 'No pudimos registrar tu aprobación. Intenta de nuevo en un momento.')
      if (e.response?.data?.code === 'YA_APROBADA') {
        api.get(`/api/signatures/portal/${signatureId}`).then(r => onActualizado(r.data)).catch(() => {})
      }
    } finally {
      setAprobando(false); setConfirmarId(null)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 1040, margin: '28px auto', padding: '0 16px 16px', boxSizing: 'border-box' }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '24px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.orange, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
          {aprobada ? 'Propuesta aprobada' : varias ? 'Tus propuestas' : 'Tu propuesta'}
        </div>
        <h2 style={{ margin: '0 0 6px', color: BRAND.navy, fontSize: 21 }}>Hola, {String(data.signature.signer_name || '').split(' ')[0] || 'bienvenido'} 👋</h2>
        <p style={{ color: BRAND.muted, fontSize: 14, margin: 0, lineHeight: 1.55 }}>
          {aprobada
            ? <>Aprobaste la propuesta <strong>{aprobada.folio || aprobada.nombre}</strong>{aprobada.seleccionada_en ? ` el ${fmtFecha(aprobada.seleccionada_en)}` : ''}. Tu ejecutivo ya recibió tu elección y te contactará para los siguientes pasos.</>
            : varias
              ? <>Preparamos <strong>{propuestas.length} propuestas</strong> para tu empresa. Compáralas y aprueba la que más te convenga.</>
              : <>Revisa tu propuesta y apruébala si estás de acuerdo.</>}
        </p>
        {mensaje && (
          <div style={{ marginTop: 14, background: '#fdecec', color: '#a8322d', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{mensaje}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 12 }}>
        {/* Con una aprobada, esa va primero: en el celular es lo que el cliente busca */}
        {[...propuestas].sort((a, b) => (b.seleccion === 'approved') - (a.seleccion === 'approved')).map(p => (
          <PropuestaCard key={p.id} p={p}
            viendo={p.id === viendo.id}
            hayAprobada={!!aprobada}
            confirmando={confirmarId === p.id}
            aprobando={aprobando}
            onVer={() => ver(p.id)}
            onAprobar={() => { setMensaje(null); setConfirmarId(p.id) }}
            onConfirmar={() => aprobar(p.id)}
            onCancelar={() => setConfirmarId(null)}
          />
        ))}
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: '#8a97a0', margin: '0 0 22px' }}>
        {aprobada
          ? '¿Necesitas cambiar algo? Contacta a tu ejecutivo.'
          : '🛡️ Revisar las propuestas no implica compromiso. Al aprobar una, tu ejecutivo recibe tu elección.'}
      </p>

      <div ref={previewRef}>
        <PdfPreview nombre={viendo.folio ? `${viendo.folio} · ${viendo.nombre}` : viendo.nombre} pdfUrl={viendo.pdf_url} />
      </div>

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
      <DocumentReview data={data} signatureId={signatureId} onActualizado={upd => setData(d => ({ ...d, ...upd }))} />
    </div>
  )
}

// ── Estilos compartidos ──────────────────────────────────────────
const btn = {
  primario:   { background: '#CC6227', color: 'white', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' },
  secundario: { background: 'white', color: '#1A394C', border: '1px solid #c7d0d6', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
}

const pv = {
  spinner: { width: 28, height: 28, borderRadius: '50%', border: '3px solid #e0e2ea', borderTopColor: '#0073ea', animation: 'spin 0.8s linear infinite', flexShrink: 0 },
}
