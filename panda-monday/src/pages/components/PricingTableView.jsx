import { useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { decodeItems, encodeItems } from './PricingTableExtension.js'
import CatalogPickerModal from './CatalogPickerModal.jsx'

const fmt = n => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Opciones de tipo de unidad MAXIRent ────────────────────────
const VEHICLE_OPTIONS = [
  'Pick up 4x4', 'Pick up doble cabina', 'Camioneta SUV', 'Camioneta 4x4',
  'NP 300 Redilas', 'NP 300 Caja Seca', 'NP 300 EST.C',
  'Hiace 12 pasajeros', 'Hiace 15 pasajeros',
  'Coaster', 'Urvan', 'Sprinter', 'Corolla', 'Avanza', 'Rush',
  'Pickup Estacas', 'Camión 3.5 ton', 'Camión 5 ton',
]

// ── Icons ───────────────────────────────────────────────────────
const IconPlus  = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconMinus = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const IconEdit  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

// ── Cálculo de subtotal por tipo ────────────────────────────────
function rowSubtotal(item, tableType) {
  const qty = item.quantity || 1
  if (tableType === 'traslados')
    return ((item.price || 0) + (item.delivery || 0) + (item.retrieval || 0)) * qty
  return (item.price || 0) * qty
}

// Defaults al agregar fila manual
function manualRowDefaults(tableType) {
  const base = { id: Date.now(), name: '', price: 0, quantity: 1, sku: '' }
  if (tableType === 'renta')      return { ...base, dailyRate: 0, deductible: 10, days: 30 }
  if (tableType === 'traslados')  return { ...base, delivery: 0, retrieval: 0 }
  return base
}

// Defaults al agregar del catálogo
function typeDefaults(tableType) {
  if (tableType === 'renta')      return { dailyRate: null, deductible: 10, days: 30 }
  if (tableType === 'traslados')  return { delivery: 0, retrieval: 0 }
  return {}
}

// Columnas por tipo
const COLS = {
  renta:      { grid: '52px 1fr 100px 110px 66px 52px 36px', headers: ['CANTIDAD', 'TIPO DE UNIDAD', 'TARIFA DIARIA', 'TARIFA MENSUAL', 'DEDUCIBLE', 'DÍAS', ''], align: ['center', 'left', 'right', 'right', 'center', 'center', 'center'] },
  traslados:  { grid: '52px 1fr 110px 82px 100px 100px 36px', headers: ['CANTIDAD', 'TIPO UNIDAD', 'TRASLADO', 'ENTREGA', 'RECOLECCIÓN', 'SUBTOTAL', ''], align: ['center', 'left', 'right', 'right', 'right', 'right', 'center'] },
  accesorios: { grid: '52px 1fr 80px 110px 36px', headers: ['CANTIDAD', 'ACCESORIO / SERVICIO', 'PRECIO', 'SUBTOTAL', ''], align: ['center', 'left', 'right', 'right', 'center'] },
  generic:    { grid: '90px 1fr 100px 110px 110px 36px', headers: ['CANT.', 'SERVICIO / UNIDAD', 'SKU', 'PRECIO/MES', 'SUBTOTAL', ''], align: ['center', 'left', 'left', 'right', 'right', 'center'] },
}

export default function PricingTableView({ node, updateAttributes, selected }) {
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]   = useState(node.attrs.title)

  const { title, itemsB64, ivaRate, tableType = 'renta' } = node.attrs
  const items = decodeItems(itemsB64)
  const cols  = COLS[tableType] ?? COLS.generic

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
      if (existing.has(p.id)) existing.get(p.id).quantity = p.quantity
      else existing.set(p.id, { ...p, ...defaults })
    })
    saveItems([...existing.values()])
    updateAttributes({ ivaRate: newIva })
    setCatalogOpen(false)
  }

  const subtotal = items.reduce((s, i) => s + rowSubtotal(i, tableType), 0)
  const iva      = subtotal * (ivaRate / 100)
  const total    = subtotal + iva

  // ── Inputs reutilizables ────────────────────────────────────────
  const NumInput = ({ id, field, value, w }) => (
    <input type="number" min="0" step="0.01" value={value ?? ''}
      className="pt-num-input" style={w ? { width: w } : {}}
      onChange={e => setField(id, field, e.target.value)}
      onClick={e => e.stopPropagation()} />
  )

  const TextInput = ({ id, field, value, placeholder, list }) => (
    <>
      <input type="text" value={value ?? ''} placeholder={placeholder}
        className="pt-text-input"
        list={list}
        onChange={e => setFieldText(id, field, e.target.value)}
        onClick={e => e.stopPropagation()} />
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

    const qtyCell = (
      <div className="pt-c-qty">
        <div className="pt-qty-wrap">
          <button type="button" className="pt-qty-btn" onClick={() => setQty(item.id, -1)}><IconMinus /></button>
          <input type="number" min="1" value={qty} className="pt-qty-input"
            onChange={e => setQtyDirect(item.id, e.target.value)} />
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

    if (tableType === 'renta') return (
      <div key={item.id} className="pt-row" style={{ gridTemplateColumns: cols.grid }}>
        {qtyCell}
        <div className="pt-c-name">
          <TextInput id={item.id} field="name" value={item.name}
            placeholder="Tipo de unidad…" list={`vehicles-${item.id}`} />
        </div>
        <div className="pt-c-price">
          <NumInput id={item.id} field="dailyRate"
            value={(item.dailyRate != null ? item.dailyRate : (item.price || 0) / 30).toFixed(2)} />
        </div>
        <div className="pt-c-price">
          <NumInput id={item.id} field="price" value={(item.price || 0).toFixed(2)} />
        </div>
        <div className="pt-c-deductible">
          <input type="number" min="0" max="100" step="1" className="pt-pct-input"
            value={item.deductible ?? 10}
            onChange={e => setField(item.id, 'deductible', e.target.value)}
            onClick={e => e.stopPropagation()} />
          <span className="pt-pct-symbol">%</span>
        </div>
        <div className="pt-c-deductible">
          <input type="number" min="1" step="1" className="pt-pct-input" style={{ width: 36 }}
            value={item.days ?? 30}
            onChange={e => setField(item.id, 'days', e.target.value)}
            onClick={e => e.stopPropagation()} />
        </div>
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
          <NumInput id={item.id} field="price" value={(item.price || 0).toFixed(2)} />
        </div>
        <div className="pt-c-price">
          <NumInput id={item.id} field="delivery" value={(item.delivery ?? 0).toFixed(2)} />
        </div>
        <div className="pt-c-price">
          <NumInput id={item.id} field="retrieval" value={(item.retrieval ?? 0).toFixed(2)} />
        </div>
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
          <TextInput id={item.id} field="name" value={item.name} placeholder="Accesorio / servicio…" />
        </div>
        <div className="pt-c-price">
          <NumInput id={item.id} field="price" value={(item.price || 0).toFixed(2)} />
        </div>
        <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt((item.price || 0) * qty)}</div>
        {delCell}
      </div>
    )

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
          <NumInput id={item.id} field="price" value={(item.price || 0).toFixed(2)} />
        </div>
        <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt((item.price || 0) * qty)}</div>
        {delCell}
      </div>
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
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
              IVA
              <select className="pt-iva-select" value={ivaRate}
                onChange={e => updateAttributes({ ivaRate: Number(e.target.value) })}>
                <option value={0}>0%</option>
                <option value={8}>8%</option>
                <option value={16}>16%</option>
              </select>
            </label>
          </div>
        </div>

        {/* Cabecera de columnas */}
        <div className="pt-cols-header" style={{ gridTemplateColumns: cols.grid }}>
          {cols.headers.map((h, i) => (
            <div key={i} style={{ textAlign: cols.align[i] }}>{h}</div>
          ))}
        </div>

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
          <button type="button" className="pt-add-btn" onClick={() => setCatalogOpen(true)}>
            <IconPlus /> Del catálogo
          </button>
          <button type="button" className="pt-add-btn pt-add-btn-manual" onClick={addManualRow}>
            <IconPlus /> Fila manual
          </button>
        </div>

        {/* Totales */}
        {items.length > 0 && (
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
