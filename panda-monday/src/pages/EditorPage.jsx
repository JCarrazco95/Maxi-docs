/**
 * EditorPage — Editor estilo PandaDoc
 * Layout: Header mínimo | Documento A4 | Panel lateral derecho + Strip de iconos
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import api, { updateMondayContext } from '../api/client.js'
import WysiwygEditor from './components/WysiwygEditor.jsx'
import BlocksSidebar from './components/BlocksSidebar.jsx'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
} from '@dnd-kit/core'
import MondayVariablesPanel from './components/MondayVariablesPanel.jsx'
import DesignPanel, { buildDesignCss } from './components/DesignPanel.jsx'
import RecipientsPanel from './components/RecipientsPanel.jsx'
import PdfSignatureEditor from './components/PdfSignatureEditor.jsx'
import { FIELD_COLORS, FIELD_LABELS } from './components/SignatureFieldExtension.jsx'
import { BLOCK_GROUPS } from './components/BlocksSidebar.jsx'

// ── Helpers ───────────────────────────────────────────────────
function applyVars(html, vals) {
  let r = html || ''
  for (const [k, v] of Object.entries(vals)) r = r.replaceAll(`{{${k}}}`, v ?? '')
  return r
}

function mergePtItems(templateHtml, editorHtml) {
  const nodes = {}
  editorHtml?.replace(/<pricing-table([^>]*)><\/pricing-table>/g, (m, a) => {
    const t  = a.match(/data-title="([^"]*)"/)?.[1] ?? ''
    const tp = a.match(/data-table-type="([^"]*)"/)?.[1] ?? ''
    nodes[`${t}|${tp}`] = m
  })
  return (templateHtml || '').replace(/<pricing-table([^>]*)>\s*<\/pricing-table>/g, (orig, a) => {
    const t  = a.match(/data-title="([^"]*)"/)?.[1] ?? ''
    const tp = a.match(/data-table-type="([^"]*)"/)?.[1] ?? ''
    return nodes[`${t}|${tp}`] ?? orig
  })
}

// TipTap remueve las etiquetas <style> al parsear el HTML del template
// (solo entiende nodos del editor, no CSS). En modo Edición libre, cuando
// enviamos currentHtml al backend, se pierden las reglas del template
// (.mr, .mr-page, .mr-full-bleed, .mr-ad-page) y el PDF sale descuadrado.
// Este helper extrae el bloque <style>...</style> del templateHtml y lo
// vuelve a prepender al editorHtml si no está presente. También deduplica
// las imágenes de header/footer: si la plantilla tiene varias páginas,
// TipTap aplana todo el contenido y cada header/footer original queda
// repetido en el flujo (sin salto de página que los separe); nos quedamos
// con una sola aparición de cada uno, al inicio y al final.
function ensureTemplateStyle(templateHtml, editorHtml) {
  if (!editorHtml) return editorHtml
  const tpl = templateHtml || ''

  const styleAlreadyPresent = /<style[^>]*>[\s\S]*?<\/style>/i.test(editorHtml)
  const styleBlock = styleAlreadyPresent ? '' : (tpl.match(/<style[^>]*>[\s\S]*?<\/style>/i)?.[0] || '')
  let content = styleAlreadyPresent ? editorHtml : editorHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  const header = tpl.match(/<img[^>]*class="[^"]*mr-page-header[^"]*"[^>]*\/?>/i)?.[0] || ''
  const footer = tpl.match(/<img[^>]*class="[^"]*mr-page-footer[^"]*"[^>]*\/?>/i)?.[0] || ''

  const headerCount = (content.match(/<img[^>]*class="[^"]*mr-page-header[^"]*"[^>]*\/?>/gi) || []).length
  const footerCount = (content.match(/<img[^>]*class="[^"]*mr-page-footer[^"]*"[^>]*\/?>/gi) || []).length

  // Sin duplicados que resolver → solo reinyectamos el <style> si hacía falta.
  if (headerCount <= 1 && footerCount <= 1) return styleBlock + '\n' + content

  content = content
    .replace(/<img[^>]*class="[^"]*mr-page-header[^"]*"[^>]*\/?>/gi, '')
    .replace(/<img[^>]*class="[^"]*mr-page-footer[^"]*"[^>]*\/?>/gi, '')

  return `${styleBlock}\n${header}\n${content}\n${footer}`
}

// ── Abrir editor en pestaña nueva ────────────────────────────
export function openEditorTab(data) {
  const params = new URLSearchParams()
  if (data.documentId)  params.set('docId',   data.documentId)  // modo edición
  if (data.templateId)  params.set('tpl',     data.templateId)
  if (data.docName)     params.set('name',    encodeURIComponent(data.docName))
  if (data.itemId)      params.set('item',    String(data.itemId))
  if (data.boardId)     params.set('board',   String(data.boardId))
  if (data.accountId)   params.set('account', String(data.accountId))
  if (data.userId)      params.set('user',    String(data.userId))
  if (data.isAdmin)     params.set('admin',   '1')
  if (data.fieldValues && Object.keys(data.fieldValues).length > 0) {
    try {
      params.set('fv', btoa(unescape(encodeURIComponent(JSON.stringify(data.fieldValues)))))
    } catch {}
  }
  window.open(`/editor?${params.toString()}`, '_blank')
}

// ── Zona de drop para el editor ───────────────────────────────
function EditorDropZone({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'editor-document' })
  return (
    <div ref={setNodeRef} style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      outline: isOver ? '3px solid rgba(0,115,234,0.5)' : 'none',
      outlineOffset: -3, transition: 'outline 0.15s',
    }}>
      {children}
    </div>
  )
}

// ── SVG Icons para el sidebar derecho ────────────────────────
const IcoBlocks    = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const IcoPeople    = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
const IcoVars      = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
const IcoPalette   = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
const IcoFlow      = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4l-3.5 6"/><path d="M12 11l3.5 6"/></svg>
const IcoClip      = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
const IcoEye       = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const IcoPdf       = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const IcoX         = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

// ── Panel Flujo de trabajo (placeholder) ──────────────────────
function WorkflowPanel({ onClose }) {
  return (
    <div style={rp.panel}>
      <div style={rp.panelHeader}>
        <span style={rp.panelTitle}>Flujo de trabajo</span>
        <button onClick={onClose} style={rp.closeBtn}><IcoX /></button>
      </div>
      <div style={{ padding: 20, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
        <div style={{ fontWeight: 600, color: '#323338', marginBottom: 6 }}>Flujo de aprobación</div>
        <div>Configura estados y aprobadores para este documento.</div>
        <div style={{ marginTop: 16, padding: '8px 12px', background: '#f6f7fb', borderRadius: 8, fontSize: 12, color: '#676879' }}>
          Próximamente disponible
        </div>
      </div>
    </div>
  )
}

// ── Panel Adjuntos (placeholder) ──────────────────────────────
function AttachmentsPanel({ onClose }) {
  return (
    <div style={rp.panel}>
      <div style={rp.panelHeader}>
        <span style={rp.panelTitle}>Adjuntos</span>
        <button onClick={onClose} style={rp.closeBtn}><IcoX /></button>
      </div>
      <div style={{ padding: 20, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📎</div>
        <div style={{ fontWeight: 600, color: '#323338', marginBottom: 6 }}>Archivos adjuntos</div>
        <div>Añade documentos de soporte a este archivo.</div>
        <div style={{ marginTop: 16, padding: '8px 12px', background: '#f6f7fb', borderRadius: 8, fontSize: 12, color: '#676879' }}>
          Próximamente disponible
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function EditorPage() {
  const [session,     setSession]     = useState(null)
  const [docName,     setDocName]     = useState('')
  const [editorHtml,  setEditorHtml]  = useState('')
  const [currentHtml, setCurrentHtml] = useState('')
  const [templateCss, setTplCss]      = useState('')
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState(null)
  const [design,      setDesign]      = useState({})
  const [previewing,  setPreviewing]  = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [saveSuccess,   setSaveSuccess]   = useState(false)
  // generatorMode = true: texto bloqueado, solo tablas y campos de firma editables
  const [generatorMode, setGeneratorMode] = useState(true)

  // Panel derecho activo: 'content' | 'recipients' | 'variables' | 'design' | 'workflow' | 'attachments' | 'preview'
  const [activePanel, setActivePanel] = useState(null)
  function togglePanel(id) { setActivePanel(p => p === id ? null : id) }

  // Firmantes
  const [signers,    setSigners]    = useState([{ name: '', email: '', autoFilled: false }])
  const [sequential, setSequential] = useState(true)

  // Editor de firma
  const [signingMode,    setSigningMode]    = useState(false)
  const [generatedDocId, setGeneratedDocId] = useState(null)
  const [generatedPdfUrl,setGeneratedPdfUrl]= useState(null)
  const [sendingSign,    setSendingSign]    = useState(false)
  const [signError,      setSignError]      = useState(null)

  // Email y nombre del vendedor (para notificaciones y lista de documentos)
  const [ownerEmail, setOwnerEmail] = useState(null)
  const [ownerName,  setOwnerName]  = useState(null)

  // Vars de Monday pendientes de aplicar al editor (se aplican cuando el editor esté listo)
  const [pendingMondayVars, setPendingMondayVars] = useState(null)

  // Variables de Monday
  const [varValues, setVarValues] = useState({})

  // Drag & drop
  const [activeDragItem, setActiveDragItem] = useState(null)
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const editorRef   = useRef(null)
  const iframeRef   = useRef(null)
  const debounceRef = useRef(null)

  function handleEditorDragStart({ active }) {
    if (active.data.current?.fromSidebar) setActiveDragItem(active.data.current.blockItem)
  }

  function handleEditorDragEnd({ active, over, delta, activatorEvent }) {
    setActiveDragItem(null)
    if (!active.data.current?.fromSidebar) return
    if (!over) return

    const item   = active.data.current.blockItem
    const editor = editorRef.current?.getEditor?.()
    if (!editor) return

    const finalX = (activatorEvent?.clientX ?? 0) + delta.x
    const finalY = (activatorEvent?.clientY ?? 0) + delta.y

    try {
      const dropPos = editor.view.posAtCoords({ left: finalX, top: finalY })
      if (dropPos?.pos != null) {
        editor.chain().focus().setTextSelection(dropPos.pos).run()
      } else {
        editor.chain().focus().run()
      }
    } catch {
      editor.chain().focus().run()
    }

    if (item.type === 'pricing') {
      editor.chain().insertPricingTable({ tableType: item.tableType }).run()
    } else if (item.type === 'image') {
      const url = prompt('URL de la imagen:')
      if (url?.trim()) editor.chain().setImage({ src: url.trim() }).run()
    } else if (item.html) {
      editor.chain().insertContent(item.html).run()
    }
  }

  // ── Cargar sesión desde URL params ────────────────────────────
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search)
    const docId     = params.get('docId')   // modo edición de documento existente
    const tplId     = params.get('tpl')
    const nameRaw   = params.get('name')
    const itemId    = params.get('item')
    const boardId   = params.get('board')
    const accountId = params.get('account')
    const userId    = params.get('user')
    const isAdmin   = params.get('admin') === '1'
    const fvRaw     = params.get('fv')

    if (accountId && accountId !== 'null') {
      updateMondayContext({ accountId, userId: userId || 'user', isAdmin })
    }

    // ── Modo edición: cargar documento existente ──────────────
    if (docId) {
      api.get(`/api/documents/${docId}`)
        .then(res => {
          const doc = res.data
          const cssMatch = doc.content_html?.match(/<style>([\s\S]*?)<\/style>/i)
          const css = cssMatch?.[1] ?? ''
          setSession({ documentId: doc.id, templateId: doc.template_id, boardId, itemId, accountId, userId, isAdmin })
          setDocName(doc.name)
          setTplCss(css)
          setEditorHtml(doc.content_html ?? '')
          setCurrentHtml(doc.content_html ?? '')
          // session.templateHtml queda sin llenar arriba porque un documento
          // ya generado no trae la plantilla original — sin esto, Edición
          // libre no tiene de dónde reinyectar <style> ni header/footer al
          // guardar (ver ensureTemplateStyle). La plantilla original (no el
          // documento, que puede haber perdido el estilo en un guardado
          // previo) es la fuente confiable de ese CSS/estructura.
          if (doc.template_id) {
            api.get(`/api/templates/${doc.template_id}`)
              .then(r => setSession(prev => prev && ({ ...prev, templateHtml: r.data.content_html })))
              .catch(() => {})
          }
          const fv = typeof doc.filled_data === 'string' ? JSON.parse(doc.filled_data || '{}') : (doc.filled_data ?? {})
          setVarValues(fv)
          api.get('/api/monday/me').then(r => {
            if (r.data.email) setOwnerEmail(r.data.email)
            if (r.data.name)  setOwnerName(r.data.name)
          }).catch(() => {})
        })
        .catch(e => setError(`No se pudo cargar el documento: ${e.message}`))
      return
    }

    if (!tplId) {
      setError('No se especificó una plantilla. Cierra esta pestaña y ábrela desde la app.')
      return
    }

    if (accountId && accountId !== 'null') {
      updateMondayContext({ accountId, userId: userId || 'user', isAdmin })
    }

    let fieldValues = {}
    if (fvRaw) {
      try { fieldValues = JSON.parse(decodeURIComponent(escape(atob(fvRaw)))) } catch {}
    }

    api.get(`/api/templates/${tplId}`)
      .then(res => {
        const tpl = res.data
        const docNameDecoded = nameRaw ? decodeURIComponent(nameRaw) : tpl.name
        const cssMatch = tpl.content_html?.match(/<style>([\s\S]*?)<\/style>/i)
        const css = cssMatch?.[1] ?? ''
        const filled = applyVars(tpl.content_html ?? '', fieldValues)
        setSession({ templateId: tpl.id, templateHtml: tpl.content_html, boardId, itemId, accountId, userId, isAdmin })
        // Obtener datos del vendedor desde Monday y auto-rellenar variables
        api.get('/api/monday/me').then(r => {
          if (r.data.email) setOwnerEmail(r.data.email)
          if (r.data.name)  setOwnerName(r.data.name)

          // Calcular fecha de creación y vigencia (15 días calendario)
          const hoy = new Date()
          const fmtDate = d => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
          const vigencia = new Date(hoy)
          vigencia.setDate(vigencia.getDate() + 15)

          // Variables automáticas del vendedor + fechas
          const autoVars = {
            ejecutivo:          r.data.name  ?? '',
            correo_electronico: r.data.email ?? '',
            telefono:           r.data.phone ?? '',
            Fecha_creación:     fmtDate(hoy),
            fecha:              fmtDate(hoy),
            fecha_vigencia:     fmtDate(vigencia),
          }

          setVarValues(prev => {
            const merged = { ...autoVars, ...prev }
            setPendingMondayVars(merged)
            return merged
          })
        }).catch(() => {})
        setDocName(docNameDecoded)
        setTplCss(css)
        setEditorHtml(filled)
        setCurrentHtml(filled)
        setVarValues(fieldValues)

        // Auto-rellenar variables y firmantes desde Monday si hay boardId + itemId
        if (boardId && itemId) {
          api.get(`/api/monday/board/${boardId}/item/${itemId}`)
            .then(mondayRes => {
              const mondayVals = mondayRes.data?.values ?? {}

              // Combinar respetando prioridad y PRESERVANDO autoVars (fecha, fecha_vigencia, ejecutivo)
              // que la llamada paralela a /api/monday/me pudo haber seteado antes.
              // Prioridad: mondayVals (item) < prev (autoVars del vendedor + fechas) < fieldValues (URL params)
              setVarValues(prev => {
                const merged = { ...mondayVals, ...prev, ...fieldValues }
                if (Object.keys(mondayVals).length > 0) {
                  setPendingMondayVars(merged)
                }
                return merged
              })

              // Auto-poblar firmante con el contacto de Monday
              const clientEmail = mondayVals.correo_electronico || mondayVals.email || ''
              const clientName  = mondayVals.name || mondayVals.nombre || mondayVals.razon_social || ''
              if (clientEmail) {
                setSigners([{ name: clientName, email: clientEmail, autoFilled: true }])
              }
            })
            .catch(() => {})
        }
      })
      .catch(e => {
        console.error('[EditorPage] Error cargando template:', e)
        setError(`No se pudo cargar la plantilla. ${e.response?.data?.error || e.message}`)
      })
  }, [])

  // ── Aplicar vars de Monday al editor cuando esté listo ───────
  useEffect(() => {
    if (!pendingMondayVars) return
    // Intentar aplicar inmediatamente, si el editor no está listo, reintentar
    let attempts = 0
    const tryApply = () => {
      const ok = editorRef.current?.applyAllVars?.(pendingMondayVars)
      if (ok === undefined && attempts < 10) {
        // Editor aún no montado, reintentar en 300ms
        attempts++
        setTimeout(tryApply, 300)
      } else {
        setPendingMondayVars(null)
      }
    }
    const timer = setTimeout(tryApply, 400) // esperar que el editor monte
    return () => clearTimeout(timer)
  }, [pendingMondayVars])

  // ── Preview en vivo ───────────────────────────────────────────
  const refreshPreview = useCallback((html) => {
    if (activePanel !== 'preview') return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!iframeRef.current) return
      try {
        setPreviewing(true)
        const res = await api.post('/api/documents/preview', { content_html: html }, { responseType: 'text' })
        if (iframeRef.current) {
          iframeRef.current.style.height = '900px'
          iframeRef.current.srcdoc = res.data
        }
      } catch {}
      finally { setPreviewing(false) }
    }, 700)
  }, [activePanel])

  useEffect(() => { if (editorHtml) refreshPreview(editorHtml) }, [editorHtml, activePanel])

  function handleChange(html) {
    setCurrentHtml(html)
    refreshPreview(html)
  }

  // ── Variables ─────────────────────────────────────────────────
  const vars     = [...new Set([...(currentHtml.matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]))]
  const unfilled = vars.filter(v => !varValues[v])

  function handleVarChange(varName, value) {
    setVarValues(prev => ({ ...prev, [varName]: value }))
    editorRef.current?.replaceVariable(varName, value)
  }

  // ── Enviar a firma ────────────────────────────────────────────
  async function handleSendForSign() {
    const validSigners = signers.filter(s => s.name.trim() && s.email.trim())
    if (validSigners.length === 0) {
      setSignError('Agrega al menos un destinatario con nombre y email')
      setActivePanel('recipients')
      return
    }

    // Intentar extraer campos inline del editor
    const inlineFields = editorRef.current?.getFieldPositions?.() ?? []
    const hasInlineFields = inlineFields.length > 0

    // Si ya generamos PDF y no hay campos inline, abrir overlay manual
    if (generatedDocId && generatedPdfUrl && !hasInlineFields) {
      setSigningMode(true)
      return
    }

    setGenerating(true); setSignError(null)
    try {
      // En modo "Solo tablas" mantenemos el template original y solo reemplazamos
      // las pricing-tables editadas. En modo "Edición libre" el usuario cambió
      // texto libremente → usamos currentHtml tal cual, pero reinyectamos el
      // <style> del template porque TipTap lo quita al parsear.
      const finalHtml = generatorMode
        ? mergePtItems(session?.templateHtml ?? currentHtml, currentHtml)
        : ensureTemplateStyle(session?.templateHtml || editorHtml, currentHtml)

      // Modo edición: regenerar documento existente
      const res = session?.documentId
        ? await api.put(`/api/documents/${session.documentId}/regenerate`, {
            content_html: finalHtml,
            filled_data:  varValues,
          })
        : await api.post('/api/documents/generate', {
            template_id:     session?.templateId,
            name:            docName,
            monday_board_id: session?.boardId ? String(session.boardId) : undefined,
            monday_item_id:  session?.itemId  ? String(session.itemId)  : undefined,
            content_html:    finalHtml,
            filled_data:     varValues,
            owner_email:     ownerEmail || undefined,
            owner_name:      ownerName  || undefined,
          })

      setGeneratedDocId(res.data.id)
      setGeneratedPdfUrl(res.data.pdf_url)
      setGenerating(false)

      if (hasInlineFields) {
        // Flujo directo: campos ya posicionados inline → enviar sin overlay
        await sendWithFields(res.data.id, validSigners, inlineFields)
      } else {
        // Flujo manual: abrir overlay de posicionamiento
        setSigningMode(true)
      }
    } catch (e) {
      setSignError(e.response?.data?.error || 'Error al generar el PDF')
      setGenerating(false)
    }
  }

  async function sendWithFields(docId, validSigners, fields) {
    setSendingSign(true); setSignError(null)
    try {
      await api.post('/api/signatures/send', {
        document_id: docId,
        signers: validSigners.map((s, i) => ({
          name: s.name.trim(), email: s.email.trim(),
          order: sequential ? i + 1 : 1,
        })),
        field_config: fields.length > 0 ? fields : null,
      })
      setSendingSign(false)
      setSaved(true)
      if (window.opener && !window.opener.closed) {
        try { window.opener.dispatchEvent(new CustomEvent('mxd-doc-generated', { detail: { id: docId } })) } catch {}
      }
      setTimeout(() => window.close(), 2500)
    } catch (e) {
      setSignError(e.response?.data?.error || 'Error al enviar a firma')
      setSendingSign(false)
    }
  }

  async function handleFieldsConfirmed(perSignerFields) {
    setSendingSign(true); setSignError(null)
    try {
      const validSigners = signers.filter(s => s.name.trim() && s.email.trim())
      const flatFields = perSignerFields.flatMap((fields, idx) =>
        fields.map(f => ({ ...f, signerIndex: idx }))
      )
      await api.post('/api/signatures/send', {
        document_id: generatedDocId,
        signers: validSigners.map((s, i) => ({
          name: s.name.trim(), email: s.email.trim(),
          order: sequential ? i + 1 : 1,
        })),
        field_config: flatFields.length > 0 ? flatFields : null,
      })
      setSigningMode(false)
      setSendingSign(false)
      setSaved(true)
      if (window.opener && !window.opener.closed) {
        try { window.opener.dispatchEvent(new CustomEvent('mxd-doc-generated', { detail: { id: generatedDocId } })) } catch {}
      }
      setTimeout(() => window.close(), 2500)
    } catch (e) {
      setSignError(e.response?.data?.error || 'Error al enviar a firma')
      setSendingSign(false)
      setSigningMode(false)
    }
  }

  async function handleGenerate() {
    if (!session) return
    setGenerating(true); setError(null)
    try {
      // En modo "Solo tablas" mantenemos el template original y solo reemplazamos
      // las pricing-tables editadas. En modo "Edición libre" el usuario cambió
      // texto libremente → usamos currentHtml tal cual, sin merge.
      const finalHtml = generatorMode
        ? mergePtItems(session.templateHtml ?? currentHtml, currentHtml)
        : ensureTemplateStyle(session.templateHtml || editorHtml, currentHtml)

      // Modo edición: regenerar documento existente (mantiene folio)
      const res = session.documentId
        ? await api.put(`/api/documents/${session.documentId}/regenerate`, {
            content_html: finalHtml,
            filled_data:  varValues,
          })
        : await api.post('/api/documents/generate', {
            template_id:     session.templateId,
            name:            docName,
            monday_board_id: session.boardId ? String(session.boardId) : undefined,
            monday_item_id:  session.itemId  ? String(session.itemId)  : undefined,
            content_html:    finalHtml,
            filled_data:     varValues,
            owner_email:     ownerEmail || undefined,
            owner_name:      ownerName  || undefined,
          })

      setGeneratedDocId(res.data.id)
      setGeneratedPdfUrl(res.data.pdf_url)
      try { window.opener?.dispatchEvent(new CustomEvent('mxd-doc-generated', { detail: res.data })) } catch {}
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.message || e.message || 'Error al generar el PDF'
      console.error('[Generar PDF]', e.response?.status, e.response?.data)
      setError(msg)
    } finally {
      setGenerating(false)
    }
  }

  // ── Pantallas de estado ───────────────────────────────────────
  if (!session && !error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f7fb', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e0e2ea', borderTopColor: '#0073ea', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: '#9699a6', fontSize: 14 }}>Cargando plantilla…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error && !session) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f6f7fb', gap: 16 }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <div style={{ fontSize: 16, color: '#323338', fontWeight: 600 }}>{error}</div>
      <button onClick={() => window.close()} style={{ padding: '8px 20px', background: '#1B3055', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
        Cerrar pestaña
      </button>
    </div>
  )

  if (saved) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f6f7fb', gap: 16 }}>
      <div style={{ fontSize: 60 }}>✅</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#323338' }}>¡Enviado a firma!</div>
      <div style={{ fontSize: 14, color: '#676879' }}>El cliente recibirá un email para firmar.</div>
      <button onClick={() => window.close()} style={{ marginTop: 8, padding: '10px 28px', background: '#1B3055', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        ✕ Cerrar pestaña
      </button>
      <p style={{ fontSize: 12, color: '#94a3b8', maxWidth: 300, textAlign: 'center' }}>
        Si el botón no cierra la pestaña, ciérrala manualmente desde el navegador.
      </p>
    </div>
  )

  // ── Items del sidebar derecho ─────────────────────────────────
  const sideItems = [
    { id: 'content',     icon: <IcoBlocks />,  label: 'Contenido' },
    { id: 'recipients',  icon: <IcoPeople />,  label: 'Destinatarios', badge: signers.filter(s=>s.email).length || null },
    { id: 'variables',   icon: <IcoVars />,    label: 'Variables', badge: unfilled.length || null, badgeColor: '#e03e3e' },
    { id: 'design',      icon: <IcoPalette />, label: 'Diseño' },
    { id: 'workflow',    icon: <IcoFlow />,    label: 'Flujo' },
    { id: 'attachments', icon: <IcoClip />,    label: 'Adjuntos' },
  ]

  const panelWidth = activePanel === 'preview' ? 460 : activePanel === 'content' ? 220 : 280

  // ── Editor principal ──────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Figtree, system-ui, sans-serif', background: '#f6f7fb' }}>

      {/* ── Header mínimo ─────────────────────────────────────── */}
      <div style={{
        background: '#1B3055', height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#0073ea,#0060c0)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: 15 }}>M</div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Maxi<span style={{ color: '#60a5fa' }}>Docs</span></span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />

        {/* Nombre del documento */}
        <input
          value={docName}
          onChange={e => setDocName(e.target.value)}
          style={{
            flex: 1, maxWidth: 420,
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 7, padding: '6px 12px', color: 'white', fontSize: 14, fontWeight: 500,
            outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.4)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
        />

        <div style={{ flex: 1 }} />

        {/* Toast éxito */}
        {saveSuccess && (
          <span style={{ background: 'rgba(0,200,117,0.25)', border: '1px solid rgba(0,200,117,0.4)', color: '#6ee7b7', fontSize: 12, padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
            ✅ PDF guardado
          </span>
        )}

        {/* Error inline */}
        {(error || signError) && (
          <span style={{ background: 'rgba(226,68,92,0.25)', border: '1px solid rgba(226,68,92,0.4)', color: '#fca5a5', fontSize: 12, padding: '4px 10px', borderRadius: 20, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ⚠️ {error || signError}
          </span>
        )}

        {/* Guardar PDF */}
        <button onClick={handleGenerate} disabled={generating || sendingSign} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 7, color: 'white', fontSize: 13, fontWeight: 500,
          padding: '7px 14px', cursor: generating ? 'not-allowed' : 'pointer', flexShrink: 0,
        }}>
          {generating
            ? <><Spinner /> Generando…</>
            : <><IcoPdf /> Guardar PDF</>}
        </button>

        {/* Enviar a firma */}
        <button onClick={handleSendForSign} disabled={generating || sendingSign} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: (generating || sendingSign) ? '#4a6fa0' : '#00c875',
          border: 'none', borderRadius: 7, color: 'white',
          fontSize: 13, fontWeight: 700, padding: '8px 16px',
          cursor: (generating || sendingSign) ? 'not-allowed' : 'pointer', flexShrink: 0,
        }}>
          {sendingSign ? <><Spinner /> Enviando…</> : <>✍️ Enviar a firma</>}
        </button>

        {/* Toggle modo edición / generación */}
        <button
          onClick={() => setGeneratorMode(m => !m)}
          title={generatorMode ? 'Activar edición libre' : 'Volver a modo generador'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            background: generatorMode ? 'rgba(0,200,117,0.15)' : 'rgba(245,160,0,0.2)',
            border: `1px solid ${generatorMode ? 'rgba(0,200,117,0.4)' : 'rgba(245,160,0,0.5)'}`,
            borderRadius: 7, color: 'white', fontSize: 11, fontWeight: 600,
            padding: '5px 10px', cursor: 'pointer',
          }}
        >
          {generatorMode ? '🔒 Solo tablas' : '✏️ Edición libre'}
        </button>

        {/* Cerrar */}
        <button onClick={() => window.close()} title="Cerrar editor" style={{
          background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 7,
          color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '6px 8px',
          display: 'flex', alignItems: 'center', flexShrink: 0,
        }}><IcoX /></button>
      </div>

      {/* ── Cuerpo ─────────────────────────────────────────────── */}
      <DndContext
        sensors={dndSensors}
        collisionDetection={pointerWithin}
        onDragStart={handleEditorDragStart}
        onDragEnd={handleEditorDragEnd}
      >
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* ── Documento A4 ─────────────────────────────────── */}
          <EditorDropZone>
            <div style={{ flex: 1, overflow: 'auto', background: '#525659', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {templateCss && <style>{templateCss}</style>}
              {Object.keys(design).length > 0 && <style>{buildDesignCss(design)}</style>}
              <style>{EP_CSS}</style>

              {/* Indicador modo generador */}
              {generatorMode && (
                <div style={{ width: '100%', maxWidth: 850, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, background: 'rgba(0,200,117,0.15)', border: '1px solid rgba(0,200,117,0.35)', borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'white' }}>
                    <span style={{ fontSize: 14 }}>🔒</span>
                    <span><strong>Modo generador:</strong> el texto está bloqueado. Solo las <strong>tablas de precios</strong> son editables. Las variables se rellenaron desde Monday.</span>
                  </div>
                </div>
              )}

              <div style={{ width: '100%', maxWidth: 850, background: 'white', boxShadow: '0 4px 40px rgba(0,0,0,0.4)', borderRadius: 2, minHeight: 1123 }}>
                <div className={`ep-page${generatorMode ? ' ep-generator-mode' : ''}`}>
                  <WysiwygEditor ref={editorRef} value={editorHtml} onChange={handleChange} signers={signers} hideToolbar={generatorMode} />
                </div>
              </div>
              <div style={{ height: 48 }} />
            </div>
          </EditorDropZone>

          {/* ── Panel derecho expandible ──────────────────────── */}
          {activePanel && (
            <div style={{
              width: panelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid #e0e2ea', background: 'white', overflow: 'hidden',
              transition: 'width 0.2s ease',
            }}>
              {activePanel === 'content' && (
                <ContentPanel
                  editorRef={editorRef}
                  signers={signers}
                  onClose={() => setActivePanel(null)}
                />
              )}
              {activePanel === 'recipients' && (
                <RecipientsPanel
                  itemId={session?.itemId}
                  signers={signers}
                  setSigners={setSigners}
                  sequential={sequential}
                  setSequential={setSequential}
                  onClose={() => setActivePanel(null)}
                />
              )}
              {activePanel === 'variables' && (
                <MondayVariablesPanel
                  boardId={session?.boardId}
                  itemId={session?.itemId}
                  editorRef={editorRef}
                  onClose={() => setActivePanel(null)}
                />
              )}
              {activePanel === 'design' && (
                <DesignPanel
                  design={design}
                  onChange={setDesign}
                  onClose={() => setActivePanel(null)}
                />
              )}
              {activePanel === 'workflow' && (
                <WorkflowPanel onClose={() => setActivePanel(null)} />
              )}
              {activePanel === 'attachments' && (
                <AttachmentsPanel onClose={() => setActivePanel(null)} />
              )}
              {activePanel === 'preview' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ background: '#f6f7fb', borderBottom: '1px solid #e0e2ea', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#323338' }}>Vista PDF</span>
                    {previewing && <span style={{ fontSize: 11, color: '#94a3b8' }}>● renderizando…</span>}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setActivePanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', justifyContent: 'center', background: '#e5e7eb' }}>
                    <div style={{ width: '100%', background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                      <iframe ref={iframeRef} title="PDF" style={{ width: '100%', border: 'none', display: 'block', height: 900 }}
                        sandbox="allow-same-origin"
                        onLoad={e => {
                          try {
                            const h = e.target.contentDocument?.documentElement?.scrollHeight
                            if (h && h > 200) e.target.style.height = h + 'px'
                          } catch {}
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Strip de iconos (siempre visible) ─────────────── */}
          <div style={{
            width: 52, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: '#1B3055', borderLeft: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 8, paddingBottom: 8, gap: 2,
          }}>
            {sideItems.map(item => (
              <SidebarIcon
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activePanel === item.id}
                badge={item.badge}
                badgeColor={item.badgeColor}
                onClick={() => togglePanel(item.id)}
              />
            ))}

            {/* Separador */}
            <div style={{ flex: 1 }} />

            {/* Vista PDF al fondo */}
            <SidebarIcon
              icon={<IcoEye />}
              label="Vista PDF"
              active={activePanel === 'preview'}
              onClick={() => togglePanel('preview')}
            />
          </div>
        </div>

        {/* Overlay drag */}
        <DragOverlay dropAnimation={null}>
          {activeDragItem && (
            <div style={{
              background: '#1B3055', color: 'white', borderRadius: 8,
              padding: '8px 14px', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              cursor: 'grabbing', whiteSpace: 'nowrap',
            }}>
              <span>{activeDragItem.icon}</span>
              <span>{activeDragItem.label}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* PdfSignatureEditor overlay */}
      {signingMode && generatedPdfUrl && (
        <PdfSignatureEditor
          pdfUrl={generatedPdfUrl}
          signers={signers.filter(s => s.name.trim() && s.email.trim()).map(s => ({ name: s.name.trim(), email: s.email.trim() }))}
          onConfirm={handleFieldsConfirmed}
          onCancel={() => setSigningMode(false)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
      `}</style>
    </div>
  )
}

// ── Icono del sidebar derecho ─────────────────────────────────
function SidebarIcon({ icon, label, active, badge, badgeColor = '#00c875', onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={label}
        style={{
          width: 40, height: 44,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          background: active ? 'rgba(255,255,255,0.15)' : hover ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          color: active ? 'white' : 'rgba(255,255,255,0.55)',
          transition: 'background 0.15s, color 0.15s',
          position: 'relative',
        }}
      >
        {icon}
        <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, lineHeight: 1, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>
          {label.length > 8 ? label.slice(0, 7) + '…' : label}
        </span>

        {/* Badge numérico */}
        {badge != null && badge > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 3,
            background: badgeColor, color: 'white',
            fontSize: 9, fontWeight: 700, lineHeight: 1,
            padding: '1px 4px', borderRadius: 10,
            minWidth: 14, textAlign: 'center',
          }}>
            {badge}
          </span>
        )}
      </button>
    </div>
  )
}

// ── Spinner inline ────────────────────────────────────────────
function Spinner() {
  return <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
}

// ── Panel Contenido — bloques + campos de firma ───────────────
const SIGNER_COLORS = ['#0073ea', '#00c875', '#e2445c', '#ff642e', '#784bd1']

function ContentPanel({ editorRef, signers, onClose }) {
  const validSigners = signers.filter(s => s.name.trim() || s.email.trim())
  const [activeSignerIdx, setActiveSignerIdx] = useState(0)
  const [search, setSearch] = useState('')

  function insertBlock(item) {
    const editor = editorRef?.current?.getEditor?.()
    if (!editor) return
    if (item.type === 'pricing') {
      editor.chain().focus().insertPricingTable({ tableType: item.tableType }).run()
    } else if (item.type === 'image') {
      const url = prompt('URL de la imagen:')
      if (url?.trim()) editor.chain().focus().setImage({ src: url.trim() }).run()
    } else if (item.html) {
      editor.chain().focus().insertContent(item.html).run()
    }
  }

  function insertField(fieldType) {
    const signer = validSigners[activeSignerIdx]
    editorRef?.current?.insertSignatureField?.({
      fieldType,
      signerIndex: activeSignerIdx,
      signerName: signer ? (signer.name || signer.email) : '',
      signerColor: SIGNER_COLORS[activeSignerIdx % SIGNER_COLORS.length],
    })
  }

  const q = search.trim().toLowerCase()
  const filteredGroups = BLOCK_GROUPS.map(g => ({
    ...g,
    items: q ? g.items.filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)) : g.items,
  })).filter(g => g.items.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fafbfc', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 10px', borderBottom: '1px solid #e0e2ea', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1B3055' }}>Contenido</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>‹</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ── Sección campos de firma ── */}
        <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid #f0f1f5' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9699a6', letterSpacing: 0.6, marginBottom: 8 }}>
            CAMPOS RELLENABLES
          </div>

          {/* Selector de firmante */}
          {validSigners.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <select
                value={activeSignerIdx}
                onChange={e => setActiveSignerIdx(Number(e.target.value))}
                style={{ width: '100%', fontSize: 11, padding: '4px 8px', border: '1px solid #e0e2ea', borderRadius: 6, background: 'white', color: '#323338' }}
              >
                {validSigners.map((s, i) => (
                  <option key={i} value={i}>
                    ● {s.name || s.email || `Firmante ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, padding: '4px 0' }}>
              Agrega destinatarios en el panel 👥 para asignar campos.
            </div>
          )}

          {/* Botones de campos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {Object.entries(FIELD_LABELS).map(([type, label]) => {
              const c = FIELD_COLORS[type]
              return (
                <button
                  key={type}
                  onClick={() => insertField(type)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 8px', border: `1.5px dashed ${c.border}`,
                    borderRadius: 6, background: c.bg, color: c.text,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <span>{c.icon}</span> {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Sección bloques ── */}
        <div style={{ padding: '10px 12px 6px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9699a6', letterSpacing: 0.6, marginBottom: 8 }}>
            BLOQUES
          </div>

          {/* Búsqueda */}
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar bloque…"
              style={{ width: '100%', padding: '5px 24px 5px 8px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
            />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 14 }}>×</button>}
          </div>

          {/* Grupos de bloques */}
          {filteredGroups.map(group => (
            <div key={group.label} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: group.accent ?? '#9699a6', letterSpacing: 0.5, marginBottom: 4 }}>
                {group.label.toUpperCase()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {group.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => insertBlock(item)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 8px', border: '1px solid #e0e2ea',
                      borderRadius: 6, background: 'white', cursor: 'pointer',
                      fontSize: 11, color: '#323338', textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                  >
                    <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Estilos del editor ────────────────────────────────────────
const EP_CSS = `
  .ep-page .ProseMirror {
    min-height: 960px; padding: 20px 28px;
    font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #222;
    outline: none; line-height: 1.6;
  }
  .ep-page .wysiwyg-wrap { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
  .ep-page .wysiwyg-toolbar { position: sticky; top: 0; z-index: 10; background: white; border-bottom: 1px solid #e0e2ea; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .ep-page .wysiwyg-editor  { overflow: visible !important; height: auto !important; }
  .ep-page .ProseMirror h1  { font-size: 18pt; margin-bottom: 14px; }
  .ep-page .ProseMirror h2  { font-size: 14pt; margin: 18px 0 10px; }
  .ep-page .ProseMirror h3  { font-size: 12pt; margin: 14px 0 8px; }
  .ep-page .ProseMirror p   { margin-bottom: 10px; }
  .ep-page .ProseMirror table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  .ep-page .ProseMirror th, .ep-page .ProseMirror td { border: 1px solid #ccc; padding: 7px 11px; }
  .ep-page .ProseMirror th  { background: #f5f5f5; font-weight: bold; }
  .ep-page .ProseMirror img { max-width: 100%; }

  /* Variables resaltadas en amarillo */
  .mxd-var-highlight {
    background: #fef9c3; color: #854d0e;
    border-radius: 3px; padding: 1px 3px; font-weight: 600;
  }

  /* Drag handle de bloques */
  .drag-handle {
    cursor: grab; color: #c0c4cc;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s;
  }
  .drag-handle:hover { color: #1B3055; }

  /* ── MODO GENERADOR — texto bloqueado, tablas libres ────── */
  .ep-generator-mode .ProseMirror {
    caret-color: transparent;
  }
  .ep-generator-mode .ProseMirror p,
  .ep-generator-mode .ProseMirror h1,
  .ep-generator-mode .ProseMirror h2,
  .ep-generator-mode .ProseMirror h3,
  .ep-generator-mode .ProseMirror ul,
  .ep-generator-mode .ProseMirror ol,
  .ep-generator-mode .ProseMirror blockquote {
    pointer-events: none;
    user-select: none;
  }
  .ep-generator-mode .ProseMirror img {
    pointer-events: none;
  }
  /* Las tablas de precios SÍ son interactivas */
  .ep-generator-mode .pt-block,
  .ep-generator-mode .pt-block * {
    pointer-events: all !important;
    user-select: auto !important;
  }
  /* Los campos de firma inline también */
  .ep-generator-mode [data-signature-field] {
    pointer-events: all !important;
  }
  /* Las variables resaltadas se pueden clickear */
  .ep-generator-mode .mxd-var-highlight {
    pointer-events: all !important;
    cursor: text;
  }
  /* Borde sutil para indicar zona bloqueada */
  .ep-generator-mode .ProseMirror:focus {
    outline: none;
  }
`

// ── Estilos de paneles derechos ───────────────────────────────
const rp = {
  panel:       { display: 'flex', flexDirection: 'column', height: '100%' },
  panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 10px', borderBottom: '1px solid #e0e2ea', flexShrink: 0 },
  panelTitle:  { fontSize: 14, fontWeight: 700, color: '#1B3055' },
  closeBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 4 },
}
