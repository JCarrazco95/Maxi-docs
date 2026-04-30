import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useCallback } from 'react'

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
const VarIc   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>
const Undo    = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
const Redo    = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>

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

// ── Editor principal ──────────────────────────────────────────
export default function WysiwygEditor({ value, onChange }) {
  const [showHtml, setShowHtml] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Escribe el contenido del documento aquí…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  const insertVar = useCallback((varName) => {
    editor?.chain().focus().insertContent(`{{${varName}}}`).run()
  }, [editor])

  if (!editor) return null

  return (
    <div className="wysiwyg-wrap">
      {/* Toolbar */}
      <div className="wysiwyg-toolbar">
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
        <Sep />
        <VarPicker onInsert={insertVar} />
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
    </div>
  )
}
