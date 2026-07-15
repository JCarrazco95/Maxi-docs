import { useState, useEffect, useRef, Component } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { decodeItems, encodeItems, decodeColumns, encodeColumns } from './PricingTableExtension.js'
import CatalogPickerModal from './CatalogPickerModal.jsx'

// Error boundary para evitar que un crash de la tabla deje la app en blanco
class TableErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ border: '2px solid #e03e3e', borderRadius: 8, padding: '12px 16px', margin: '8px 0', background: '#fff5f5', color: '#e03e3e', fontSize: 12 }}>
        ⚠️ Error en la tabla — recarga el editor o elimina y vuelve a insertar esta tabla.
        <br/><small>{this.state.error.message}</small>
      </div>
    )
    return this.props.children
  }
}

const fmt = n => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const VEHICLE_OPTIONS = [
  'Pick up 4x4', 'Pick up doble cabina', 'Camioneta SUV', 'Camioneta 4x4',
  'NP 300 Redilas', 'NP 300 Caja Seca', 'NP 300 EST.C',
  'Hiace 12 pasajeros', 'Hiace 15 pasajeros',
  'Coaster', 'Urvan', 'Sprinter', 'Corolla', 'Avanza', 'Rush',
  'Pickup Estacas', 'Camión 3.5 ton', 'Camión 5 ton',
]

const IconPlus  = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconMinus = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const IconEdit  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

function rowSubtotal(item, tableType) {
  const qty    = item.quantity || 1
  const disc   = Math.min(Math.max(Number(item.discount) || 0, 0), 100)
  const factor = 1 - disc / 100
  if (tableType === 'tarifas') {
    // Deducible es solo informativo — no suma al total
    return (Number(item.dailyRate) || 0) * 30 * qty
  }
  if (tableType === 'traslados')
    return ((Number(item.price) || 0) + (Number(item.delivery) || 0) + (Number(item.retrieval) || 0)) * qty * factor
  return (Number(item.price) || 0) * qty * factor
}

function manualRowDefaults(tableType) {
  const base = { id: Date.now(), name: '', price: 0, quantity: 1, sku: '' }
  if (tableType === 'tarifas')   return { ...base, dailyRate: 0, deductible: 10, delivery: 0, retrieval: 0 }
  if (tableType === 'acuerdo')   return { id: Date.now(), name: '', subtotal: 0, ivaPct: 16 }
  if (tableType === 'renta')     return { ...base, dailyRate: 0, deductible: 10, days: 30 }
  if (tableType === 'traslados') return { ...base, delivery: 0, retrieval: 0 }
  return base
}

function typeDefaults(tableType) {
  if (tableType === 'tarifas')   return { dailyRate: 0, deductible: 10, delivery: 0, retrieval: 0 }
  if (tableType === 'acuerdo')   return { subtotal: 0, ivaPct: 16 }
  if (tableType === 'renta')     return { dailyRate: null, deductible: 10, days: 30 }
  if (tableType === 'traslados') return { delivery: 0, retrieval: 0 }
  return {}
}

