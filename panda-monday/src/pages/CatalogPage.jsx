/**
 * CatalogPage — Portal de catálogo de productos/servicios estilo PandaDoc
 * Sidebar izquierdo: categorías | Contenido: tabla de productos
 */
import { useState, useEffect, useRef } from 'react'
import api from '../api/client.js'

const fmt = n => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── SVG Icons ─────────────────────────────────────────────────
const IcoPlus    = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IcoEdit    = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
const IcoTrash   = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const IcoSearch  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IcoImport  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IcoX       = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IcoCheck   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>

// ── Modal para crear/editar producto ─────────────────────────
function ProductModal({ product, categories, onSave, onClose }) {
  const [form, setForm] = useState({
    name:        product?.name        ?? '',
    sku:         product?.sku         ?? '',
    price:       product?.price       ?? '',
    unit:        product?.unit        ?? '',
    description: product?.description ?? '',
    category_id: product?.category_id ?? categories[0]?.id ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price) || 0,
        category_id: form.category_id || null,
      }
      if (product?.id) {
        await api.put(`/api/catalog/products/${product.id}`, payload)
      } else {
        await api.post('/api/catalog/products', payload)
      }
      onSave()
    } catch (e) {
      setError(e.response?.data?.error || 'Error guardando producto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-md" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{product ? 'Editar producto' : 'Nuevo producto'}</div>
          </div>
          <button className="close-btn" onClick={onClose}><IcoX /></button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Toyota Corolla 2026" autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">SKU</label>
              <input className="form-input" value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="CRL-2026" />
            </div>
            <div className="form-group">
              <label className="form-label">Precio / mes</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Unidad</label>
              <input className="form-input" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="mes, unidad, día…" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select className="form-select" value={form.category_id || ''} onChange={e => set('category_id', e.target.value || null)}>
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descripción opcional del producto o servicio" style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner-sm" /> Guardando…</> : <><IcoCheck /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal para crear/editar categoría ─────────────────────────
function CategoryModal({ category, onSave, onClose }) {
  const [name,   setName]   = useState(category?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSave() {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    setSaving(true); setError(null)
    try {
      if (category?.id) {
        await api.put(`/api/catalog/categories/${category.id}`, { name: name.trim() })
      } else {
        await api.post('/api/catalog/categories', { name: name.trim() })
      }
      onSave()
    } catch (e) {
      setError(e.response?.data?.error || 'Error guardando categoría')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-md" style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <div className="modal-title">{category ? 'Renombrar categoría' : 'Nueva categoría'}</div>
          <button className="close-btn" onClick={onClose}><IcoX /></button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg" style={{ marginBottom: 10 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Nombre de la categoría</label>
            <input ref={inputRef} className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: AUTOS" onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner-sm" /></> : <><IcoCheck /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function CatalogPage() {
  const [categories,   setCategories]  = useState([])
  const [products,     setProducts]    = useState([])
  const [loading,      setLoading]     = useState(true)
  const [activeCat,    setActiveCat]   = useState(null) // null = Todos
  const [search,       setSearch]      = useState('')
  const [editProduct,  setEditProduct] = useState(null)  // null | product | {}
  const [editCat,      setEditCat]     = useState(null)  // null | category | {}
  const [importing,    setImporting]   = useState(false)
  const [importMsg,    setImportMsg]   = useState(null)
  const [error,        setError]       = useState(null)
  const [mondayStatus, setMondayStatus]= useState(null)  // { enabled, boardId }

  useEffect(() => {
    loadAll()
    api.get('/api/catalog/monday-status').then(r => setMondayStatus(r.data)).catch(() => {})
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [catRes, prodRes] = await Promise.all([
        api.get('/api/catalog/categories'),
        api.get('/api/catalog/products'),
      ])
      setCategories(catRes.data)
      setProducts(prodRes.data)
    } catch (e) {
      setError('Error cargando el catálogo')
    } finally {
      setLoading(false)
    }
  }

  async function deleteCategory(id) {
    if (!confirm('¿Eliminar esta categoría? Los productos quedarán sin categoría.')) return
    await api.delete(`/api/catalog/categories/${id}`)
    if (activeCat === id) setActiveCat(null)
    loadAll()
  }

  async function deleteProduct(id) {
    if (!confirm('¿Eliminar este producto?')) return
    await api.delete(`/api/catalog/products/${id}`)
    loadAll()
  }

  async function handleImport() {
    setImporting(true); setImportMsg(null)
    try {
      const r = await api.post('/api/catalog/import-monday')
      setImportMsg(`✅ Importados: ${r.data.categoriesImported} categorías, ${r.data.productsImported} productos`)
      loadAll()
    } catch (e) {
      setImportMsg('❌ ' + (e.response?.data?.error || 'Error importando'))
    } finally {
      setImporting(false)
    }
  }

  // Filtrar productos
  const visible = products.filter(p => {
    const matchCat  = activeCat === null || p.category_id === activeCat
    const matchSrch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSrch
  })

  const activeCatName = activeCat === null ? 'Todos' : categories.find(c => c.id === activeCat)?.name ?? 'Sin categoría'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#f6f7fb' }}>

      {/* ── Sidebar categorías ────────────────────────────── */}
      <div style={{ width: 200, flexShrink: 0, background: 'white', borderRight: '1px solid #e0e2ea', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 12px 8px', borderBottom: '1px solid #f0f1f5' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B3055', marginBottom: 8 }}>Catálogo</div>
          <button onClick={() => setEditCat({})} style={s.addCatBtn}>
            <IcoPlus /> Nueva categoría
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {/* Todos */}
          <button
            onClick={() => setActiveCat(null)}
            style={{ ...s.catItem, ...(activeCat === null ? s.catItemActive : {}) }}
          >
            <span style={{ flex: 1 }}>Todos</span>
            <span style={{ ...s.catCount, ...(activeCat === null ? s.catCountActive : {}) }}>{products.length}</span>
          </button>

          {categories.map(cat => (
            <div key={cat.id} style={{ position: 'relative' }} className="cat-row">
              <button
                onClick={() => setActiveCat(cat.id)}
                style={{ ...s.catItem, ...(activeCat === cat.id ? s.catItemActive : {}) }}
              >
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cat.name}
                </span>
                <span style={{ ...s.catCount, ...(activeCat === cat.id ? s.catCountActive : {}) }}>
                  {products.filter(p => p.category_id === cat.id).length}
                </span>
              </button>
              {/* Acciones en hover */}
              <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2, opacity: 0 }} className="cat-actions">
                <button onClick={() => setEditCat(cat)} style={s.iconBtn} title="Renombrar"><IcoEdit /></button>
                <button onClick={() => deleteCategory(cat.id)} style={{ ...s.iconBtn, color: '#e03e3e' }} title="Eliminar"><IcoTrash /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Importar desde Monday */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f1f5', flexShrink: 0 }}>
          {mondayStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: 10, color: mondayStatus.enabled ? '#22c55e' : '#9699a6' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: mondayStatus.enabled ? '#22c55e' : '#d1d5db', flexShrink: 0 }} />
              {mondayStatus.enabled ? 'Sync con Monday activo' : 'Monday no configurado'}
            </div>
          )}
          <button onClick={handleImport} disabled={importing || !mondayStatus?.enabled} style={{ ...s.importBtn, opacity: (!mondayStatus?.enabled) ? 0.5 : 1 }} title={!mondayStatus?.enabled ? 'Configura MONDAY_API_TOKEN y MONDAY_CATALOG_BOARD_ID en .env' : ''}>
            {importing ? <><span className="spinner-sm" /> Importando…</> : <><IcoImport /> Importar Monday</>}
          </button>
          {importMsg && <div style={{ fontSize: 11, color: '#676879', marginTop: 6, wordBreak: 'break-word' }}>{importMsg}</div>}
        </div>
      </div>

      {/* ── Contenido principal ───────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{ background: 'white', borderBottom: '1px solid #e0e2ea', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1B3055' }}>{activeCatName}</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{visible.length} producto{visible.length !== 1 ? 's' : ''}</div>

          <div style={{ flex: 1 }} />

          {/* Buscador */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9699a6' }}><IcoSearch /></span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto o SKU…"
              style={{ paddingLeft: 30, paddingRight: 10, height: 32, border: '1px solid #e0e2ea', borderRadius: 7, fontSize: 13, outline: 'none', width: 220 }}
            />
          </div>

          <button onClick={() => setEditProduct({})} style={s.addProductBtn}>
            <IcoPlus /> Nuevo producto
          </button>
        </div>

        {/* Error */}
        {error && <div className="error-msg" style={{ margin: '12px 20px' }}>{error}</div>}

        {/* Tabla de productos */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12, color: '#94a3b8' }}>
              <span className="spinner-sm" /> Cargando…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, color: '#94a3b8', gap: 12 }}>
              <div style={{ fontSize: 48 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#323338' }}>
                {search ? `Sin resultados para "${search}"` : 'No hay productos en esta categoría'}
              </div>
              <div style={{ fontSize: 13 }}>
                {search ? 'Intenta con otro término de búsqueda' : 'Agrega tu primer producto con el botón "Nuevo producto"'}
              </div>
              {!search && (
                <button onClick={() => setEditProduct({})} style={{ ...s.addProductBtn, marginTop: 4 }}>
                  <IcoPlus /> Nuevo producto
                </button>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8f9fc', borderBottom: '1px solid #e0e2ea' }}>
                  <th style={s.th}>Nombre</th>
                  <th style={s.th}>SKU</th>
                  <th style={s.th}>Categoría</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Precio</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Unidad</th>
                  <th style={{ ...s.th, width: 28 }} title="Sincronizado con Monday"></th>
                  <th style={{ ...s.th, width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(p => (
                  <tr key={p.id} style={s.tr} onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600, color: '#323338' }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{p.description.slice(0, 60)}{p.description.length > 60 ? '…' : ''}</div>}
                    </td>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12, color: '#676879' }}>{p.sku || '—'}</td>
                    <td style={s.td}>
                      {p.category_name
                        ? <span style={{ background: '#e8edf5', color: '#1B3055', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p.category_name}</span>
                        : <span style={{ color: '#c0c4cc', fontSize: 11 }}>Sin categoría</span>}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#1B3055' }}>{fmt(p.price)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#9699a6', fontSize: 12 }}>{p.unit || '—'}</td>
                    <td style={s.td} title={p.monday_item_id ? `Monday ID: ${p.monday_item_id}` : 'No sincronizado'}>
                      {p.monday_item_id
                        ? <span style={{ color: '#22c55e', fontSize: 14 }} title="Sincronizado con Monday">●</span>
                        : <span style={{ color: '#e2e8f0', fontSize: 14 }}>●</span>}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditProduct(p)} style={s.iconBtn} title="Editar"><IcoEdit /></button>
                        <button onClick={() => deleteProduct(p.id)} style={{ ...s.iconBtn, color: '#e03e3e' }} title="Eliminar"><IcoTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modales */}
      {editProduct !== null && (
        <ProductModal
          product={editProduct?.id ? editProduct : null}
          categories={categories}
          onSave={() => { setEditProduct(null); loadAll() }}
          onClose={() => setEditProduct(null)}
        />
      )}
      {editCat !== null && (
        <CategoryModal
          category={editCat?.id ? editCat : null}
          onSave={() => { setEditCat(null); loadAll() }}
          onClose={() => setEditCat(null)}
        />
      )}

      <style>{`
        .cat-row:hover .cat-actions { opacity: 1 !important; }
      `}</style>
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────
const s = {
  addCatBtn:    { display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '6px 10px', background: '#f0f7ff', border: '1px dashed #bfdbfe', borderRadius: 7, color: '#0073ea', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  addProductBtn:{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#0073ea', border: 'none', borderRadius: 7, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  importBtn:    { display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '6px 10px', background: '#f6f7fb', border: '1px solid #e0e2ea', borderRadius: 7, color: '#676879', fontSize: 11, cursor: 'pointer' },
  catItem:      { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#323338', textAlign: 'left', borderRadius: 0 },
  catItemActive:{ background: '#f0f7ff', color: '#0073ea', fontWeight: 700 },
  catCount:     { fontSize: 11, background: '#f0f1f5', color: '#9699a6', padding: '1px 6px', borderRadius: 10, fontWeight: 600, flexShrink: 0 },
  catCountActive:{ background: '#bfdbfe', color: '#0073ea' },
  iconBtn:      { background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: 4 },
  th:           { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#676879', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' },
  td:           { padding: '10px 14px', borderBottom: '1px solid #f0f1f5', verticalAlign: 'middle' },
  tr:           { background: 'white', transition: 'background 0.1s' },
}
