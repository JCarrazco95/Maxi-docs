import { useState, useEffect, useRef, useCallback } from 'react'
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

function parseFieldConfig(raw) {
  if (!raw) return null
  try {
    if (typeof raw === 'string' && raw.startsWith('[')) return JSON.parse(raw)
    if (Array.isArray(raw)) return raw
  } catch {}
  return null
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

const SIGN_FONTS = [
  { label: 'Cursiva',    style: "italic 44px 'Georgia', serif" },
  { label: 'Manuscrita', style: "italic 40px 'Palatino Linotype', serif" },
  { label: 'Script',     style: "38px 'Courier New', monospace" },
]

// ── Captura de firma: dibujar ────────────────────────────────────
function SignatureDraw({ onConfirm, onCancel }) {
  const canvasRef  = useRef(null)
  const isDrawing  = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    if (e.touches) return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  function startDraw(e) {
    e.preventDefault()
    const { x, y } = getPos(e, canvasRef.current)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath(); ctx.moveTo(x, y)
    isDrawing.current = true
  }
  function draw(e) {
    if (!isDrawing.current) return
    e.preventDefault()
    const { x, y } = getPos(e, canvasRef.current)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y); ctx.strokeStyle = '#1B3055'; ctx.lineWidth = 2.5
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
    setHasSig(true)
  }
  function endDraw() { isDrawing.current = false }
  function clear() {
    canvasRef.current.getContext('2d').clearRect(0, 0, 600, 180)
    setHasSig(false)
  }

  return (
    <div style={cap.wrap}>
      <div style={cap.hint}>Dibuja tu firma:</div>
      <div style={cap.canvasWrap}>
        <canvas ref={canvasRef} width={600} height={180} style={cap.canvas}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
        {!hasSig && <div style={cap.placeholder}>Firma aquí</div>}
      </div>
      <div style={cap.actions}>
        <button style={cap.btnOutline} onClick={clear}>Limpiar</button>
        {onCancel && <button style={cap.btnOutline} onClick={onCancel}>Cancelar</button>}
        <button style={{ ...cap.btnPrimary, opacity: hasSig ? 1 : 0.5 }} disabled={!hasSig}
          onClick={() => onConfirm(canvasRef.current.toDataURL('image/png'))}>
          ✍️ Usar esta firma
        </button>
      </div>
    </div>
  )
}

// ── Captura de firma: tipada ─────────────────────────────────────
function SignatureTyped({ signerName, onConfirm, onCancel }) {
  const canvasRef = useRef(null)
  const [text, setText] = useState(signerName || '')
  const [fontIdx, setFontIdx] = useState(0)

  const renderCanvas = useCallback((t, fi) => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 600, 180)
    ctx.font = SIGN_FONTS[fi].style; ctx.fillStyle = '#1B3055'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(t, 300, 90)
  }, [])

  useEffect(() => { renderCanvas(text, fontIdx) }, [text, fontIdx, renderCanvas])

  return (
    <div style={cap.wrap}>
      <div style={cap.hint}>Escribe tu nombre:</div>
      <input value={text} onChange={e => setText(e.target.value)} maxLength={80}
        placeholder="Tu nombre completo" style={cap.textInput} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {SIGN_FONTS.map((f, i) => (
          <button key={i} onClick={() => setFontIdx(i)} style={{
            ...cap.fontBtn,
            background: fontIdx === i ? '#1B3055' : 'white',
            color: fontIdx === i ? 'white' : '#323338',
            border: fontIdx === i ? '2px solid #1B3055' : '1px solid #e0e2ea',
          }}>{f.label}</button>
        ))}
      </div>
      <div style={cap.canvasWrap}>
        <canvas ref={canvasRef} width={600} height={180} style={cap.canvas} />
        {!text && <div style={cap.placeholder}>Tu firma aparecerá aquí</div>}
      </div>
      <div style={cap.actions}>
        {onCancel && <button style={cap.btnOutline} onClick={onCancel}>Cancelar</button>}
        <button style={{ ...cap.btnPrimary, opacity: text.trim() ? 1 : 0.5 }} disabled={!text.trim()}
          onClick={() => onConfirm(canvasRef.current.toDataURL('image/png'))}>
          ✍️ Usar esta firma
        </button>
      </div>
    </div>
  )
}