const COLS = {
  // Tipo de unidad más ancha (2fr), campos numéricos ajustados
  tarifas:    { grid: '2fr 60px 84px 116px 126px 104px 104px 40px', headers: ['TIPO DE UNIDAD', 'CANT.', 'DEDUCIBLE', 'RENTA DIARIA', 'RENTA MENSUAL', 'ENTREGA', 'RECOLECCIÓN', ''], align: ['left', 'center', 'center', 'right', 'right', 'right', 'right', 'center'] },
  // ADECUACIONES: sin DESC.%, columnas renombradas
  accesorios: { grid: '84px 1fr 136px 136px 40px', headers: ['CANTIDAD', 'DESCRIPCIÓN', 'PRECIO POR UNIDAD', 'SUBTOTAL', ''], align: ['center', 'left', 'right', 'right', 'center'] },
  // Valor del acuerdo: descripcion + subtotal manual + IVA calc + Total calc
  acuerdo:    { grid: '1fr 136px 136px 136px 40px', headers: ['DESCRIPCIÓN', 'SUBTOTAL', 'IVA', 'TOTAL', ''], align: ['left', 'right', 'right', 'right', 'center'] },
  renta:      { grid: '64px 1fr 116px 126px 78px 64px 72px 116px 40px', headers: ['CANTIDAD', 'TIPO DE UNIDAD', 'TARIFA DIARIA', 'TARIFA MENSUAL', 'DEDUCIBLE', 'DÍAS', 'DESC.%', 'SUBTOTAL', ''], align: ['center', 'left', 'right', 'right', 'center', 'center', 'center', 'right', 'center'] },
  traslados:  { grid: '64px 1fr 126px 96px 116px 72px 116px 40px', headers: ['CANTIDAD', 'TIPO UNIDAD', 'TRASLADO', 'ENTREGA', 'RECOLECCIÓN', 'DESC.%', 'SUBTOTAL', ''], align: ['center', 'left', 'right', 'right', 'right', 'center', 'right', 'center'] },
  generic:    { grid: '104px 1fr 116px 126px 72px 126px 40px', headers: ['CANT.', 'SERVICIO / UNIDAD', 'SKU', 'PRECIO/MES', 'DESC.%', 'SUBTOTAL', ''], align: ['center', 'left', 'left', 'right', 'center', 'right', 'center'] },
}

/**
 * Input numérico estable — definido FUERA del componente padre para que React
 * no lo desmonte en cada re-render y el usuario pueda escribir libremente.
 * onSave se llama al cambiar (para las flechas) y en onBlur (para teclado).
 */
function NumInput({ value, onSave, w, min = '0', step = '0.01' }) {
  const inputRef = useRef(null)
  const isFocused = useRef(false)

  // Sincronizar desde afuera solo cuando el input no tiene el foco
  useEffect(() => {
    const el = inputRef.current
    if (el && !isFocused.current) {
      el.value = value != null ? String(value) : '0'
    }
  }, [value])

  return (
    <input
      ref={inputRef}
      type="number"
      min={min}
      step={step}
      defaultValue={value ?? 0}
      className="pt-num-input"
      style={w ? { width: w } : {}}
      onFocus={e => {
        isFocused.current = true
        e.target.select()       // selecciona todo para reemplazar de un golpe
      }}
      onChange={e => {
        // Guardar inmediatamente en cambios de flechas/spinner
        const n = parseFloat(e.target.value)
        if (!isNaN(n)) onSave(n)
      }}
      onBlur={e => {
        isFocused.current = false
        const n = parseFloat(e.target.value)
        if (isNaN(n)) {
          e.target.value = String(value ?? 0)   // revertir si quedó vacío
        } else {
          onSave(n)
        }
      }}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') e.target.blur()  // confirmar con Enter
      }}
    />
  )
}

