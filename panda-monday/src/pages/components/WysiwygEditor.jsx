import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import { Image } from '@tiptap/extension-image'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { PricingTable } from './PricingTableExtension.js'
import { VariableHighlight } from './VariableHighlight.js'
import { SignatureField } from './SignatureFieldExtension.jsx'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import ContentLibraryModal from './ContentLibraryModal.jsx'
import api from '../../api/client.js'
import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'

// ── Iconos SVG inline ─────────────────────────────────────────
const B       = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
const I       = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
const U       = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
const AlignL  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
const AlignC  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>
const AlignR  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>
const ListUl  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>
const ListOl  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">1.</text></svg>
const TableIc = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>
const PriceIc = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
const VarIc   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>
const Undo    = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
const Redo    = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
const ImgIc   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
const ColorIc = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
const PageBrIc= () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="4 2"/><path d="M8 8l-4 4 4 4"/><path d="M16 8l4 4-4 4"/></svg>
const LibraryIc= () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
const AIIc     = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
const CustomTableIc = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="9"/><line x1="15" y1="3" x2="15" y2="9"/></svg>

function Btn({ onClick, active, title, children, disabled }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`toolbar-btn${active ? ' is-active' : ''}`}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
const Sep = () => <div className="toolbar-sep" />

// ── Image picker ──────────────────────────────────────────────
function ImagePicker({ onInsert }) {
  const [open, setOpen]   = useState(false)
  const [url, setUrl]     = useState('')
  const fileRef           = useRef(null)

  function insertUrl() {
    const u = url.trim()
    if (u) { onInsert(u); setUrl(''); setOpen(false) }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { onInsert(ev.target.result); setOpen(false) }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={`toolbar-btn${open ? ' is-active' : ''}`}
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }} title="Insertar imagen">
        <ImgIc /> Imagen
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 200,
          background: 'white', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          padding: '12px', width: 280,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Subir archivo</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', marginBottom: 10 }}
            onMouseDown={e => { e.preventDefault(); fileRef.current?.click() }}>
            📁 Seleccionar imagen del equipo
          </button>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>O pegar URL</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input autoFocus className="form-input" placeholder="https://imagen.com/logo.png" value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insertUrl() } if (e.key === 'Escape') setOpen(false) }}
              style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} />
            <button type="button" className="btn btn-primary btn-sm"
              onMouseDown={e => { e.preventDefault(); insertUrl() }}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Variable picker inline ────────────────────────────────────
function VarPicker({ onInsert }) {
  const [open, setOpen] = useState(false)
  const [val, setVal]   = useState('')

  function insert() {
    const v = val.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    if (v) { onInsert(v); setVal(''); setOpen(false) }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={`toolbar-btn${open ? ' is-active' : ''}`}
        title="Insertar variable"
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
        style={{ gap: 4, fontWeight: 600 }}
      >
        <VarIc /> {'{{var}}'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 100,
          background: 'white', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          padding: '10px 12px', display: 'flex', gap: 6, width: 240,
        }}>
          <input
            autoFocus
            className="form-input"
            placeholder="nombre_variable"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insert() } if (e.key === 'Escape') setOpen(false) }}
            style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
          />
          <button type="button" className="btn btn-primary btn-sm" onMouseDown={e => { e.preventDefault(); insert() }}>
            Insertar
          </button>
        </div>
      )}
    </div>
  )
}

// ── IconX (used by CustomTableModal) ─────────────────────────
const IconX = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

// ── Custom Table Builder Modal ────────────────────────────────
const COL_TYPES = [
  { value: 'text',     label: 'Texto' },
  { value: 'number',   label: 'Número' },
  { value: 'dropdown', label: 'Desplegable' },
  { value: 'date',     label: 'Fecha' },
]