// ── Captura de firma: imagen ─────────────────────────────────────
function SignatureUpload({ onConfirm, onCancel }) {
  const [preview, setPreview] = useState(null)
  function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target.result)
    reader.readAsDataURL(file)
  }
  return (
    <div style={cap.wrap}>
      <div style={cap.hint}>Sube una imagen de tu firma (PNG, JPG):</div>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} style={{ marginBottom: 12 }} />
      {preview
        ? <>
            <div style={{ ...cap.canvasWrap, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={preview} alt="firma" style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain' }} />
            </div>
            <div style={cap.actions}>
              <button style={cap.btnOutline} onClick={() => setPreview(null)}>Cambiar</button>
              {onCancel && <button style={cap.btnOutline} onClick={onCancel}>Cancelar</button>}
              <button style={cap.btnPrimary} onClick={() => onConfirm(preview)}>✍️ Usar esta firma</button>
            </div>
          </>
        : <div style={{ ...cap.canvasWrap, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
            Selecciona un archivo
          </div>
      }
    </div>
  )
}

// ── Modal de captura de firma ────────────────────────────────────
function SignCaptureModal({ signerName, onConfirm, onCancel }) {
  const [mode, setMode] = useState('draw')
  const modes = [
    { key: 'draw',   label: '✍️ Dibujar' },
    { key: 'type',   label: '⌨️ Escribir' },
    { key: 'upload', label: '🖼️ Imagen' },
  ]
  return (
    <div style={modal.overlay}>
      <div style={modal.box}>
        <div style={modal.header}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#323338' }}>Capturar firma</span>
          <button onClick={onCancel} style={modal.closeBtn}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '12px 20px 0', borderBottom: '1px solid #e0e2ea', paddingBottom: 12 }}>
          {modes.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: mode === m.key ? '2px solid #1B3055' : '1px solid #e0e2ea',
              background: mode === m.key ? '#1B3055' : 'white',
              color: mode === m.key ? 'white' : '#676879',
              fontWeight: mode === m.key ? 600 : 400,
            }}>{m.label}</button>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          {mode === 'draw'   && <SignatureDraw   onConfirm={onConfirm} onCancel={onCancel} />}
          {mode === 'type'   && <SignatureTyped  onConfirm={onConfirm} onCancel={onCancel} signerName={signerName} />}
          {mode === 'upload' && <SignatureUpload onConfirm={onConfirm} onCancel={onCancel} />}
        </div>
      </div>
    </div>
  )
}

