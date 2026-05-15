/**
 * BlocksSidebar — Panel de bloques arrastrables estilo PandaDoc
 * Cada bloque puede arrastrarse al documento O hacerse clic para insertar en el cursor.
 * Requiere ser usado dentro de un <DndContext> del padre (EditorPage).
 */
import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

// ── Definición de bloques disponibles ────────────────────────
export const BLOCK_GROUPS = [
  {
    label: 'Texto',
    items: [
      { id: 'paragraph', label: 'Párrafo',  icon: '¶',  desc: 'Texto normal',          html: '<p>Escribe aquí…</p>' },
      { id: 'h1',        label: 'Título 1', icon: 'H1', desc: 'Encabezado principal',  html: '<h1>Título</h1>' },
      { id: 'h2',        label: 'Título 2', icon: 'H2', desc: 'Encabezado secundario', html: '<h2>Subtítulo</h2>' },
      { id: 'h3',        label: 'Título 3', icon: 'H3', desc: 'Encabezado terciario',  html: '<h3>Sección</h3>' },
    ],
  },
  {
    label: 'Listas',
    items: [
      { id: 'ul',  label: 'Lista',     icon: '•',  desc: 'Lista con viñetas', html: '<ul><li>Elemento</li></ul>' },
      { id: 'ol',  label: 'Numerada',  icon: '1.', desc: 'Lista numerada',    html: '<ol><li>Elemento</li></ol>' },
    ],
  },
  {
    label: 'Cotizaciones',
    accent: '#F5A000',
    items: [
      { id: 'renta',         label: 'Renta',         icon: '🚗', desc: 'Tarifa diaria · Mensual',  type: 'pricing', tableType: 'renta' },
      { id: 'traslados',     label: 'Traslados',     icon: '🔄', desc: 'Traslado · Entrega',       type: 'pricing', tableType: 'traslados' },
      { id: 'accesorios',    label: 'Accesorios',    icon: '🔧', desc: 'Accesorio / Servicio',     type: 'pricing', tableType: 'accesorios' },
      { id: 'generic',       label: 'Genérico',      icon: '📋', desc: 'SKU · Precio/mes',         type: 'pricing', tableType: 'generic' },
      { id: 'personalizada', label: 'Personalizada', icon: '⚙️', desc: 'Columnas definidas',       type: 'pricing', tableType: 'personalizada' },
    ],
  },
  {
    label: 'Medios',
    items: [
      { id: 'image', label: 'Imagen', icon: '🖼️', desc: 'Insertar imagen por URL', type: 'image' },
    ],
  },
  {
    label: 'Elementos',
    items: [
      { id: 'divider',    label: 'Separador',    icon: '─', desc: 'Línea horizontal',    html: '<hr />' },
      { id: 'pagebreak',  label: 'Salto de pág.',icon: '↵', desc: 'Nueva página en PDF', html: '<div style="page-break-after:always;height:1px;border-top:2px dashed #c0c0c0;margin:16px 0;"></div>' },
    ],
  },
]