function buildTableHtml(columns, rowCount) {
  const headerCells = columns.map(c =>
    `<th style="background:#1B3055;color:white;padding:8px 12px;text-align:left;font-size:13px;font-weight:600;border:1px solid #16294a;">${c.name || 'Columna'}</th>`
  ).join('')

  const dataCells = columns.map(c => {
    if (c.type === 'dropdown') {
      const opts = (c.options || '').split(',').map(o => o.trim()).filter(Boolean)
      const optHtml = opts.map(o => `<option>${o}</option>`).join('')
      return `<td style="padding:6px 10px;border:1px solid #d0d5dd;"><select style="width:100%;border:none;background:transparent;font-size:12px;">${optHtml}</select></td>`
    }
    if (c.type === 'date') {
      return `<td style="padding:6px 10px;border:1px solid #d0d5dd;"><input type="date" style="border:none;background:transparent;font-size:12px;width:100%;" /></td>`
    }
    return `<td contenteditable="true" style="padding:6px 10px;border:1px solid #d0d5dd;min-width:80px;font-size:13px;">&nbsp;</td>`
  }).join('')

  const dataRows = Array.from({ length: rowCount }, (_, i) =>
    `<tr style="${i % 2 === 1 ? 'background:#f8f9fc;' : ''}">${dataCells}</tr>`
  ).join('')

  return `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-family:inherit;"><thead><tr>${headerCells}</tr></thead><tbody>${dataRows}</tbody></table>`
}

