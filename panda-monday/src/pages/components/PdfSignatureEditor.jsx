/**
 * PdfSignatureEditor — Editor de campos de firma sobre PDF
 * Usa PDF.js para renderizar y dnd-kit para drag & drop de campos.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { restrictToParentElement } from '@dnd-kit/modifiers'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

// ── Colores y tipos de campo ──────────────────────────────────
const SIGNER_COLORS = ['#0073ea', '#ff5ac4', '#fdab3d', '#00c875', '#e2445c', '#784bd1']

const FIELD_TYPES = [
  { type: 'signature', label: 'Firma',     icon: '✍️', w: 22, h: 8  },
  { type: 'initials',  label: 'Iniciales', icon: '✦',  w: 10, h: 6  },
  { type: 'date',      label: 'Fecha',     icon: '📅', w: 15, h: 5  },
  { type: 'text',      label: 'Texto',     icon: 'T',  w: 20, h: 5  },
]

let _counter = 0

function resolvePdfUrl(url) {
  if (!url) return null
  // localhost → ruta relativa (dev con proxy Vite)
  if (url.startsWith('http://localhost')) {
    try { return new URL(url).pathname + new URL(url).search } catch { return url }
  }
  // URL de Railway → ruta relativa (pasa por proxy Vercel)
  if (url.includes('railway.app')) {
    try { return new URL(url).pathname } catch { return url }
  }
  return url
}

// ── Botón del sidebar que se puede arrastrar al PDF ───────────
function DraggableFieldTypeBtn({ ft, signerIdx }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   `new-field-${ft.type}`,
    data: { fromToolbar: true, fieldType: ft.type, signerIndex: signerIdx },
  })
  return (
    <button
      ref={setNodeRef}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '10px 6px', borderRadius: 8, border: `1px solid ${SIGNER_COLORS[signerIdx]}60`,
        background: isDragging ? `${SIGNER_COLORS[signerIdx]}25` : `${SIGNER_COLORS[signerIdx]}0a`,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none',
      }}
      onClick={() => {}} // el click no inserta — solo drag
      {...listeners}
      {...attributes}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>{ft.icon}</span>
      <span style={{ fontSize: 11, color: '#323338', fontWeight: 500 }}>{ft.label}</span>
    </button>
  )
}

// ── Campo arrastrable con dnd-kit ─────────────────────────────
function DraggableField({ field, signers, isSelected, onSelect, onRemove, canvasSize }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: field.id,
    data: { field },
  })

  const color = SIGNER_COLORS[field.signerIndex] || '#0073ea'
  const def   = FIELD_TYPES.find(t => t.type === field.type)

  const style = {
    position:  'absolute',
    left:      `${field.x}%`,
    top:       `${field.y}%`,
    width:     `${field.w}%`,
    height:    `${field.h}%`,
    transform: CSS.Translate.toString(transform),
    background: isDragging ? `${color}45` : `${color}28`,
    border:    `2px solid ${color}${isSelected ? '' : 'aa'}`,
    borderRadius: 4,
    cursor:    isDragging ? 'grabbing' : 'grab',
    display:   'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    boxSizing: 'border-box',
    outline:   isSelected ? `3px solid ${color}` : 'none',
    outlineOffset: 2,
    zIndex:    isDragging ? 999 : isSelected ? 10 : 1,
    touchAction: 'none',
    userSelect: 'none',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={e => { e.stopPropagation(); onSelect(field.id) }}
      {...listeners}
      {...attributes}
    >
      <span style={{ fontSize: '0.6em', fontWeight: 700, color, pointerEvents: 'none', textAlign: 'center', lineHeight: 1.3 }}>
        {def?.label}
        <br />
        <span style={{ fontWeight: 400, fontSize: '0.85em' }}>
          {signers[field.signerIndex]?.name?.split(' ')[0] || `F${field.signerIndex + 1}`}
        </span>
      </span>

      {isSelected && (
        <button
          onPointerDown={e => { e.stopPropagation(); onRemove(field.id) }}
          style={{
            position: 'absolute', top: -10, right: -10,
            width: 20, height: 20, borderRadius: '50%',
            background: '#e2445c', border: '2px solid white',
            color: 'white', fontSize: 14, lineHeight: 1,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            zIndex: 100,
          }}
        >×</button>
      )}
    </div>
  )
}

// ── Canvas del PDF (zona de drop) ─────────────────────────────
function PdfDropZone({ canvasRef, children, onClickBlank }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pdf-canvas' })

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        userSelect: 'none',
        outline: isOver ? '3px solid #0073ea55' : 'none',
      }}
      onClick={onClickBlank}
    >
      <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />
      {/* pointerEvents: 'all' para que dnd-kit reciba los eventos en los campos */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'all' }}>
        {children}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function PdfSignatureEditor({ pdfUrl, signers, onConfirm, onCancel }) {
  const canvasRef  = useRef(null)
  const overlayRef = useRef(null)
  const renderRef  = useRef(null)

  const [pdfDoc,       setPdfDoc]       = useState(null)
  const [totalPages,   setTotalPages]   = useState(1)
  const [currentPage,  setCurrentPage]  = useState(1)
  const [canvasSize,   setCanvasSize]   = useState({ w: 0, h: 0 })
  const [fields,       setFields]       = useState([])
  const [activeSignerIdx, setActiveSignerIdx] = useState(0)
  const [selectedId,   setSelectedId]   = useState(null)
  const [activeFieldId, setActiveFieldId] = useState(null) // para DragOverlay
  const [loading,      setLoading]      = useState(true)
  const [pdfError,     setPdfError]     = useState(null)

  // dnd-kit sensors — requiere 5px de movimiento para activar drag (evita clicks)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // ── Cargar PDF ──────────────────────────────────────────────
  useEffect(() => {
    const url = resolvePdfUrl(pdfUrl)
    if (!url) { setPdfError('URL de PDF no válida'); setLoading(false); return }

    pdfjsLib.getDocument({ url, withCredentials: false }).promise
      .then(doc => { setPdfDoc(doc); setTotalPages(doc.numPages); setLoading(false) })
      .catch(err => { setPdfError(`Error al cargar el PDF: ${err.message}`); setLoading(false) })
  }, [pdfUrl])

  // ── Renderizar página ───────────────────────────────────────
  const renderPage = useCallback(async (doc, pageNum) => {
    if (!canvasRef.current) return
    const page     = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.6 })
    const canvas   = canvasRef.current
    canvas.width   = viewport.width
    canvas.height  = viewport.height
    setCanvasSize({ w: viewport.width, h: viewport.height })
    if (renderRef.current) { try { renderRef.current.cancel() } catch {} }
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
    renderRef.current = task
    await task.promise.catch(() => {})
  }, [])

  useEffect(() => { if (pdfDoc) renderPage(pdfDoc, currentPage) }, [pdfDoc, currentPage, renderPage])

  // ── Agregar campo (click en botón sidebar) ──────────────────
  function addField(type) {
    const def = FIELD_TYPES.find(f => f.type === type)
    _counter++
    setFields(prev => [...prev, {
      id:          `f${_counter}`,
      type,
      signerIndex: activeSignerIdx,
      page:        currentPage,
      x: 35, y: 40,
      w: def.w, h: def.h,
    }])
  }

  function removeField(id) {
    setFields(prev => prev.filter(f => f.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // ── dnd-kit: drag de toolbar → PDF (nuevo campo) o mover campo existente ──
  function handleDragStart({ active }) {
    if (!active.data.current?.fromToolbar) {
      setActiveFieldId(active.id)
      setSelectedId(active.id)
    } else {
      setActiveFieldId(`toolbar-${active.data.current.fieldType}`)
    }
  }

  function handleDragEnd({ active, over, delta, activatorEvent }) {
    setActiveFieldId(null)
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const cw   = rect.width
    const ch   = rect.height
    if (!cw || !ch) return

    // ── CASO 1: se arrastra un tipo de campo desde el sidebar ──
    if (active.data.current?.fromToolbar) {
      // Solo añadir si se soltó sobre el canvas (over = 'pdf-canvas')
      if (!over || over.id !== 'pdf-canvas') return

      const def   = FIELD_TYPES.find(f => f.type === active.data.current.fieldType)
      const sIdx  = active.data.current.signerIndex ?? activeSignerIdx

      // Posición del click inicial + delta de movimiento = posición del drop
      const startX = (activatorEvent?.clientX ?? 0) - rect.left
      const startY = (activatorEvent?.clientY ?? 0) - rect.top
      const dropX  = startX + delta.x
      const dropY  = startY + delta.y

      // Convertir a porcentaje y centrar el campo en el cursor
      const xPct = Math.max(0, Math.min(100 - def.w, (dropX / cw) * 100 - def.w / 2))
      const yPct = Math.max(0, Math.min(100 - def.h, (dropY / ch) * 100 - def.h / 2))

      _counter++
      setFields(prev => [...prev, {
        id:          `f${_counter}`,
        type:        active.data.current.fieldType,
        signerIndex: sIdx,
        page:        currentPage,
        x: xPct, y: yPct,
        w: def.w, h: def.h,
      }])
      return
    }

    // ── CASO 2: mover campo existente ─────────────────────────
    const dx = (delta.x / cw) * 100
    const dy = (delta.y / ch) * 100

    setFields(prev => prev.map(f => {
      if (f.id !== active.id) return f
      return {
        ...f,
        x: Math.max(0, Math.min(100 - f.w, f.x + dx)),
        y: Math.max(0, Math.min(100 - f.h, f.y + dy)),
      }
    }))
  }

  // ── Confirmar ───────────────────────────────────────────────
  function handleConfirm() {
    const perSigner = signers.map((_, idx) =>
      fields
        .filter(f => f.signerIndex === idx)
        .map(({ type, x, y, w, h, page }) => ({ type, x, y, w, h, page }))
    )
    onConfirm(perSigner)
  }

  const pageFields  = fields.filter(f => f.page === currentPage)
  const totalFields = fields.length
  const activeField = fields.find(f => f.id === activeFieldId)

  // ── Render ──────────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>Colocar campos de firma</span>
        <div style={{ flex: 1 }} />
        {totalPages > 1 && (
          <div style={s.pageNav}>
            <button style={s.navBtn} disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
            <span style={{ color: 'white', fontSize: 13 }}>Pág {currentPage}/{totalPages}</span>
            <button style={s.navBtn} disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>›</button>
          </div>
        )}
        <button style={s.btnSecondary} onClick={onCancel}>Cancelar</button>
        <button style={s.btnPrimary} onClick={handleConfirm}>
          Confirmar {totalFields > 0 ? `(${totalFields} campos)` : 'sin campos'} →
        </button>
      </div>

      {/* Body */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div style={s.body}>
          {/* Sidebar */}
          <div style={s.sidebar}>
            <div style={s.sideSection}>FIRMANTES</div>
            {signers.map((s, idx) => (
              <button key={idx} style={{
                ...s_btn.signerBtn,
                borderColor:  activeSignerIdx === idx ? SIGNER_COLORS[idx] : 'transparent',
                background:   activeSignerIdx === idx ? `${SIGNER_COLORS[idx]}18` : 'white',
              }} onClick={() => setActiveSignerIdx(idx)}>
                <span style={{ ...s_btn.dot, background: SIGNER_COLORS[idx] }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s_btn.name}>{s.name || `Firmante ${idx + 1}`}</div>
                  <div style={s_btn.email}>{s.email}</div>
                </div>
                <span style={{ fontSize: 11, color: SIGNER_COLORS[idx], fontWeight: 700 }}>
                  {fields.filter(f => f.signerIndex === idx).length}
                </span>
              </button>
            ))}

            <div style={{ ...s.sideSection, marginTop: 16 }}>AGREGAR CAMPO</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, lineHeight: 1.4 }}>
              Arrastra al PDF para posicionar exacto
            </div>
            <div style={s.fieldGrid}>
              {FIELD_TYPES.map(ft => (
                <DraggableFieldTypeBtn
                  key={ft.type}
                  ft={ft}
                  signerIdx={activeSignerIdx}
                />
              ))}
            </div>

            {fields.length > 0 && (
              <>
                <div style={{ ...s.sideSection, marginTop: 16 }}>CAMPOS ({fields.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {fields.map(f => {
                    const def = FIELD_TYPES.find(t => t.type === f.type)
                    return (
                      <div key={f.id} onClick={() => setSelectedId(f.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                        borderRadius: 6, border: `1px solid ${selectedId === f.id ? '#0073ea' : '#e0e2ea'}`,
                        background: selectedId === f.id ? '#e8f0fe' : 'white', cursor: 'pointer',
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: SIGNER_COLORS[f.signerIndex], flexShrink: 0 }} />
                        <span style={{ fontSize: 11, flex: 1, color: '#323338' }}>{def?.label} · Pág {f.page}</span>
                        <button onClick={e => { e.stopPropagation(); removeField(f.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 16 }}>×</button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {fields.length === 0 && (
              <div style={{ fontSize: 12, color: '#9699a6', textAlign: 'center', padding: '16px 8px', lineHeight: 1.5, marginTop: 8 }}>
                Selecciona un firmante y agrega campos sobre el documento
              </div>
            )}
          </div>

          {/* Canvas PDF */}
          <div style={s.canvasArea}>
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60 }}>
                <div style={s.spinner} />
                <span style={{ color: '#94a3b8', fontSize: 14 }}>Cargando PDF…</span>
              </div>
            )}
            {pdfError && (
              <div style={{ background: 'white', borderRadius: 10, padding: '32px 24px', color: '#e2445c', fontWeight: 600, fontSize: 15 }}>
                ⚠️ {pdfError}
              </div>
            )}

            {!loading && !pdfError && (
              <PdfDropZone canvasRef={canvasRef} onClickBlank={() => setSelectedId(null)}>
                {pageFields.map(field => (
                  <DraggableField
                    key={field.id}
                    field={field}
                    signers={signers}
                    isSelected={selectedId === field.id}
                    onSelect={setSelectedId}
                    onRemove={removeField}
                    canvasSize={canvasSize}
                  />
                ))}
              </PdfDropZone>
            )}
          </div>
        </div>

        {/* DragOverlay — fantasma visual mientras arrastras */}
        <DragOverlay dropAnimation={null}>
          {activeFieldId && (() => {
            // ¿Es un campo nuevo desde el toolbar?
            if (activeFieldId.startsWith('toolbar-')) {
              const type = activeFieldId.replace('toolbar-', '')
              const def  = FIELD_TYPES.find(t => t.type === type)
              const color = SIGNER_COLORS[activeSignerIdx]
              return (
                <div style={{
                  background: `${color}35`, border: `2px dashed ${color}`,
                  borderRadius: 4, padding: '6px 14px',
                  color, fontSize: 13, fontWeight: 700,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                }}>
                  {def?.icon} {def?.label}
                </div>
              )
            }
            // Campo existente siendo movido
            const field = fields.find(f => f.id === activeFieldId)
            if (!field) return null
            const color = SIGNER_COLORS[field.signerIndex]
            return (
              <div style={{
                background: `${color}35`, border: `2px solid ${color}`,
                borderRadius: 4, padding: '4px 10px',
                color, fontSize: 12, fontWeight: 700,
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                pointerEvents: 'none',
              }}>
                {FIELD_TYPES.find(t => t.type === field.type)?.label}
              </div>
            )
          })()}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// ── Estilos ──────────────────────────────────────────────────
const s = {
  root:       { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' },
  header:     { background: '#1B3055', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.1)' },
  headerTitle:{ color: 'white', fontWeight: 700, fontSize: 16 },
  pageNav:    { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn:     { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 6, padding: '3px 12px', cursor: 'pointer', fontSize: 20, lineHeight: 1 },
  btnSecondary:{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  btnPrimary: { background: '#0073ea', border: 'none', color: 'white', borderRadius: 6, padding: '6px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  body:       { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar:    { width: 230, background: '#f6f7fb', borderRight: '1px solid #e0e2ea', padding: '16px 12px', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' },
  sideSection:{ fontSize: 10, fontWeight: 700, color: '#9699a6', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  fieldGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  canvasArea: { flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 32, background: '#525659' },
  spinner:    { width: 36, height: 36, borderRadius: '50%', border: '3px solid #e0e2ea', borderTopColor: '#0073ea', animation: 'spin 0.8s linear infinite' },
}

const s_btn = {
  signerBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, marginBottom: 5, border: '2px solid transparent', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' },
  dot:       { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  name:      { fontSize: 13, fontWeight: 600, color: '#323338', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  email:     { fontSize: 11, color: '#676879', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fieldBtn:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all 0.15s' },
}
