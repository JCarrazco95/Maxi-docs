import { useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { decodeItems, encodeItems } from './PricingTableExtension.js'
import CatalogPickerModal from './CatalogPickerModal.jsx'

const fmt = n => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Iconos ─────────────────────────────────────────────────────
const IconPlus   = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconMinus  = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const IconEdit   = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

export default function PricingTableView({ node, updateAttributes, selected }) {
  const [catalogOpen, setCatalogOpen]   = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]     = useState(node.attrs.title)

  const { title, itemsB64, ivaRate } = node.attrs
  const items = decodeItems(itemsB64)

  function saveItems(newItems) {
    updateAttributes({ itemsB64: encodeItems(newItems) })
  }

  function saveTitle() {
    updateAttributes({ title: titleDraft })
    setEditingTitle(false)
  }

  function setQty(id, delta) {
    const updated = items
      .map(i => i.id === id ? { ...i, quantity: Math.max(0, (i.quantity || 1) + delta) } : i)
      .filter(i => i.quantity > 0)
    saveItems(updated)
  }

  function setQtyDirect(id, val) {
    const n = Math.max(0, parseInt(val) || 0)
    if (n === 0) saveItems(items.filter(i => i.id !== id))
    else saveItems(items.map(i => i.id === id ? { ...i, quantity: n } : i))
  }

  function removeItem(id) {
    saveItems(items.filter(i => i.id !== id))
  }

  function handleCatalogConfirm({ items: picked, ivaRate: newIva }) {
    const existing = new Map(items.map(i => [i.id, { ...i }]))
    picked.forEach(p => {
      if (existing.has(p.id)) existing.get(p.id).quantity = p.quantity
      else existing.set(p.id, p)
    })
    saveItems([...existing.values()])
    updateAttributes({ ivaRate: newIva })
    setCatalogOpen(false)
  }

  const subtotal = items.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
  const iva      = subtotal * (ivaRate / 100)
  const total    = subtotal + iva

  return (
    <NodeViewWrapper>
      <div className={`pt-block ${selected ? 'pt-block-selected' : ''}`}
           contentEditable={false}>

        {/* ── Header ─────────────────────────────────────── */}
        <div className="pt-header">
          <div className="pt-header-left">
            {editingTitle ? (
              <input
                autoFocus
                className="pt-title-input"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(title); setEditingTitle(false) } }}
              />
            ) : (
              <span className="pt-title" title="Click para editar el título" onClick={() => { setTitleDraft(title); setEditingTitle(true) }}>
                {title} <span className="pt-edit-hint"><IconEdit /></span>
              </span>
            )}
          </div>
          <div className="pt-header-right">
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
              IVA
              <select
                className="pt-iva-select"
                value={ivaRate}
                onChange={e => updateAttributes({ ivaRate: Number(e.target.value) })}
              >
                <option value={0}>0%</option>
                <option value={8}>8%</option>
                <option value={16}>16%</option>
              </select>
            </label>
          </div>
        </div>

        {/* ── Columnas ───────────────────────────────────── */}
        <div className="pt-cols-header">
          <div className="pt-c-qty">CANT.</div>
          <div className="pt-c-name">SERVICIO / UNIDAD</div>
          <div className="pt-c-sku">SKU</div>
          <div className="pt-c-price">PRECIO/MES</div>
          <div className="pt-c-subtotal">SUBTOTAL</div>
          <div className="pt-c-del"></div>
        </div>

        {/* ── Filas ──────────────────────────────────────── */}
        {items.length === 0 ? (
          <div className="pt-empty-rows">
            Haz clic en <strong>+ Agregar del catálogo</strong> para agregar servicios
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="pt-row">
              <div className="pt-c-qty">
                <div className="pt-qty-wrap">
                  <button type="button" className="pt-qty-btn" onClick={() => setQty(item.id, -1)}><IconMinus /></button>
                  <input
                    type="number" min="1" value={item.quantity || 1}
                    className="pt-qty-input"
                    onChange={e => setQtyDirect(item.id, e.target.value)}
                  />
                  <button type="button" className="pt-qty-btn" onClick={() => setQty(item.id, 1)}><IconPlus /></button>
                </div>
              </div>
              <div className="pt-c-name pt-cell-name">{item.name}</div>
              <div className="pt-c-sku pt-cell-muted">{item.sku}</div>
              <div className="pt-c-price pt-cell-num">{fmt(item.price)}</div>
              <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt(item.price * (item.quantity || 1))}</div>
              <div className="pt-c-del">
                <button type="button" className="pt-del-btn" onClick={() => removeItem(item.id)} title="Eliminar">
                  <IconTrash />
                </button>
              </div>
            </div>
          ))
        )}

        {/* ── Botón agregar ──────────────────────────────── */}
        <div className="pt-add-row">
          <button type="button" className="pt-add-btn" onClick={() => setCatalogOpen(true)}>
            <IconPlus /> Agregar del catálogo
          </button>
        </div>

        {/* ── Totales ────────────────────────────────────── */}
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

      {/* ── Modal catálogo ─────────────────────────────────── */}
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