function CustomTableModal({ onClose, onInsert }) {
  const [columns, setColumns] = useState([
    { id: 1, name: '', type: 'text', options: '' },
    { id: 2, name: '', type: 'text', options: '' },
  ])
  const [rowCount, setRowCount] = useState(3)
  const nextId = useRef(3)

  function addColumn() {
    setColumns(prev => [...prev, { id: nextId.current++, name: '', type: 'text', options: '' }])
  }
  function removeColumn(id) {
    setColumns(prev => prev.filter(c => c.id !== id))
  }
  function updateColumn(id, field, val) {
    setColumns(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c))
  }
  function handleInsert() {
    if (columns.length === 0) return
    onInsert(buildTableHtml(columns, rowCount))
    onClose()
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 500 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-md" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">Crear tabla personalizada</div>
          <button className="close-btn" onClick={onClose}><IconX /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {columns.map((col, idx) => (
            <div key={col.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, padding: '8px 10px', background: '#f8f9fc', borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: '#888', minWidth: 16, paddingTop: 8 }}>{idx + 1}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="form-input"
                    placeholder="Nombre de columna"
                    value={col.name}
                    onChange={e => updateColumn(col.id, 'name', e.target.value)}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <select
                    className="form-select"
                    value={col.type}
                    onChange={e => updateColumn(col.id, 'type', e.target.value)}
                    style={{ fontSize: 12, width: 130 }}
                  >
                    {COL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {col.type === 'dropdown' && (
                  <input
                    className="form-input"
                    placeholder="Opciones separadas por coma: Opción 1, Opción 2"
                    value={col.options}
                    onChange={e => updateColumn(col.id, 'options', e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => removeColumn(col.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e03e3e', padding: '6px 4px', fontSize: 16, lineHeight: 1 }}
                title="Eliminar columna"
              >×</button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addColumn} style={{ marginTop: 4 }}>
            + Agregar columna
          </button>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>Filas iniciales:</label>
            <select
              className="form-select"
              value={rowCount}
              onChange={e => setRowCount(Number(e.target.value))}
              style={{ fontSize: 12, width: 70 }}
            >
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleInsert} disabled={columns.length === 0}>
            Insertar tabla
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Editor principal ──────────────────────────────────────────
const WysiwygEditor = forwardRef(function WysiwygEditor({ value, onChange, onAIDraft, signers = [], hideToolbar = false }, ref) {
  const [showHtml, setShowHtml]           = useState(false)
  const [ptPickerOpen, setPtPickerOpen]   = useState(false)
  const [libraryOpen, setLibraryOpen]     = useState(false)
  const [aiPrompt, setAiPrompt]           = useState('')
  const [aiOpen, setAiOpen]              = useState(false)
  const [aiLoading, setAiLoading]         = useState(false)
  const [customTableOpen, setCustomTableOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      PricingTable,
      SignatureField,
      VariableHighlight,
      GlobalDragHandle.configure({ dragHandleWidth: 20 }),
      Placeholder.configure({ placeholder: 'Escribe el contenido del documento aquí…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  const insertVar = useCallback((varName) => {
    editor?.chain().focus().insertContent(`{{${varName}}}`).run()
  }, [editor])

  const insertImage = useCallback((src) => {
    editor?.chain().focus().setImage({ src }).run()
  }, [editor])

  // Expose imperative methods for parent components
  useImperativeHandle(ref, () => ({
    replaceVariable(varName, value) {
      if (!editor) return
      const html = editor.getHTML()
      const newHtml = html.replaceAll(`{{${varName}}}`, value || `{{${varName}}}`)
      editor.commands.setContent(newHtml, false)
    },
    applyAllVars(vars) {
      if (!editor) return false  // false = editor no listo todavía
      let html = editor.getHTML()
      let changed = false
      for (const [k, v] of Object.entries(vars)) {
        if (v && html.includes(`{{${k}}}`)) {
          html = html.replaceAll(`{{${k}}}`, v)
          changed = true
        }
      }
      if (changed) editor.commands.setContent(html, false)
      return true  // true = editor listo (aunque no haya habido cambios)
    },
    getEditor() {
      return editor
    },
    insertSignatureField(attrs) {
      if (!editor) return
      editor.chain().focus().insertSignatureField(attrs).run()
    },
    // Extrae posiciones reales de los campos desde el DOM del editor
    getFieldPositions() {
      if (!editor) return []
      const pageEl  = document.querySelector('.ep-page .ProseMirror') ?? editor.view.dom
      const pageRect = pageEl.getBoundingClientRect()
      if (!pageRect.width) return []

      const fields = []
      const fieldEls = editor.view.dom.querySelectorAll('[data-signature-field="true"]')
      fieldEls.forEach(el => {
        const rect = el.getBoundingClientRect()
        fields.push({
          id:          el.dataset.fieldId   || crypto.randomUUID(),
          type:        el.dataset.fieldType || 'signature',
          signerIndex: parseInt(el.dataset.signerIndex ?? '0'),
          signerName:  el.dataset.signerName || '',
          x: Math.max(0, ((rect.left   - pageRect.left) / pageRect.width)  * 100),
          y: Math.max(0, ((rect.top    - pageRect.top)  / pageRect.height) * 100),
          w: Math.max(5,  (rect.width  / pageRect.width)  * 100),
          h: Math.max(2,  (rect.height / pageRect.height) * 100),
          page: 1,
        })
      })
      return fields
    },
  }), [editor])

  if (!editor) return null

  return (
    <div className="wysiwyg-wrap">
      {/* Toolbar */}
      <div className="wysiwyg-toolbar" style={hideToolbar ? { display: 'none' } : {}}>
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrita"><B /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Cursiva"><I /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Subrayado"><U /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Título 1"><span style={{ fontWeight: 700, fontSize: 13 }}>H1</span></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título 2"><span style={{ fontWeight: 700, fontSize: 12 }}>H2</span></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Título 3"><span style={{ fontWeight: 600, fontSize: 11 }}>H3</span></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista"><ListUl /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada"><ListOl /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Alinear izquierda"><AlignL /></Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centrar"><AlignC /></Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Alinear derecha"><AlignR /></Btn>
        <Sep />
        <Btn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insertar tabla"
        ><TableIc /></Btn>
        <Btn
          onClick={() => setCustomTableOpen(true)}
          title="Crear tabla personalizada"
        ><CustomTableIc /> Tabla</Btn>
        <Sep />
        {/* Color de texto */}
        <label className="toolbar-btn" title="Color de texto" style={{ gap: 4, cursor: 'pointer' }}>
          <ColorIc />
          <input type="color" style={{ width: 16, height: 16, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
            onChange={e => editor.chain().focus().setColor(e.target.value).run()} />
        </label>
        <Sep />
        <ImagePicker onInsert={insertImage} />
        <Sep />
        {/* Tabla de precios interactiva — picker de tipo */}
        <div style={{ position: 'relative' }}>
          <Btn onClick={() => setPtPickerOpen(v => !v)} title="Insertar tabla de precios">
            <PriceIc /> Tabla precios
          </Btn>
          {ptPickerOpen && (
            <div className="pt-type-picker">
              {[
                { type: 'renta',         icon: '🚗', label: 'Renta',         desc: 'Tarifa diaria · Mensual · Deducible · Días' },
                { type: 'traslados',     icon: '🔄', label: 'Traslados',     desc: 'Traslado · Entrega · Recolección' },
                { type: 'accesorios',    icon: '🔧', label: 'Accesorios',    desc: 'Accesorio / Servicio · Subtotal' },
                { type: 'generic',       icon: '📋', label: 'Genérico',      desc: 'SKU · Precio/mes · Subtotal' },
                { type: 'personalizada', icon: '⚙️', label: 'Personalizada', desc: 'Columnas definidas por ti · Fila manual' },
              ].map(opt => (
                <button key={opt.type} className="pt-type-picker-item"
                  type="button"
                  onClick={() => {
                    editor.chain().focus().insertPricingTable({ tableType: opt.type }).run()
                    setPtPickerOpen(false)
                  }}>
                  <span className="pt-type-picker-icon">{opt.icon}</span>
                  <div>
                    <div className="pt-type-picker-label">{opt.label}</div>
                    <div className="pt-type-picker-desc">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <Sep />
        <VarPicker onInsert={insertVar} />
        <Sep />
        <Btn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Salto de página (---)"
        ><PageBrIc /> Pág</Btn>
        <Btn onClick={() => setLibraryOpen(true)} title="Biblioteca de contenido">
          <LibraryIc /> Biblioteca
        </Btn>
        {/* Botón de AI */}
        <div style={{ position: 'relative' }}>
          <Btn onClick={() => setAiOpen(v => !v)} title="Generar con IA">
            <AIIc /> IA
          </Btn>
          {aiOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 200, width: 320,
              background: 'white', border: '1px solid var(--border)', borderRadius: 8,
              padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#323338', marginBottom: 8 }}>✨ Generar con Claude</div>
              <textarea
                style={{ width: '100%', minHeight: 72, fontSize: 12, padding: 8, border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                placeholder="Ej: Escribe una sección de términos y condiciones para renta de vehículos"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAiOpen(false); setAiPrompt('') }}>Cancelar</button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={aiLoading || !aiPrompt.trim()}
                  onClick={async () => {
                    setAiLoading(true)
                    try {
                      const res = await api.post('/api/ai/draft', {
                        prompt: aiPrompt,
                        context: editor.getText().slice(0, 500),
                      })
                      editor.chain().focus().insertContent(res.data.content).run()
                      setAiOpen(false); setAiPrompt('')
                    } catch (e) {
                      alert(e.response?.data?.error || 'Error al generar con IA')
                    } finally { setAiLoading(false) }
                  }}
                >
                  {aiLoading ? '⏳ Generando…' : '✨ Generar'}
                </button>
              </div>
            </div>
          )}
        </div>
        <Sep />
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Deshacer"><Undo /></Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rehacer"><Redo /></Btn>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="toolbar-btn"
          onMouseDown={e => { e.preventDefault(); setShowHtml(h => !h) }}
          style={{ fontSize: 11, fontFamily: 'monospace' }}
          title="Ver/editar HTML"
        >
          {showHtml ? 'Ocultar HTML' : '&lt;/&gt; HTML'}
        </button>
      </div>

      {/* Editor area */}
      <div className="wysiwyg-editor">
        <EditorContent editor={editor} />
      </div>

      {/* Content Library modal */}
      {libraryOpen && (
        <ContentLibraryModal
          currentHtml={editor.getHTML()}
          onClose={() => setLibraryOpen(false)}
          onInsert={html => editor.chain().focus().insertContent(html).run()}
        />
      )}

      {/* HTML crudo (toggle) */}
      {showHtml && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <textarea
            className="form-textarea"
            value={editor.getHTML()}
            onChange={e => editor.commands.setContent(e.target.value, false)}
            style={{ border: 'none', borderRadius: 0, minHeight: 160, fontSize: 12, background: '#1e1e2e', color: '#cdd6f4', fontFamily: 'monospace' }}
          />
        </div>
      )}

      {/* Custom table builder modal */}
      {customTableOpen && (
        <CustomTableModal
          onClose={() => setCustomTableOpen(false)}
          onInsert={html => editor.chain().focus().insertContent(html).run()}
        />
      )}
    </div>
  )
})

export default WysiwygEditor