function PricingTableViewInner({ node, updateAttributes, selected, editor }) {
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]   = useState(node.attrs.title)
  const [colEditorOpen, setColEditorOpen] = useState(false)

  // Fuerza re-render del tipo "acuerdo" cuando cualquier tabla del documento cambia
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    if (!editor || node.attrs.tableType !== 'acuerdo') return
    const handler = () => forceUpdate(v => v + 1)
    editor.on('update', handler)
    return () => editor.off('update', handler)
  }, [editor, node.attrs.tableType])

  const { title, itemsB64, ivaRate, tableType = 'renta', columnsB64 } = node.attrs
  const items   = decodeItems(itemsB64)
  const cols    = COLS[tableType] ?? COLS.generic
  const customCols = tableType === 'personalizada' ? decodeColumns(columnsB64) : []

  function saveItems(next) { updateAttributes({ itemsB64: encodeItems(next) }) }
  function saveTitle()     { updateAttributes({ title: titleDraft }); setEditingTitle(false) }

  // Cantidad
  function setQty(id, delta) {
    saveItems(items.map(i => i.id === id ? { ...i, quantity: Math.max(0, (i.quantity || 1) + delta) } : i).filter(i => i.quantity > 0))
  }
  function setQtyDirect(id, val) {
    const n = Math.max(0, parseInt(val) || 0)
    if (n === 0) saveItems(items.filter(i => i.id !== id))
    else saveItems(items.map(i => i.id === id ? { ...i, quantity: n } : i))
  }
  function setField(id, field, val) {
    const n = parseFloat(val)
    saveItems(items.map(i => i.id === id ? { ...i, [field]: isNaN(n) ? val : n } : i))
  }
  function setFieldText(id, field, val) {
    saveItems(items.map(i => i.id === id ? { ...i, [field]: val } : i))
  }
  function removeItem(id) { saveItems(items.filter(i => i.id !== id)) }
  function addManualRow()  { saveItems([...items, manualRowDefaults(tableType)]) }

  // Catálogo
  function handleCatalogConfirm({ items: picked, ivaRate: newIva }) {
    const existing = new Map(items.map(i => [i.id, { ...i }]))
    const defaults = typeDefaults(tableType)
    picked.forEach(p => {
      if (existing.has(p.id)) {
        existing.get(p.id).quantity = p.quantity
      } else {
        const base = { ...p, ...defaults }
        // Para tipo "tarifas": price del catálogo ES la renta diaria directamente
        if (tableType === 'tarifas') {
          base.dailyRate = Number(p.price) || 0
          delete base.price
        }
        existing.set(p.id, base)
      }
    })
    saveItems([...existing.values()])
    if (tableType !== 'tarifas') updateAttributes({ ivaRate: newIva })
    setCatalogOpen(false)
  }

  const subtotal = items.reduce((s, i) => s + rowSubtotal(i, tableType), 0)
  const iva      = subtotal * (ivaRate / 100)
  const total    = subtotal + iva

  // ── Inputs reutilizables ────────────────────────────────────────
  // NumInput ahora está definido fuera del componente (ver arriba) para
  // que React no lo desmonte en cada re-render. Solo usamos TextInput aquí.

  const TextInput = ({ id, field, value, placeholder, list }) => (
    <>
      <input type="text" value={value ?? ''} placeholder={placeholder}
        className="pt-text-input"
        list={list}
        onChange={e => setFieldText(id, field, e.target.value)}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()} />
      {list && (
        <datalist id={list}>
          {VEHICLE_OPTIONS.map(v => <option key={v} value={v} />)}
        </datalist>
      )}
    </>
  )

  // ── Render fila según tipo ────────────────────────────────────────
  function renderRow(item) {
    const qty = item.quantity || 1

    // ── TIPO TARIFAS ────────────────────────────────────────────
    if (tableType === 'tarifas') {
      const diaria  = Number(item.dailyRate) || 0
      const mensual = diaria * 30 * qty

      return (
        <div key={item.id} className="pt-row" style={{ gridTemplateColumns: cols.grid }}>
          {/* Tipo de unidad */}
          <div className="pt-c-name">
            <TextInput id={item.id} field="name" value={item.name}
              placeholder="Tipo de unidad…" list={`vehicles-tf-${item.id}`} />
          </div>

          {/* Cant */}
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
            <NumInput value={item.quantity ?? 1} onSave={n => setField(item.id, 'quantity', n)}
              min="1" step="1" w={36} />
          </div>

          {/* Deducible % */}
          <div style={{ display:'flex', alignItems:'center', gap:2 }}>
            <NumInput value={item.deductible ?? 10} onSave={n => setField(item.id, 'deductible', n)}
              min="0" step="1" w={40} />
            <span style={{ fontSize: 11, color: '#676879' }}>%</span>
          </div>

          {/* Renta diaria $ */}
          <div style={{ display:'flex', alignItems:'center', gap:2, justifyContent:'flex-end', paddingRight: 4 }}>
            <span style={{ fontSize: 11, color: '#676879' }}>$</span>
            <NumInput value={item.dailyRate ?? 0} onSave={n => setField(item.id, 'dailyRate', n)} w={78} />
          </div>

          {/* Renta mensual — solo lectura */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end',
            paddingRight: 8, fontWeight: 700, color: '#1B3055', fontSize: 12 }}>
            {fmt(mensual)}
          </div>

          {/* Entrega $ */}
          <div style={{ display:'flex', alignItems:'center', gap:2, justifyContent:'flex-end', paddingRight: 4 }}>
            <span style={{ fontSize: 11, color: '#676879' }}>$</span>
            <NumInput value={item.delivery ?? 0} onSave={n => setField(item.id, 'delivery', n)} w={68} />
          </div>

          {/* Recolección $ */}
          <div style={{ display:'flex', alignItems:'center', gap:2, justifyContent:'flex-end', paddingRight: 4 }}>
            <span style={{ fontSize: 11, color: '#676879' }}>$</span>
            <NumInput value={item.retrieval ?? 0} onSave={n => setField(item.id, 'retrieval', n)} w={68} />
          </div>

          {/* Eliminar */}
          <div className="pt-c-del">
            <button type="button" className="pt-del-btn" onClick={() => removeItem(item.id)}>
              <IconTrash />
            </button>
          </div>
        </div>
      )
    }

    // El tipo 'acuerdo' se renderiza completo afuera del loop — ver bloque especial más abajo

    const qtyCell = (
      <div className="pt-c-qty">
        <div className="pt-qty-wrap">
          <button type="button" className="pt-qty-btn" onClick={() => setQty(item.id, -1)}><IconMinus /></button>
          <input type="number" min="1" value={qty} className="pt-qty-input"
            onChange={e => setQtyDirect(item.id, e.target.value)}
            onKeyDown={e => e.stopPropagation()} />
          <button type="button" className="pt-qty-btn" onClick={() => setQty(item.id, 1)}><IconPlus /></button>
        </div>
      </div>
    )
    const delCell = (
      <div className="pt-c-del">
        <button type="button" className="pt-del-btn" onClick={() => removeItem(item.id)}>
          <IconTrash />
        </button>
      </div>
    )

    const discCell = (id, discount) => (
      <div className="pt-c-deductible">
        <input type="number" min="0" max="100" step="1" className="pt-pct-input"
          value={discount ?? 0}
          onChange={e => setField(id, 'discount', e.target.value)}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()} />
        <span className="pt-pct-symbol">%</span>
      </div>
    )

    if (tableType === 'renta') return (
      <div key={item.id} className="pt-row" style={{ gridTemplateColumns: cols.grid }}>
        {qtyCell}
        <div className="pt-c-name">
          <TextInput id={item.id} field="name" value={item.name}
            placeholder="Tipo de unidad…" list={`vehicles-${item.id}`} />
        </div>
        <div className="pt-c-price">
          <NumInput
            value={item.dailyRate != null ? item.dailyRate : (item.price || 0) / 30}
            onSave={n => setField(item.id, 'dailyRate', n)} />
        </div>
        <div className="pt-c-price">
          <NumInput value={item.price ?? 0} onSave={n => setField(item.id, 'price', n)} />
        </div>
        <div className="pt-c-deductible">
          <NumInput value={item.deductible ?? 10} onSave={n => setField(item.id, 'deductible', n)}
            min="0" step="1" w={40} />
          <span className="pt-pct-symbol">%</span>
        </div>
        <div className="pt-c-deductible">
          <NumInput value={item.days ?? 30} onSave={n => setField(item.id, 'days', n)}
            min="1" step="1" w={36} />
        </div>
        {discCell(item.id, item.discount)}
        <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt(rowSubtotal(item, 'renta'))}</div>
        {delCell}
      </div>
    )

    if (tableType === 'traslados') return (
      <div key={item.id} className="pt-row" style={{ gridTemplateColumns: cols.grid }}>
        {qtyCell}
        <div className="pt-c-name">
          <TextInput id={item.id} field="name" value={item.name}
            placeholder="Tipo de unidad…" list={`vehicles-tl-${item.id}`} />
        </div>
        <div className="pt-c-price">
          <NumInput value={item.price ?? 0} onSave={n => setField(item.id, 'price', n)} />
        </div>
        <div className="pt-c-price">
          <NumInput value={item.delivery ?? 0} onSave={n => setField(item.id, 'delivery', n)} />
        </div>
        <div className="pt-c-price">
          <NumInput value={item.retrieval ?? 0} onSave={n => setField(item.id, 'retrieval', n)} />
        </div>
        {discCell(item.id, item.discount)}
        <div className="pt-c-subtotal pt-cell-num pt-cell-bold">
          {fmt(rowSubtotal(item, 'traslados'))}
        </div>
        {delCell}
      </div>
    )

    if (tableType === 'accesorios') return (
      <div key={item.id} className="pt-row" style={{ gridTemplateColumns: cols.grid }}>
        {qtyCell}
        <div className="pt-c-name">
          <TextInput id={item.id} field="name" value={item.name} placeholder="Descripción…" />
        </div>
        <div className="pt-c-price">
          <NumInput value={item.price ?? 0} onSave={n => setField(item.id, 'price', n)} />
        </div>
        <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt((item.price||0)*(item.quantity||1))}</div>
        {delCell}
      </div>
    )

    // personalizada — columnas dinámicas
    if (tableType === 'personalizada') {
      const gridCols = customCols.length > 0
        ? `52px ${customCols.map(() => '1fr').join(' ')} 36px`
        : '52px 1fr 36px'
      return (
        <div key={item.id} className="pt-row" style={{ gridTemplateColumns: gridCols }}>
          {qtyCell}
          {customCols.map(col => (
            <div key={col.id} className="pt-c-name">
              {col.type === 'number'
                ? <NumInput
                    value={Number(item[col.id] ?? 0)}
                    onSave={n => setField(item.id, col.id, n)} />
                : col.type === 'dropdown'
                  ? <select
                      className="pt-text-input"
                      value={item[col.id] ?? ''}
                      onChange={e => setFieldText(item.id, col.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => e.stopPropagation()}
                    >
                      <option value="">— elegir —</option>
                      {(col.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  : <TextInput id={item.id} field={col.id} value={item[col.id] ?? ''} placeholder={col.name} />
              }
            </div>
          ))}
          {delCell}
        </div>
      )
    }

    // generic
    return (
      <div key={item.id} className="pt-row" style={{ gridTemplateColumns: cols.grid }}>
        {qtyCell}
        <div className="pt-c-name">
          <TextInput id={item.id} field="name" value={item.name} placeholder="Nombre…" />
        </div>
        <div className="pt-c-sku">
          <TextInput id={item.id} field="sku" value={item.sku} placeholder="SKU" />
        </div>
        <div className="pt-c-price">
          <NumInput value={item.price ?? 0} onSave={n => setField(item.id, 'price', n)} />
        </div>
        {discCell(item.id, item.discount)}
        <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt(rowSubtotal(item, 'generic'))}</div>
        {delCell}
      </div>
    )
  }

  // ── Modal editor de columnas ──────────────────────────────────
  function ColumnEditor() {
    const [draftCols, setDraftCols] = useState(
      customCols.length > 0 ? customCols : [{ id: `c${Date.now()}`, name: 'Columna 1', type: 'text', options: [] }]
    )
    function addCol() {
      setDraftCols(p => [...p, { id: `c${Date.now()}`, name: `Columna ${p.length + 1}`, type: 'text', options: [] }])
    }
    function removeCol(id) { setDraftCols(p => p.filter(c => c.id !== id)) }
    function updateCol(id, field, val) {
      setDraftCols(p => p.map(c => c.id === id ? { ...c, [field]: val } : c))
    }
    function save() {
      const cols = draftCols.filter(c => c.name.trim())
      updateAttributes({ columnsB64: encodeColumns(cols) })
      setColEditorOpen(false)
    }
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 560, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1B3055', marginBottom: 16 }}>Configurar columnas</div>
          {draftCols.map((col, i) => (
            <div key={col.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr 30px', gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <input value={col.name} placeholder={`Columna ${i + 1}`}
                onChange={e => updateCol(col.id, 'name', e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 13 }} />
              <select value={col.type} onChange={e => updateCol(col.id, 'type', e.target.value)}
                style={{ padding: '6px 8px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 13 }}>
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="dropdown">Dropdown</option>
              </select>
              {col.type === 'dropdown'
                ? <input value={(col.options ?? []).join(',')} placeholder="op1,op2,op3"
                    onChange={e => updateCol(col.id, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    style={{ padding: '6px 10px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 12 }} />
                : <div style={{ color: '#94a3b8', fontSize: 12 }}>—</div>
              }
              <button onClick={() => removeCol(col.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2445c', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          ))}
          <button onClick={addCol} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed #0073ea', color: '#0073ea', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginTop: 4 }}>
            + Agregar columna
          </button>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setColEditorOpen(false)} style={{ padding: '8px 16px', border: '1px solid #e0e2ea', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={save} style={{ padding: '8px 20px', border: 'none', borderRadius: 6, background: '#1B3055', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Guardar columnas</button>
          </div>
        </div>
      </div>
    )
  }

  // ── TIPO ACUERDO — auto-calculado desde las otras tablas ─────
  if (tableType === 'acuerdo') {
    // Leer todas las pricing-table del documento
    const tarifasItems = [], accItems = []
    try {
      editor?.state.doc.descendants(n => {
        if (n.type.name !== 'pricingTable') return
        const its = decodeItems(n.attrs.itemsB64)
        if (n.attrs.tableType === 'tarifas')    tarifasItems.push(...its)
        if (n.attrs.tableType === 'accesorios') accItems.push(...its)
      })
    } catch {}

    // TARIFAS: renta mensual + entrega + recolección (deducible es solo informativo)
    const totalTarifas = tarifasItems.reduce((s, i) => {
      const mensual   = (Number(i.dailyRate)||0) * 30 * (Number(i.quantity)||1)
      const delivery  = Number(i.delivery)  || 0
      const retrieval = Number(i.retrieval) || 0
      return s + mensual + delivery + retrieval
    }, 0)
    // ADECUACIONES: subtotal sin IVA
    const totalAcc  = accItems.reduce((s, i) => s + (Number(i.price)||0) * (Number(i.quantity)||1), 0)
    const subtotal  = totalTarifas + totalAcc
    // OJO: "|| 16" trataba 0% como "falta valor" y forzaba 16% — el preview
    // mostraba/calculaba 16% aunque el atributo real fuera 0, mientras el
    // backend (que sí usa "?? 16") sí respetaba el 0 real → el PDF salía sin
    // IVA aunque el editor mostrara 16%. ivaRate ya viene numérico desde el
    // default del schema (PricingTableExtension), así que no hace falta
    // fallback aquí.
    const ivaPct    = Number(ivaRate)
    const ivaAmt    = subtotal * ivaPct / 100
    const total     = subtotal + ivaAmt

    return (
      <NodeViewWrapper>
        <div className={`pt-block ${selected ? 'pt-block-selected' : ''}`} contentEditable={false}>
          {/* Header */}
          <div className="pt-header">
            <div className="pt-header-left">
              <span className="pt-title">{title}</span>
            </div>
            <div className="pt-header-right">
              <label style={{ fontSize:11, color:'rgba(255,255,255,0.85)', display:'flex', alignItems:'center', gap:4 }}>
                IVA
                <select className="pt-iva-select" value={ivaPct}
                  onChange={e => updateAttributes({ ivaRate: Number(e.target.value) })}>
                  <option value={0}>0%</option>
                  <option value={8}>8%</option>
                  <option value={16}>16%</option>
                </select>
              </label>
            </div>
          </div>

          {/* Encabezados */}
          <div className="pt-cols-header" style={{ gridTemplateColumns: '1fr 130px 130px 130px' }}>
            <div>DESCRIPCIÓN</div>
            <div style={{ textAlign:'right' }}>SUBTOTAL</div>
            <div style={{ textAlign:'right' }}>IVA {ivaPct}%</div>
            <div style={{ textAlign:'right' }}>TOTAL</div>
          </div>

          {/* Una fila por cada item de TARIFAS (deducible es solo informativo, no suma) */}
          {tarifasItems.map((item, i) => {
            // Deducible solo informativo — no suma al total
            const mensual   = (Number(item.dailyRate)||0) * 30 * (Number(item.quantity)||1)
            const delivery  = Number(item.delivery)  || 0
            const retrieval = Number(item.retrieval) || 0
            const subtotalItem = mensual + delivery + retrieval
            return (
              <div key={i} className="pt-row" style={{ gridTemplateColumns: '1fr 130px 130px 130px' }}>
                <div className="pt-c-name" style={{ pointerEvents:'none', fontSize:12 }}>
                  Renta mensual {item.name || '—'}
                </div>
                <div className="pt-c-subtotal pt-cell-num">{fmt(subtotalItem)}</div>
                <div className="pt-c-subtotal pt-cell-num">{fmt(subtotalItem * ivaPct / 100)}</div>
                <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt(subtotalItem * (1 + ivaPct/100))}</div>
              </div>
            )
          })}

          {/* Fila: Adecuaciones (solo si hay items) */}
          {accItems.length > 0 && totalAcc > 0 && (
            <div className="pt-row" style={{ gridTemplateColumns: '1fr 130px 130px 130px' }}>
              <div className="pt-c-name" style={{ pointerEvents:'none', fontSize:12 }}>
                Adecuaciones
              </div>
              <div className="pt-c-subtotal pt-cell-num">{fmt(totalAcc)}</div>
              <div className="pt-c-subtotal pt-cell-num">{fmt(totalAcc * ivaPct / 100)}</div>
              <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt(totalAcc * (1 + ivaPct/100))}</div>
            </div>
          )}

          {tarifasItems.length === 0 && accItems.length === 0 && (
            <div className="pt-empty-rows" style={{ fontSize:11, color:'#94a3b8' }}>
              Se calculará automáticamente al agregar productos en TARIFAS y ADECUACIONES
            </div>
          )}

          {/* Totales */}
          <div className="pt-totals">
            <div className="pt-total-line">
              <span>Subtotal</span><span className="pt-total-val">{fmt(subtotal)}</span>
            </div>
            <div className="pt-total-line">
              <span>IVA {ivaPct}%</span><span className="pt-total-val">{fmt(ivaAmt)}</span>
            </div>
            <div className="pt-total-line pt-total-grand">
              <span>TOTAL</span><span className="pt-grand-val">{fmt(total)}</span>
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div className={`pt-block ${selected ? 'pt-block-selected' : ''}`} contentEditable={false}>

        {/* Header */}
        <div className="pt-header">
          <div className="pt-header-left">
            {editingTitle ? (
              <input autoFocus className="pt-title-input" value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(title); setEditingTitle(false) } }} />
            ) : (
              <span className="pt-title" onClick={() => { setTitleDraft(title); setEditingTitle(true) }}>
                {title} <span className="pt-edit-hint"><IconEdit /></span>
              </span>
            )}
          </div>
          <div className="pt-header-right">
            {!['tarifas','accesorios','acuerdo'].includes(tableType) && (
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
                IVA
                <select className="pt-iva-select" value={ivaRate}
                  onChange={e => updateAttributes({ ivaRate: Number(e.target.value) })}>
                  <option value={0}>0%</option>
                  <option value={8}>8%</option>
                  <option value={16}>16%</option>
                </select>
              </label>
            )}
          </div>
        </div>

        {/* Cabecera de columnas */}
        {tableType === 'personalizada' ? (
          <div className="pt-cols-header" style={{
            gridTemplateColumns: customCols.length > 0
              ? `52px ${customCols.map(() => '1fr').join(' ')} 36px`
              : '52px 1fr 36px'
          }}>
            <div style={{ textAlign: 'center' }}>CANT.</div>
            {customCols.length > 0
              ? customCols.map(c => <div key={c.id}>{c.name.toUpperCase()}</div>)
              : <div>COLUMNA</div>
            }
            <div />
          </div>
        ) : (
          <div className="pt-cols-header" style={{ gridTemplateColumns: cols.grid }}>
            {cols.headers.map((h, i) => (
              <div key={i} style={{ textAlign: cols.align[i] }}>{h}</div>
            ))}
          </div>
        )}

        {/* Filas */}
        {items.length === 0 ? (
          <div className="pt-empty-rows">
            Agrega filas del catálogo o manualmente con los botones de abajo
          </div>
        ) : (
          items.map(item => renderRow(item))
        )}

        {/* Botones de agregar */}
        <div className="pt-add-row">
          {tableType !== 'personalizada' && (
            <button type="button" className="pt-add-btn" onClick={() => setCatalogOpen(true)}>
              <IconPlus /> Del catálogo
            </button>
          )}
          <button type="button" className="pt-add-btn pt-add-btn-manual" onClick={addManualRow}>
            <IconPlus /> Fila manual
          </button>
          {tableType === 'personalizada' && (
            <button type="button" className="pt-add-btn" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)' }}
              onClick={() => setColEditorOpen(true)}>
              ⚙️ Columnas
            </button>
          )}
        </div>

        {/* Totales tipo tarifas — deducible es solo informativo, no suma */}
        {items.length > 0 && tableType === 'tarifas' && (() => {
          const totalMensual     = items.reduce((s,i) => s + (Number(i.dailyRate)||0) * 30 * (Number(i.quantity)||1), 0)
          const totalEntrega     = items.reduce((s,i) => s + (Number(i.delivery)||0), 0)
          const totalRecoleccion = items.reduce((s,i) => s + (Number(i.retrieval)||0), 0)
          const grandTotal       = totalMensual + totalEntrega + totalRecoleccion
          return (
            <div className="pt-totals">
              <div className="pt-total-line">
                <span>Total renta mensual</span>
                <span className="pt-total-val">{fmt(totalMensual)}</span>
              </div>
              {totalEntrega > 0 && (
                <div className="pt-total-line" style={{ color:'#676879', fontSize:11 }}>
                  <span>Entrega</span>
                  <span>{fmt(totalEntrega)}</span>
                </div>
              )}
              {totalRecoleccion > 0 && (
                <div className="pt-total-line" style={{ color:'#676879', fontSize:11 }}>
                  <span>Recolección</span>
                  <span>{fmt(totalRecoleccion)}</span>
                </div>
              )}
              <div className="pt-total-line pt-total-grand">
                <span>Total</span>
                <span className="pt-grand-val">{fmt(grandTotal)}</span>
              </div>
            </div>
          )
        })()}


        {/* Totales ADECUACIONES — solo total sin IVA */}
        {items.length > 0 && tableType === 'accesorios' && (
          <div className="pt-totals">
            <div className="pt-total-line pt-total-grand">
              <span>TOTAL</span>
              <span className="pt-grand-val">{fmt(items.reduce((s,i) => s + (Number(i.price)||0)*(Number(i.quantity)||1), 0))}</span>
            </div>
          </div>
        )}

        {/* Totales con IVA — renta, traslados, generic */}
        {items.length > 0 && !['personalizada','tarifas','accesorios','acuerdo'].includes(tableType) && (
          <div className="pt-totals">
            <div className="pt-total-line">
              <span>IVA {ivaRate}%</span>
              <span className="pt-total-val">{fmt(iva)}</span>
            </div>
            <div className="pt-total-line pt-total-grand">
              <span>TOTAL CON IVA</span>
              <span className="pt-grand-val">{fmt(total)}</span>
            </div>
          </div>
        )}
      </div>

      {colEditorOpen && <ColumnEditor />}

      {catalogOpen && (
        <CatalogPickerModal
          initialItems={items}
          onClose={() => setCatalogOpen(false)}
          onConfirm={handleCatalogConfirm}
        />
      )}
    </NodeViewWrapper>
  )
}

export default function PricingTableView(props) {
  return <TableErrorBoundary><PricingTableViewInner {...props} /></TableErrorBoundary>
}
