/**
 * MondayVariablesPanel — Variables de Monday.com para plantillas
 *
 * Usa el backend como proxy para Monday GraphQL → funciona en cualquier contexto
 * (iframe de Monday, nueva pestaña, ngrok, etc.)
 *
 * Clic en una variable la inserta en el cursor del editor.
 * Las variables detectadas en el documento aparecen marcadas.
 */
import { useState, useEffect } from 'react'
import api from '../../api/client.js'

// ── Icons ─────────────────────────────────────────────────────
const IcoX      = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IcoSearch = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

// Ícono por tipo de columna
function TypeIcon({ type }) {
  const map = {
    text:       '𝐓', long_text: '¶', email: '@', phone: '📱',
    numbers:    '#', date: '📅', dropdown: '▾', status: '●',
    people:     '👤', formula: '⨍', link: '🔗', location: '📍',
    checkbox:   '☑', timeline: '⇔', hour: '⏱', country: '🌎',
    name:       '𝐓',
  }
  return <span style={{ fontSize: 11, width: 16, textAlign: 'center', flexShrink: 0, color: '#9699a6' }}>{map[type] ?? '○'}</span>
}

export default function MondayVariablesPanel({ boardId: boardIdProp, itemId, editorRef, onClose }) {
  const [columns,      setColumns]      = useState([])
  const [itemData,     setItemData]     = useState({})
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [noToken,      setNoToken]      = useState(false)
  const [search,       setSearch]       = useState('')
  const [inserted,     setInserted]     = useState(null)
  const [allBoards,    setAllBoards]    = useState([])
  const [selectedBoard, setSelectedBoard] = useState(boardIdProp || '')

  // Variables que ya existen en el documento (para marcarlas)
  const [docVars, setDocVars] = useState(new Set())

  // Cargar lista de boards si no viene boardId del contexto
  useEffect(() => {
    api.get('/api/monday/boards')
      .then(r => {
        setAllBoards(r.data.boards ?? [])
        setNoToken(!!r.data.noToken)
        // Si no hay boardId del contexto, usar el primero disponible
        if (!boardIdProp && r.data.boards?.length > 0) {
          setSelectedBoard(r.data.boards[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Cuando cambia el board seleccionado, cargar columnas
  const activeBoardId = selectedBoard || boardIdProp
  useEffect(() => {
    if (!activeBoardId) return
    setLoading(true); setError(null)

    // Si ya tenemos los boards cargados, usar las columnas del board seleccionado
    const cached = allBoards.find(b => b.id === activeBoardId)
    if (cached) {
      setColumns(cached.columns ?? [])
      setLoading(false)
      return
    }

    api.get(`/api/monday/board/${activeBoardId}/columns`)
      .then(r => {
        setColumns(r.data.columns ?? [])
        setNoToken(!!r.data.noToken)
      })
      .catch(e => setError(e.response?.data?.error || 'Error cargando columnas'))
      .finally(() => setLoading(false))
  }, [activeBoardId, allBoards])

  useEffect(() => {
    if (!activeBoardId || !itemId) return
    api.get(`/api/monday/board/${activeBoardId}/item/${itemId}`)
      .then(r => setItemData(r.data.values ?? {}))
      .catch(() => {})
  }, [activeBoardId, itemId])

  // Escanear el documento para saber qué variables ya están insertadas
  useEffect(() => {
    try {
      const editor = editorRef?.current?.getEditor?.()
      if (!editor) return
      const html = editor.getHTML()
      const matches = [...html.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])
      setDocVars(new Set(matches))
    } catch {}
  }, [editorRef])

  function insertVar(varName) {
    const editor = editorRef?.current?.getEditor?.()
    if (editor) {
      editor.chain().focus().insertContent(`{{${varName}}}`).run()
      // Actualizar conjunto de vars del doc
      setDocVars(prev => new Set([...prev, varName]))
    } else {
      // Fallback: copiar al portapapeles
      navigator.clipboard.writeText(`{{${varName}}}`).catch(() => {})
    }
    setInserted(varName)
    setTimeout(() => setInserted(null), 1800)
  }

  function applyAll() {
    const editor = editorRef?.current?.getEditor?.()
    if (!editor || !Object.keys(itemData).length) return
    columns.forEach(col => {
      const val = itemData[col.varName]
      if (val) {
        editor.chain().focus().run() // foco primero
        editorRef.current?.replaceVariable?.(col.varName, val)
      }
    })
  }

  const filtered = columns.filter(c =>
    !search ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.varName.toLowerCase().includes(search.toLowerCase())
  )

  const hasValues = Object.keys(itemData).length > 0

  return (
    <div style={s.panel}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>Variables</span>
        {noToken && (
          <span title="MONDAY_API_TOKEN no configurado" style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 10, cursor: 'help' }}>
            sin token
          </span>
        )}
        {onClose && <button onClick={onClose} style={s.closeBtn}><IcoX /></button>}
      </div>

      {/* Selector de tablero */}
      {allBoards.length > 0 && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid #f0f1f5', flexShrink: 0 }}>
          <select
            value={selectedBoard}
            onChange={e => { setSelectedBoard(e.target.value); setItemData({}) }}
            style={{ width: '100%', fontSize: 11, padding: '4px 6px', border: '1px solid #e0e2ea', borderRadius: 6, background: 'white', color: '#323338' }}
          >
            {!selectedBoard && <option value="">— Selecciona un tablero —</option>}
            {allBoards.filter(b => !b.name.toLowerCase().includes('subelement')).map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {!activeBoardId ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔗</div>
          <div style={{ fontWeight: 600, color: '#323338', marginBottom: 4 }}>Selecciona un tablero</div>
          <div>Elige el tablero de Monday cuyas columnas quieres usar como variables.</div>
        </div>
      ) : (
        <>
          {/* Buscador */}
          <div style={s.searchWrap}>
            <IcoSearch />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar variable…"
              style={s.searchInput}
            />
            {search && <button onClick={() => setSearch('')} style={s.clearBtn}>×</button>}
          </div>

          {/* Aplicar todos si hay valores del item */}
          {hasValues && (
            <div style={s.applyBar}>
              <span style={{ fontSize: 11, color: '#676879' }}>
                {Object.keys(itemData).filter(k => itemData[k]).length} valores cargados del ítem
              </span>
              <button onClick={applyAll} style={s.applyBtn}>
                ⚡ Aplicar todos
              </button>
            </div>
          )}

          <div style={s.hint}>
            Clic en una variable para insertarla en el cursor del editor.
          </div>

          {/* Lista de variables */}
          {loading ? (
            <div style={s.loading}>
              <span className="spinner-sm" /> Cargando columnas de Monday…
            </div>
          ) : error ? (
            <div style={{ padding: '12px', fontSize: 12, color: '#e03e3e' }}>{error}</div>
          ) : (
            <div style={s.list}>
              {filtered.map(col => {
                const val       = itemData[col.varName]
                const isIn      = docVars.has(col.varName)
                const isInserted = inserted === col.varName
                return (
                  <button
                    key={col.id}
                    style={{
                      ...s.varRow,
                      background: isInserted ? '#f0fdf4' : isIn ? '#fafbff' : 'white',
                      borderColor: isIn ? '#bfdbfe' : 'transparent',
                    }}
                    onClick={() => insertVar(col.varName)}
                    onMouseEnter={e => { if (!isInserted) e.currentTarget.style.background = '#f0f7ff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = isInserted ? '#f0fdf4' : isIn ? '#fafbff' : 'white' }}
                    title={`Insertar {{${col.varName}}}${val ? ` → "${val}"` : ''}`}
                  >
                    <TypeIcon type={col.type} />

                    <div style={s.varCenter}>
                      <code style={s.varCode}>{`{{${col.varName}}}`}</code>
                      <div style={s.varTitle}>{col.title}</div>
                    </div>

                    <div style={s.varRight}>
                      {isInserted ? (
                        <span style={{ color: '#22c55e', fontSize: 11, fontWeight: 600 }}>✓</span>
                      ) : isIn ? (
                        <span style={{ color: '#0073ea', fontSize: 10 }}>en doc</span>
                      ) : val ? (
                        <span style={s.varValue}>{val.length > 18 ? val.slice(0, 18) + '…' : val}</span>
                      ) : (
                        <span style={s.varEmpty}>—</span>
                      )}
                    </div>
                  </button>
                )
              })}

              {filtered.length === 0 && (
                <div style={s.noResults}>Sin resultados para "{search}"</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────
const s = {
  panel:       { display: 'flex', flexDirection: 'column', height: '100%', background: '#fafbfc', overflow: 'hidden' },
  header:      { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', padding: '12px 14px 10px', borderBottom: '1px solid #e0e2ea', flexShrink: 0 },
  headerTitle: { fontSize: 14, fontWeight: 700, color: '#1B3055', flex: 1 },
  closeBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 4 },
  searchWrap:  { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #f0f1f5', flexShrink: 0, position: 'relative' },
  searchInput: { flex: 1, padding: '5px 24px 5px 6px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 12, outline: 'none', background: 'white', color: '#323338' },
  clearBtn:    { position: 'absolute', right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 16, lineHeight: 1, padding: 0 },
  applyBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f0f7ff', borderBottom: '1px solid #bfdbfe', flexShrink: 0 },
  applyBtn:    { fontSize: 11, fontWeight: 600, color: '#0073ea', background: 'none', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' },
  hint:        { padding: '5px 10px', fontSize: 11, color: '#94a3b8', borderBottom: '1px solid #f0f1f5', flexShrink: 0 },
  loading:     { display: 'flex', alignItems: 'center', gap: 8, padding: '16px 12px', fontSize: 12, color: '#9699a6' },
  list:        { flex: 1, overflowY: 'auto', padding: '4px 8px 8px' },
  varRow:      { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 8px', border: '1px solid transparent', borderRadius: 7, cursor: 'pointer', textAlign: 'left', marginBottom: 2, transition: 'background 0.1s' },
  varCenter:   { flex: 1, minWidth: 0 },
  varCode:     { display: 'block', fontSize: 11, color: '#1B3055', background: '#e8edf5', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  varTitle:    { fontSize: 10, color: '#676879', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  varRight:    { flexShrink: 0, textAlign: 'right', minWidth: 36 },
  varValue:    { fontSize: 10, color: '#94a3b8', fontStyle: 'italic', display: 'block', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  varEmpty:    { fontSize: 11, color: '#e2e8f0' },
  emptyState:  { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8', gap: 4 },
  noResults:   { padding: '12px 8px', fontSize: 12, color: '#9699a6', textAlign: 'center' },
}