// ── Vista principal: PDF + campos posicionados ───────────────────
function PdfSignerView({ data, onSigned }) {
  const pdfUrl    = resolvePdfUrl(data.document.pdf_url)
  const rawFields = parseFieldConfig(data.signature.opensign_document_id)
  const fields    = rawFields || []

  const canvasRef  = useRef(null)
  const overlayRef = useRef(null)
  const renderRef  = useRef(null)

  const [pdfDoc,      setPdfDoc]      = useState(null)
  const [totalPages,  setTotalPages]  = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pdfLoading,  setPdfLoading]  = useState(true)
  const [pdfError,    setPdfError]    = useState(null)

  // Firma capturada (una para todos los campos de firma)
  const [capturedSig, setCapturedSig] = useState(null)
  // Campo activo para captura
  const [capturingField, setCapturingField] = useState(null) // null | 'signature'
  // Estado visual de campos completados
  const [fieldsDone, setFieldsDone] = useState({}) // index → true
  // Error/estado de envío
  const [signing,  setSigning]  = useState(false)
  const [error,    setError]    = useState(null)

  // Determinar si hay campos de firma configurados
  const hasFields = fields.length > 0
  const sigFields = fields.filter(f => f.type === 'signature' || f.type === 'initials')
  const allSigDone = sigFields.length === 0 || capturedSig !== null

  // ── Cargar PDF ──────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfUrl) { setPdfError('PDF no disponible'); setPdfLoading(false); return }
    pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise
      .then(doc => { setPdfDoc(doc); setTotalPages(doc.numPages); setPdfLoading(false) })
      .catch(err => { setPdfError(`Error al cargar PDF: ${err.message}`); setPdfLoading(false) })
  }, [pdfUrl])

  // ── Renderizar página ───────────────────────────────────────────
  const renderPage = useCallback(async (doc, pageNum) => {
    if (!canvasRef.current) return
    const page     = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas   = canvasRef.current
    canvas.width   = viewport.width
    canvas.height  = viewport.height
    if (renderRef.current) { try { renderRef.current.cancel() } catch {} }
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
    renderRef.current = task
    await task.promise.catch(() => {})
  }, [])

  useEffect(() => { if (pdfDoc) renderPage(pdfDoc, currentPage) }, [pdfDoc, currentPage, renderPage])

  // ── Cuando el firmante captura su firma ─────────────────────────
  function handleCaptured(dataUrl) {
    setCapturedSig(dataUrl)
    // Marcar todos los campos de firma como completados
    const done = { ...fieldsDone }
    fields.forEach((f, i) => { if (f.type === 'signature' || f.type === 'initials') done[i] = true })
    setFieldsDone(done)
    setCapturingField(null)
  }

  // ── Enviar firma al backend ─────────────────────────────────────
  async function handleSubmit() {
    if (!capturedSig && sigFields.length > 0) {
      setError('Debes firmar antes de continuar')
      return
    }
    setSigning(true); setError(null)
    try {
      const signerIp = await fetch('https://api.ipify.org?format=json')
        .then(r => r.json()).then(d => d.ip).catch(() => '')
      const res = await api.post(`/api/signatures/${data.signature.id}/sign`, {
        signatureDataUrl: capturedSig,
        signerIp,
      })
      // Pasar el pdf_url actualizado (con la firma recién embedded)
      onSigned(res.data?.pdf_url ?? null)
    } catch (e) {
      const code = e.response?.data?.code
      setError(code === 'WAITING_FOR_PREVIOUS_SIGNER'
        ? 'Debes esperar a que el firmante anterior complete su firma.'
        : e.response?.data?.error || 'Error al registrar la firma')
      setSigning(false)
    }
  }

  const pageFields = fields.filter(f => f.page === currentPage)

  // ── Sin campos configurados: UI legada simplificada ─────────────
  if (!hasFields) {
    return <LegacySignView data={data} onSigned={onSigned} />
  }

  // ── Vista principal con PDF + campos ────────────────────────────
  return (
    <div style={pv.root}>
      {/* Info del documento */}
      <div style={pv.docBar}>
        <div style={pv.docName}>{data.document.name}</div>
        <div style={pv.signerBadge}>Para: <strong>{data.signature.signer_name}</strong></div>
        {totalPages > 1 && (
          <div style={pv.pageNav}>
            <button style={pv.navBtn} disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
            <span style={{ fontSize: 13, color: '#676879' }}>Pág {currentPage}/{totalPages}</span>
            <button style={pv.navBtn} disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>

      {/* Instrucción */}
      {!capturedSig && (
        <div style={pv.instruction}>
          ✍️ <strong>Haz clic en el campo de firma</strong> para capturar tu firma
        </div>
      )}
      {capturedSig && !signing && (
        <div style={{ ...pv.instruction, background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }}>
          ✅ Firma capturada. Verifica tu firma en el documento y confirma.
        </div>
      )}

      {error && (
        <div style={pv.errorBar}>⚠️ {error}</div>
      )}

      {/* PDF + Overlay */}
      <div style={pv.canvasArea}>
        {pdfLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60 }}>
            <div style={pv.spinner} />
            <span style={{ color: '#94a3b8', fontSize: 14 }}>Cargando documento…</span>
          </div>
        )}
        {pdfError && <div style={pv.errBox}>⚠️ {pdfError}</div>}

        {!pdfLoading && !pdfError && (
          <div style={{ position: 'relative', display: 'inline-block', userSelect: 'none' }}>
            <canvas ref={canvasRef} style={pv.pdfCanvas} />

            {/* Campos sobre el PDF */}
            <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {pageFields.map((f, localIdx) => {
                const globalIdx = fields.findIndex(
                  gf => gf.type === f.type && gf.x === f.x && gf.y === f.y && gf.page === f.page
                )
                const isDone = fieldsDone[globalIdx]
                const isSigType = f.type === 'signature' || f.type === 'initials'
                const autoLabel = f.type === 'date'
                  ? new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
                  : f.type === 'text' ? data.signature.signer_name : null

                return (
                  <div key={localIdx}
                    onClick={() => { if (isSigType && !signing) setCapturingField('signature') }}
                    style={{
                      position:  'absolute',
                      left:  `${f.x}%`, top: `${f.y}%`,
                      width: `${f.w}%`, height: `${f.h}%`,
                      boxSizing: 'border-box',
                      pointerEvents: isSigType ? 'all' : 'none',
                      cursor:    isSigType ? 'pointer' : 'default',
                      borderRadius: 4,
                      border: isDone
                        ? '2px solid #00c875'
                        : isSigType
                          ? '2px dashed #0073ea'
                          : '1px dashed #94a3b8',
                      background: isDone
                        ? 'rgba(0,200,117,0.08)'
                        : isSigType
                          ? 'rgba(0,115,234,0.08)'
                          : 'rgba(148,163,184,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                      animation: !isDone && isSigType ? 'pulse-border 2s ease-in-out infinite' : 'none',
                    }}>

                    {/* Firma capturada: mostrar preview */}
                    {isDone && capturedSig && isSigType && (
                      <img src={capturedSig} alt="firma"
                        style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '2px' }} />
                    )}

                    {/* Auto-completados: fecha / texto */}
                    {!isSigType && autoLabel && (
                      <span style={{ fontSize: '0.55em', color: '#475569', fontWeight: 500, textAlign: 'center', padding: '0 4px' }}>
                        {autoLabel}
                      </span>
                    )}

                    {/* Campo vacío de firma: instrucción */}
                    {!isDone && isSigType && (
                      <span style={{ fontSize: '0.55em', fontWeight: 700, color: '#0073ea', textAlign: 'center', lineHeight: 1.3, padding: '0 4px' }}>
                        {f.type === 'initials' ? 'Iniciales' : 'Clic para firmar'}
                      </span>
                    )}

                    {/* Check cuando está listo */}
                    {isDone && (
                      <div style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%', background: '#00c875', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'white', fontSize: 10, fontWeight: 800 }}>✓</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer de acción */}
      <div style={pv.footer}>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', flex: 1 }}>
          Firma válida conforme al CCOM de México · MAXIRent Renta Empresarial
        </p>
        {signing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#676879', fontSize: 14 }}>
            <div style={pv.spinner} /> Registrando firma…
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!allSigDone}
            style={{
              ...pv.submitBtn,
              opacity: allSigDone ? 1 : 0.45,
              cursor:  allSigDone ? 'pointer' : 'not-allowed',
            }}>
            ✅ Confirmar y firmar
          </button>
        )}
      </div>

      {/* Modal de captura */}
      {capturingField && (
        <SignCaptureModal
          signerName={data.signature.signer_name}
          onConfirm={handleCaptured}
          onCancel={() => setCapturingField(null)}
        />
      )}

      <style>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,115,234,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(0,115,234,0); }
        }
      `}</style>
    </div>
  )
}

// ── Vista legada: sin campos configurados ────────────────────────
function LegacySignView({ data, onSigned }) {
  const [mode,    setMode]    = useState('draw')
  const [signing, setSigning] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSigned(dataUrl) {
    setSigning(true); setError(null)
    try {
      const signerIp = await fetch('https://api.ipify.org?format=json')
        .then(r => r.json()).then(d => d.ip).catch(() => '')
      const res = await api.post(`/api/signatures/${data.signature.id}/sign`, { signatureDataUrl: dataUrl, signerIp })
      onSigned(res.data?.pdf_url ?? null)
    } catch (e) {
      const code = e.response?.data?.code
      setError(code === 'WAITING_FOR_PREVIOUS_SIGNER'
        ? 'Debes esperar a que el firmante anterior complete su firma.'
        : e.response?.data?.error || 'Error al registrar la firma')
      setSigning(false)
    }
  }

  const modes = [{ key: 'draw', label: '✍️ Dibujar' }, { key: 'type', label: '⌨️ Escribir' }, { key: 'upload', label: '🖼️ Imagen' }]

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#323338', marginBottom: 4 }}>{data.document.name}</div>
          <div style={{ fontSize: 13, color: '#676879' }}>Para: {data.signature.signer_name}</div>
        </div>
        {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', color: '#dc2626', marginBottom: 16, fontSize: 13 }}>⚠️ {error}</div>}
        {signing
          ? <div style={{ textAlign: 'center', padding: 40, color: '#676879' }}>⏳ Registrando firma…</div>
          : <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {modes.map(m => (
                  <button key={m.key} onClick={() => setMode(m.key)} style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                    border: mode === m.key ? '2px solid #1B3055' : '1px solid #e0e2ea',
                    background: mode === m.key ? '#1B3055' : 'white',
                    color: mode === m.key ? 'white' : '#676879',
                    fontWeight: mode === m.key ? 600 : 400,
                  }}>{m.label}</button>
                ))}
              </div>
              {mode === 'draw'   && <SignatureDraw   onConfirm={handleSigned} />}
              {mode === 'type'   && <SignatureTyped  onConfirm={handleSigned} signerName={data.signature.signer_name} />}
              {mode === 'upload' && <SignatureUpload onConfirm={handleSigned} />}
            </>
        }
      </div>
    </div>
  )
}

// ── Pantalla: documento ya firmado (con preview del PDF) ────────
function PortalSigned({ data }) {
  const pdfUrl       = resolvePdfUrl(data.document.pdf_url)
  const canvasRef    = useRef(null)
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pdfDoc,     setPdfDoc]     = useState(null)
  const renderRef    = useRef(null)

  useEffect(() => {
    if (!pdfUrl) return
    // Pequeño delay para que el backend termine de escribir el archivo
    const t = setTimeout(() => {
      pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise
        .then(doc => { setPdfDoc(doc); setTotalPages(doc.numPages) })
        .catch(() => {})
    }, 800)
    return () => clearTimeout(t)
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
      {/* Tarjeta de confirmación */}
      <div style={{ background: 'white', borderRadius: 16, padding: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
        <h2 style={{ margin: '0 0 6px', color: '#323338', fontSize: 20 }}>¡Documento firmado!</h2>
        <p style={{ color: '#676879', fontSize: 14, margin: '0 0 20px' }}>
          <strong>{data.signature.signer_name}</strong> — tu firma fue registrada correctamente.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0073ea', color: 'white', borderRadius: 8, padding: '9px 20px', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
              📥 Descargar PDF firmado
            </a>
          )}
        </div>
      </div>

      {/* Preview del PDF firmado */}
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
                  <div style={pv.spinner} /> Cargando documento firmado…
                </div>
            }
          </div>
        </div>
      )}

      <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 16 }}>
        Firma válida conforme al CCOM de México · MaxiDocs · MAXIRent
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
      <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 4 }}>· Firma Electrónica</span>
    </header>
  )
}

// ── Componente principal ─────────────────────────────────────────
export default function PortalPage() {
  const { signatureId } = useParams()
  const [data,         setData]        = useState(null)
  const [loading,      setLoading]     = useState(true)
  const [signed,       setSigned]      = useState(false)
  const [error,        setError]       = useState(null)
  // URL del PDF actualizada después de firmar (incluye la firma recién añadida)
  const [signedPdfUrl, setSignedPdfUrl] = useState(null)

  useEffect(() => {
    api.get(`/api/signatures/portal/${signatureId}`)
      .then(res => {
        setData(res.data)
        if (res.data.signature.status === 'signed') setSigned(true)
      })
      .catch(() => setError('No se encontró el enlace o ya expiró.'))
      .finally(() => setLoading(false))
  }, [signatureId])

  useTimeTracking(signatureId, !loading && !signed && !!data)

  // Callback cuando el firmante termina — recibe la URL del PDF con la firma embedded
  function handleSigned(newPdfUrl) {
    if (newPdfUrl) setSignedPdfUrl(newPdfUrl)
    setSigned(true)
  }

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

  // Construir datos con el pdf_url actualizado después de firmar
  const dataWithUpdatedPdf = signedPdfUrl && data
    ? { ...data, document: { ...data.document, pdf_url: signedPdfUrl } }
    : data

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader />
      {signed || data?.signature?.status === 'signed'
        ? <PortalSigned data={dataWithUpdatedPdf} />
        : <PdfSignerView data={data} onSigned={handleSigned} />
      }
    </div>
  )
}

// ── Estilos compartidos ──────────────────────────────────────────
const cap = {
  wrap:      { display: 'flex', flexDirection: 'column' },
  hint:      { fontSize: 13, color: '#676879', marginBottom: 10, fontWeight: 500 },
  canvasWrap:{ position: 'relative', border: '1.5px solid #e0e2ea', borderRadius: 8, overflow: 'hidden', background: 'white' },
  canvas:    { display: 'block', width: '100%', height: 160, touchAction: 'none' },
  placeholder:{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9ccd4', fontSize: 16, pointerEvents: 'none' },
  actions:   { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  btnPrimary:{ background: '#1B3055', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnOutline:{ background: 'white', color: '#676879', border: '1px solid #e0e2ea', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' },
  textInput: { width: '100%', padding: '8px 12px', border: '1.5px solid #e0e2ea', borderRadius: 8, fontSize: 15, marginBottom: 10, boxSizing: 'border-box' },
  fontBtn:   { padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
}

const modal = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box:     { background: 'white', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' },
  header:  { padding: '16px 20px', borderBottom: '1px solid #f0f1f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  closeBtn:{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9699a6', lineHeight: 1, padding: 4 },
}

const pv = {
  root:      { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
  docBar:    { background: 'white', borderBottom: '1px solid #e0e2ea', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  docName:   { fontWeight: 700, fontSize: 15, color: '#323338', flex: 1 },
  signerBadge:{ fontSize: 13, color: '#676879', whiteSpace: 'nowrap' },
  pageNav:   { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn:    { background: '#f0f1f5', border: 'none', borderRadius: 6, padding: '3px 12px', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: '#323338' },
  instruction:{ margin: '12px 16px 0', padding: '10px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1d4ed8' },
  errorBar:  { margin: '8px 16px 0', padding: '10px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#dc2626' },
  canvasArea:{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '24px 16px', background: '#e5e7eb' },
  pdfCanvas: { display: 'block', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' },
  footer:    { background: 'white', borderTop: '1px solid #e0e2ea', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 },
  submitBtn: { background: '#00c875', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700 },
  spinner:   { width: 28, height: 28, borderRadius: '50%', border: '3px solid #e0e2ea', borderTopColor: '#0073ea', animation: 'spin 0.8s linear infinite', flexShrink: 0 },
  errBox:    { background: 'white', borderRadius: 10, padding: '32px 24px', color: '#e2445c', fontWeight: 600, fontSize: 15 },
}