// ── Item arrastrable individual ───────────────────────────────
function DraggableItem({ item, onInsert }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `sidebar-${item.id}`,
    data: { fromSidebar: true, blockItem: item },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.45 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: 'none' }}
    >
      <button
        style={s.item}
        title={`Arrastra al documento o clic para insertar — ${item.desc}`}
        onClick={() => !isDragging && onInsert(item)}
        onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
        onMouseLeave={e => e.currentTarget.style.background = 'white'}
        {...listeners}
        {...attributes}
      >
        <span style={s.itemIcon}>{item.icon}</span>
        <div style={s.itemText}>
          <div style={s.itemLabel}>{item.label}</div>
          <div style={s.itemDesc}>{item.desc}</div>
        </div>
        {/* Handle visual de drag */}
        <span style={s.dragHandle} title="Arrastra">⠿</span>
      </button>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function BlocksSidebar({ editorRef, onClose, style: styleProp }) {
  const [search,    setSearch]    = useState('')
  const [collapsed, setCollapsed] = useState({})

  const q = search.trim().toLowerCase()

  const filteredGroups = BLOCK_GROUPS.map(g => ({
    ...g,
    items: q
      ? g.items.filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q))
      : g.items,
  })).filter(g => g.items.length > 0)

  function toggleGroup(label) {
    setCollapsed(p => ({ ...p, [label]: !p[label] }))
  }

  function handleInsert(item) {
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

  return (
    <div style={{ ...s.sidebar, ...styleProp }}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>Bloques</span>
        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>arrastra o clic</span>
        {onClose && (
          <button onClick={onClose} style={s.closeBtn} title="Ocultar panel">‹</button>
        )}
      </div>

      {/* Búsqueda */}
      <div style={s.searchWrap}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar bloque…"
          style={s.searchInput}
        />
        {search && (
          <button onClick={() => setSearch('')} style={s.clearBtn}>×</button>
        )}
      </div>

      {/* Grupos */}
      <div style={s.groups}>
        {filteredGroups.map(group => (
          <div key={group.label} style={s.group}>
            <button style={s.groupHeader} onClick={() => toggleGroup(group.label)}>
              <span style={{ ...s.groupLabel, color: group.accent ?? '#9699a6' }}>
                {group.label.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: '#c0c4cc' }}>
                {collapsed[group.label] ? '▶' : '▼'}
              </span>
            </button>

            {!collapsed[group.label] && (
              <div style={s.items}>
                {group.items.map(item => (
                  <DraggableItem
                    key={item.id}
                    item={item}
                    onInsert={handleInsert}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
            Sin resultados para "{search}"
          </div>
        )}
      </div>

      <div style={s.footer}>
        Arrastra al documento o clic para insertar en cursor
      </div>
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────
const s = {
  sidebar:    { width: 200, minWidth: 200, display: 'flex', flexDirection: 'column', background: '#fafbfc', borderRight: '1px solid #e0e2ea', overflow: 'hidden', flexShrink: 0 },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: '1px solid #e0e2ea', flexShrink: 0 },
  headerTitle:{ fontSize: 13, fontWeight: 700, color: '#1B3055' },
  closeBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 },
  searchWrap: { position: 'relative', padding: '8px 10px', borderBottom: '1px solid #f0f1f5', flexShrink: 0 },
  searchInput:{ width: '100%', padding: '5px 24px 5px 8px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 12, outline: 'none', background: 'white', boxSizing: 'border-box', color: '#323338' },
  clearBtn:   { position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 16, lineHeight: 1, padding: 0 },
  groups:     { flex: 1, overflowY: 'auto', padding: '4px 0' },
  group:      { marginBottom: 2 },
  groupHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '5px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  groupLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6 },
  items:      { display: 'flex', flexDirection: 'column', gap: 1, padding: '2px 8px 6px' },
  item:       { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', border: '1px solid transparent', borderRadius: 8, cursor: 'grab', background: 'white', textAlign: 'left', transition: 'background 0.1s', width: '100%' },
  itemIcon:   { fontSize: 15, width: 24, textAlign: 'center', flexShrink: 0, fontWeight: 700, color: '#1B3055', fontFamily: 'Georgia, serif' },
  itemText:   { flex: 1, minWidth: 0 },
  itemLabel:  { fontSize: 12, fontWeight: 600, color: '#323338', lineHeight: 1.3 },
  itemDesc:   { fontSize: 10, color: '#94a3b8', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dragHandle: { fontSize: 13, color: '#c0c4cc', flexShrink: 0, cursor: 'grab', userSelect: 'none' },
  footer:     { padding: '8px 12px', borderTop: '1px solid #f0f1f5', fontSize: 10, color: '#94a3b8', textAlign: 'center', flexShrink: 0 },
}
