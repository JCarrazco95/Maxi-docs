import { useState, useEffect } from 'react'
import api from '../../api/client.js'

const fmt = n => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

const IconClose  = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconPlus   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconMinus  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconSearch = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IconCheck  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>

export default function CatalogPickerModal({ onClose, onConfirm, initialItems = [] }) {
  const [catalog, setCatalog]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [activeTab, setActiveTab]   = useState(0)
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(
    // Inicializar con items ya seleccionados { productId -> quantity }
    Object.fromEntries(initialItems.map(i => [i.id, i.quantity]))
  )
  const [ivaRate, setIvaRate]       = useState(16)

  useEffect(() => {
    api.get('/api/catalog')
      .then(res => {
        setCatalog(res.data)
        setLoading(false)
        // Abrir en la categoría con más productos por defecto
        const cats = res.data?.categories ?? []
        const maxIdx = cats.reduce((best, cat, i) =>
          (cat.products?.length ?? 0) > (cats[best]?.products?.length ?? 0) ? i : best, 0)
        setActiveTab(maxIdx)
      })
      .catch(() => { setError('Error al cargar el catálogo'); setLoading(false) })
  }, [])

  function setQty(productId, qty) {
    const n = Math.max(0, parseInt(qty) || 0)
    setSelected(prev => {
      if (n === 0) { const { [productId]: _, ...rest } = prev; return rest }
      return { ...prev, [productId]: n }
    })
  }

  function toggleSelect(productId, price) {
    setSelected(prev => {
      if (prev[productId]) { const { [productId]: _, ...rest } = prev; return rest }
      return { ...prev, [productId]: 1 }
    })
  }

  // Todos los productos del catálogo (para búsqueda global)
  const allProducts = catalog?.categories.flatMap(c =>
    c.products.map(p => ({ ...p, categoryName: c.name }))
  ) ?? []

  const filtered = search
    ? allProducts.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase())
      )
    : null

  const currentCategory = catalog?.categories[activeTab]
  const displayProducts = filtered ?? currentCategory?.products ?? []

  // Resumen de selección
  const selectedItems = allProducts
    .filter(p => selected[p.id])
    .map(p => ({ ...p, quantity: selected[p.id] }))

  const subtotal = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const iva      = subtotal * (ivaRate / 100)
  const total    = subtotal + iva

  function handleConfirm() {
    onConfirm({ items: selectedItems, ivaRate })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal catalog-modal">

        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-icon">
            <div className="modal-header-icon-wrap primary" style={{ fontSize: 18 }}>🗂️</div>
            <div>
              <div className="modal-title">Catálogo de Servicios</div>
              <div className="modal-subtitle">
                {catalog?.boardName ?? 'Cargando...'} · {selectedItems.length} seleccionados
              </div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} type="button"><IconClose /></button>
        </div>

        {loading && <div className="portal-loading" style={{ padding: 40 }}><div className="spinner" /> Cargando catálogo de Monday.com…</div>}
        {error   && <div className="error-msg" style={{ margin: 16 }}>{error}</div>}

        {catalog && (
          <div className="catalog-layout">

            {/* Panel izquierdo: catálogo */}
            <div className="catalog-left">

              {/* Buscador */}
              <div className="catalog-search">
                <IconSearch />
                <input
                  className="filter-search-input"
                  placeholder="Buscar por nombre o SKU…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* Tabs de categorías (solo si no hay búsqueda) */}
              {!search && (
                <div className="catalog-tabs">
                  {catalog.categories.map((cat, i) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`catalog-tab ${activeTab === i ? 'active' : ''}`}
                      onClick={() => setActiveTab(i)}
                    >
                      {cat.name}
                      <span className="catalog-tab-count">{cat.products.length}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Lista de productos */}
              <div className="catalog-products">
                {displayProducts.length === 0 && (
                  <div className="dash-empty" style={{ padding: '32px 16px' }}>
                    Sin resultados para "{search}"
                  </div>
                )}
                {displayProducts.map(product => {
                  const qty      = selected[product.id] ?? 0
                  const isChosen = qty > 0
                  return (
                    <div
                      key={product.id}
                      className={`catalog-product-row ${isChosen ? 'selected' : ''}`}
                      onClick={() => toggleSelect(product.id)}
                    >
                      <div className="catalog-product-check">
                        {isChosen && <IconCheck />}
                      </div>
                      <div className="catalog-product-info">
                        <div className="catalog-product-name">{product.name}</div>
                        <div className="catalog-product-sku">
                          {search && <span className="catalog-cat-badge">{product.categoryName}</span>}
                          {product.sku}
                        </div>
                      </div>
                      <div className="catalog-product-price">{fmt(product.price)}</div>
                      {isChosen && (
                        <div className="catalog-qty" onClick={e => e.stopPropagation()}>
                          <button type="button" className="catalog-qty-btn"
                            onClick={() => setQty(product.id, qty - 1)}><IconMinus /></button>
                          <input
                            type="number" min="1" value={qty}
                            className="catalog-qty-input"
                            onChange={e => setQty(product.id, e.target.value)}
                          />
                          <button type="button" className="catalog-qty-btn"
                            onClick={() => setQty(product.id, qty + 1)}><IconPlus /></button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Panel derecho: resumen */}
            <div className="catalog-right">
              <div className="catalog-summary-title">Resumen de selección</div>

              {selectedItems.length === 0 ? (
                <div className="catalog-empty-selection">
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
                  <p>Haz clic en un servicio para agregarlo</p>
                </div>
              ) : (
                <>
                  <div className="catalog-selected-list">
                    {selectedItems.map(item => (
                      <div key={item.id} className="catalog-selected-row">
                        <div className="catalog-selected-name">
                          <span className="catalog-selected-qty">{item.quantity}×</span>
                          {item.name}
                        </div>
                        <div className="catalog-selected-total">{fmt(item.price * item.quantity)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="catalog-totals">
                    <div className="catalog-total-row">
                      <span>Subtotal</span>
                      <span>{fmt(subtotal)}</span>
                    </div>
                    <div className="catalog-total-row">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        IVA
                        <select value={ivaRate} onChange={e => setIvaRate(Number(e.target.value))}
                          style={{ fontSize: 11, padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 4 }}>
                          <option value={16}>16%</option>
                        </select>
                      </span>
                      <span>{fmt(iva)}</span>
                    </div>
                    <div className="catalog-total-row catalog-grand-total">
                      <span>Total</span>
                      <span>{fmt(total)}</span>
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}
                onClick={handleConfirm}
                disabled={selectedItems.length === 0}
              >
                Insertar tabla de precios
              </button>
              <button type="button" className="btn btn-secondary"
                style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
                onClick={onClose}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
