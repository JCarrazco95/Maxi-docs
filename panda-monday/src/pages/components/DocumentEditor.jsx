/**
 * DocumentEditor — Editor nativo de documentos (Opción B)
 * - contenteditable div con el HTML completo del template (CSS + imágenes)
 * - Las <pricing-table> se renderizan como React portals dentro del documento
 * - Toolbar de formato básico (bold, italic, underline, alineación)
 */
import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { decodeItems, encodeItems } from './PricingTableExtension.js'
import CatalogPickerModal from './CatalogPickerModal.jsx'

// ── Prepara HTML: quita <style> y convierte <pricing-table> en placeholders ──
function preparePricingTableHosts(html) {
  // El CSS se inyecta por React en el padre — quitarlo del contenteditable
  const noStyle = html.replace(/<style>[\s\S]*?<\/style>/gi, '')
  let i = 0
  return noStyle.replace(
    /<pricing-table([^>]*)>\s*<\/pricing-table>/g,
    (_, attrs) => {
      const id = `pt-${++i}`
      return `<div class="pt-native-host" data-pt-id="${id}" ${attrs.trim()} contenteditable="false"></div>`
    }
  )
}

// ── Recoge el HTML final restaurando <pricing-table> ────────────
function collectHtml(editorEl, states) {
  if (!editorEl) return ''
  const clone = editorEl.cloneNode(true)
  clone.querySelectorAll('[data-pt-id]').forEach(el => {
    const id = el.dataset.ptId
    const s  = states[id] || {}
    const pt = document.createElement('pricing-table')
    pt.setAttribute('data-title',      s.title     ?? el.getAttribute('data-title')      ?? '')
    pt.setAttribute('data-items-b64',  s.itemsB64  ?? el.getAttribute('data-items-b64')  ?? 'W10=')
    pt.setAttribute('data-iva',        String(s.ivaRate ?? el.getAttribute('data-iva') ?? 16))
    pt.setAttribute('data-table-type', s.tableType ?? el.getAttribute('data-table-type') ?? 'renta')
    el.replaceWith(pt)
  })
  return clone.innerHTML
}

// ─────────────────────────────────────────────────────────────────
// TOOLBAR DE FORMATO
// ─────────────────────────────────────────────────────────────────
function NativeToolbar({ editorRef }) {
  function exec(cmd, val = null) {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
  }

  return (
    <div className="doc-native-toolbar">
      <button type="button" className="doc-ntb" onMouseDown={e => { e.preventDefault(); exec('bold') }} title="Negrita"><b>B</b></button>
      <button type="button" className="doc-ntb" onMouseDown={e => { e.preventDefault(); exec('italic') }} title="Cursiva"><i>I</i></button>
      <button type="button" className="doc-ntb" onMouseDown={e => { e.preventDefault(); exec('underline') }} title="Subrayado"><u>U</u></button>
      <div className="doc-ntb-sep" />
      <button type="button" className="doc-ntb" onMouseDown={e => { e.preventDefault(); exec('justifyLeft') }} title="Izquierda">⬅</button>
      <button type="button" className="doc-ntb" onMouseDown={e => { e.preventDefault(); exec('justifyCenter') }} title="Centrar">☰</button>
      <button type="button" className="doc-ntb" onMouseDown={e => { e.preventDefault(); exec('justifyRight') }} title="Derecha">➡</button>
      <div className="doc-ntb-sep" />
      <button type="button" className="doc-ntb" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }} title="Lista">• Lista</button>
      <div className="doc-ntb-sep" />
      <select className="doc-ntb-select"
        defaultValue=""
        onMouseDown={e => e.stopPropagation()}
        onChange={e => { exec('foreColor', e.target.value); e.target.value = '' }}>
        <option value="" disabled>Color</option>
        <option value="#1B3055">Azul MAXIRent</option>
        <option value="#F5A000">Naranja MAXIRent</option>
        <option value="#222222">Negro</option>
        <option value="#444444">Gris</option>
        <option value="#ffffff">Blanco</option>
      </select>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PRICING TABLE STANDALONE (sin TipTap)
// ─────────────────────────────────────────────────────────────────
const fmt = n => `$${Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`

const VEHICLE_OPTIONS = [
  'Pick up 4x4','Pick up doble cabina','Camioneta SUV','Camioneta 4x4',
  'NP 300 Redilas','NP 300 Caja Seca','NP 300 EST.C',
  'Hiace 12 pasajeros','Hiace 15 pasajeros','Coaster','Urvan','Sprinter',
  'Corolla','Avanza','Rush','Pickup Estacas','Camión 3.5 ton','Camión 5 ton',
]

const PT_COLS = {
  renta:      { grid:'52px 1fr 100px 110px 66px 52px 36px', headers:['CANTIDAD','TIPO DE UNIDAD','TARIFA DIARIA','TARIFA MENSUAL','DEDUCIBLE','DÍAS',''], align:['center','left','right','right','center','center','center'] },
  traslados:  { grid:'52px 1fr 110px 82px 100px 100px 36px', headers:['CANTIDAD','TIPO UNIDAD','TRASLADO','ENTREGA','RECOLECCIÓN','SUBTOTAL',''], align:['center','left','right','right','right','right','center'] },
  accesorios: { grid:'52px 1fr 80px 110px 36px', headers:['CANTIDAD','ACCESORIO / SERVICIO','PRECIO','SUBTOTAL',''], align:['center','left','right','right','center'] },
  generic:    { grid:'90px 1fr 100px 110px 110px 36px', headers:['CANT.','SERVICIO / UNIDAD','SKU','PRECIO/MES','SUBTOTAL',''], align:['center','left','left','right','right','center'] },
}

function manualRowDefaults(tableType) {
  const base = { id: Date.now(), name: '', price: 0, quantity: 1, sku: '' }
  if (tableType === 'renta')      return { ...base, dailyRate: 0, deductible: 10, days: 30 }
  if (tableType === 'traslados')  return { ...base, delivery: 0, retrieval: 0 }
  return base
}

function rowSub(item, tableType) {
  const qty = item.quantity||1
  if (tableType==='traslados') return ((item.price||0)+(item.delivery||0)+(item.retrieval||0))*qty
  return (item.price||0)*qty
}

const IconPlus  = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconMinus = () => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const IconEdit  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

function NativePricingTable({ title, itemsB64, ivaRate, tableType = 'renta', onUpdate }) {
  const [catalogOpen, setCatalogOpen]   = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]     = useState(title)

  const items  = decodeItems(itemsB64)
  const cols   = PT_COLS[tableType] ?? PT_COLS.generic

  function save(newItems)    { onUpdate({ itemsB64: encodeItems(newItems) }) }
  function saveTitle()       { onUpdate({ title: titleDraft }); setEditingTitle(false) }
  function setQty(id, delta) { save(items.map(i=>i.id===id?{...i,quantity:Math.max(0,(i.quantity||1)+delta)}:i).filter(i=>i.quantity>0)) }
  function setQtyD(id, val)  { const n=Math.max(0,parseInt(val)||0); if(n===0)save(items.filter(i=>i.id!==id));else save(items.map(i=>i.id===id?{...i,quantity:n}:i)) }
  function setField(id,f,v)  { save(items.map(i=>i.id===id?{...i,[f]:parseFloat(v)||0}:i)) }
  function del(id)           { save(items.filter(i=>i.id!==id)) }

  function onCatalog({ items: picked, ivaRate: newIva }) {
    const ex = new Map(items.map(i=>[i.id,{...i}]))
    const defaults = tableType==='renta' ? { dailyRate:null,deductible:10,days:30 }
                   : tableType==='traslados' ? { delivery:0,retrieval:0 } : {}
    picked.forEach(p => ex.has(p.id) ? (ex.get(p.id).quantity=p.quantity) : ex.set(p.id,{...p,...defaults}))
    save([...ex.values()])
    onUpdate({ ivaRate: newIva })
    setCatalogOpen(false)
  }

  function setFieldText(id, field, val) { save(items.map(i=>i.id===id?{...i,[field]:val}:i)) }
  function addManualRow() { save([...items, manualRowDefaults(tableType)]) }

  const subtotal = items.reduce((s,i)=>s+rowSub(i,tableType),0)
  const iva      = subtotal*(ivaRate/100)
  const total    = subtotal+iva

  const NumInput = ({id,field,value}) => (
    <input type="number" min="0" step="0.01" value={value??''} className="pt-num-input"
      onChange={e=>setField(id,field,e.target.value)} onClick={e=>e.stopPropagation()} />
  )
  const TxtInput = ({id,field,value,placeholder,listId}) => (
    <>
      <input type="text" value={value??''} placeholder={placeholder}
        className="pt-text-input" list={listId}
        onChange={e=>setFieldText(id,field,e.target.value)} onClick={e=>e.stopPropagation()} />
      {listId && <datalist id={listId}>{VEHICLE_OPTIONS.map(v=><option key={v} value={v}/>)}</datalist>}
    </>
  )

  function renderRow(item) {
    const qty = item.quantity||1
    const qtyCell = (
      <div className="pt-c-qty">
        <div className="pt-qty-wrap">
          <button type="button" className="pt-qty-btn" onClick={()=>setQty(item.id,-1)}><IconMinus/></button>
          <input type="number" min="1" value={qty} className="pt-qty-input" onChange={e=>setQtyD(item.id,e.target.value)}/>
          <button type="button" className="pt-qty-btn" onClick={()=>setQty(item.id,1)}><IconPlus/></button>
        </div>
      </div>
    )
    const delCell = <div className="pt-c-del"><button type="button" className="pt-del-btn" onClick={()=>del(item.id)}><IconTrash/></button></div>

    if (tableType==='renta') return (
      <div key={item.id} className="pt-row" style={{gridTemplateColumns:cols.grid}}>
        {qtyCell}
        <div className="pt-c-name"><TxtInput id={item.id} field="name" value={item.name} placeholder="Tipo de unidad…" listId={`veh-r-${item.id}`}/></div>
        <div className="pt-c-price"><NumInput id={item.id} field="dailyRate" value={(item.dailyRate!=null?item.dailyRate:(item.price||0)/30).toFixed(2)}/></div>
        <div className="pt-c-price"><NumInput id={item.id} field="price" value={(item.price||0).toFixed(2)}/></div>
        <div className="pt-c-deductible">
          <input type="number" min="0" max="100" className="pt-pct-input" value={item.deductible??10} onChange={e=>setField(item.id,'deductible',e.target.value)} onClick={e=>e.stopPropagation()}/>
          <span className="pt-pct-symbol">%</span>
        </div>
        <div className="pt-c-deductible">
          <input type="number" min="1" className="pt-pct-input" style={{width:36}} value={item.days??30} onChange={e=>setField(item.id,'days',e.target.value)} onClick={e=>e.stopPropagation()}/>
        </div>
        {delCell}
      </div>
    )
    if (tableType==='traslados') {
      const sub = rowSub(item,'traslados')
      return (
        <div key={item.id} className="pt-row" style={{gridTemplateColumns:cols.grid}}>
          {qtyCell}
          <div className="pt-c-name"><TxtInput id={item.id} field="name" value={item.name} placeholder="Tipo de unidad…" listId={`veh-t-${item.id}`}/></div>
          <div className="pt-c-price"><NumInput id={item.id} field="price" value={(item.price||0).toFixed(2)}/></div>
          <div className="pt-c-price"><NumInput id={item.id} field="delivery" value={(item.delivery??0).toFixed(2)}/></div>
          <div className="pt-c-price"><NumInput id={item.id} field="retrieval" value={(item.retrieval??0).toFixed(2)}/></div>
          <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt(sub)}</div>
          {delCell}
        </div>
      )
    }
    if (tableType==='accesorios') return (
      <div key={item.id} className="pt-row" style={{gridTemplateColumns:cols.grid}}>
        {qtyCell}
        <div className="pt-c-name"><TxtInput id={item.id} field="name" value={item.name} placeholder="Accesorio…"/></div>
        <div className="pt-c-price"><NumInput id={item.id} field="price" value={(item.price||0).toFixed(2)}/></div>
        <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt((item.price||0)*qty)}</div>
        {delCell}
      </div>
    )
    return (
      <div key={item.id} className="pt-row" style={{gridTemplateColumns:cols.grid}}>
        {qtyCell}
        <div className="pt-c-name"><TxtInput id={item.id} field="name" value={item.name} placeholder="Nombre…"/></div>
        <div className="pt-c-sku"><TxtInput id={item.id} field="sku" value={item.sku} placeholder="SKU"/></div>
        <div className="pt-c-price"><NumInput id={item.id} field="price" value={(item.price||0).toFixed(2)}/></div>
        <div className="pt-c-subtotal pt-cell-num pt-cell-bold">{fmt((item.price||0)*qty)}</div>
        {delCell}
      </div>
    )
  }

  return (
    <div className="pt-block" style={{margin:'12px 0',userSelect:'none'}}>
      {/* Header */}
      <div className="pt-header">
        <div className="pt-header-left">
          {editingTitle ? (
            <input autoFocus className="pt-title-input" value={titleDraft}
              onChange={e=>setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e=>{if(e.key==='Enter')saveTitle();if(e.key==='Escape'){setTitleDraft(title);setEditingTitle(false)}}}/>
          ) : (
            <span className="pt-title" onClick={()=>{setTitleDraft(title);setEditingTitle(true)}}>
              {title} <span className="pt-edit-hint"><IconEdit/></span>
            </span>
          )}
        </div>
        <div className="pt-header-right">
          <label style={{fontSize:11,color:'rgba(255,255,255,0.7)',display:'flex',alignItems:'center',gap:4}}>
            IVA
            <select className="pt-iva-select" value={ivaRate} onChange={e=>onUpdate({ivaRate:Number(e.target.value)})}>
              <option value={0}>0%</option><option value={8}>8%</option><option value={16}>16%</option>
            </select>
          </label>
        </div>
      </div>

      {/* Column headers */}
      <div className="pt-cols-header" style={{gridTemplateColumns:cols.grid}}>
        {cols.headers.map((h,i)=><div key={i} style={{textAlign:cols.align[i]}}>{h}</div>)}
      </div>

      {/* Rows */}
      {items.length===0
        ? <div className="pt-empty-rows">Haz clic en <strong>+ Agregar del catálogo</strong> para agregar servicios</div>
        : items.map(item=>renderRow(item))
      }

      {/* Botones agregar */}
      <div className="pt-add-row">
        <button type="button" className="pt-add-btn" onClick={()=>setCatalogOpen(true)}>
          <IconPlus/> Del catálogo
        </button>
        <button type="button" className="pt-add-btn pt-add-btn-manual" onClick={addManualRow}>
          <IconPlus/> Fila manual
        </button>
      </div>

      {/* Totals */}
      {items.length>0 && (
        <div className="pt-totals">
          <div className="pt-total-line"><span>IVA {ivaRate}%</span><span className="pt-total-val">{fmt(iva)}</span></div>
          <div className="pt-total-line pt-total-grand"><span>TOTAL CON IVA</span><span className="pt-grand-val">{fmt(total)}</span></div>
        </div>
      )}

      {catalogOpen && (
        <CatalogPickerModal initialItems={items} onClose={()=>setCatalogOpen(false)} onConfirm={onCatalog}/>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// DOCUMENT EDITOR — Componente principal
// ─────────────────────────────────────────────────────────────────
const DocumentEditor = forwardRef(function DocumentEditor({ html, templateCss, onChange }, ref) {
  const editorRef   = useRef(null)
  const statesRef   = useRef({})
  const [ptHosts,  setPtHosts]  = useState({})
  const [ptStates, setPtStates] = useState({})

  // Keep statesRef in sync for use in callbacks
  useEffect(() => { statesRef.current = ptStates }, [ptStates])

  // Helper: inicializar/reinicializar hosts preservando estados previos de pt
  function initHosts(newHtml, preservedStates = {}) {
    if (!editorRef.current) return
    editorRef.current.innerHTML = preparePricingTableHosts(newHtml)
    const hosts = {}, states = {}
    editorRef.current.querySelectorAll('[data-pt-id]').forEach((el, idx) => {
      const id    = el.dataset.ptId
      const prevId = `pt-${idx + 1}`
      hosts[id]  = el
      // Preservar estado de la tabla (mantiene los productos agregados)
      states[id] = preservedStates[prevId] || {
        title:     el.getAttribute('data-title')      || 'Cotización',
        itemsB64:  el.getAttribute('data-items-b64')  || 'W10=',
        ivaRate:   Number(el.getAttribute('data-iva') || 16),
        tableType: el.getAttribute('data-table-type') || 'renta',
      }
    })
    setPtHosts(hosts)
    setPtStates(states)
    statesRef.current = states
  }

  // Inyectar CSS del template en el <head> del documento (scope global de la página)
  useEffect(() => {
    if (!templateCss) return
    const style = document.createElement('style')
    style.id = 'doc-editor-template-css'
    style.textContent = templateCss
    document.head.appendChild(style)
    return () => document.head.querySelector('#doc-editor-template-css')?.remove()
  }, [templateCss])

  // Initialize editor content once on mount
  useEffect(() => {
    initHosts(html)
  }, []) // eslint-disable-line

  // Expone updateHtml para actualizar texto sin perder los productos de las tablas
  useImperativeHandle(ref, () => ({
    updateHtml(newHtml) {
      initHosts(newHtml, statesRef.current)
      setTimeout(() => onChange?.(collectHtml(editorRef.current, statesRef.current)), 50)
    },
    getHtml() {
      return collectHtml(editorRef.current, statesRef.current)
    },
  }))

  const handleInput = useCallback(() => {
    onChange?.(collectHtml(editorRef.current, statesRef.current))
  }, [onChange])

  function handlePtUpdate(ptId, updates) {
    setPtStates(prev => {
      const next = { ...prev, [ptId]: { ...prev[ptId], ...updates } }
      statesRef.current = next
      onChange?.(collectHtml(editorRef.current, next))
      return next
    })
  }

  return (
    <div className="doc-native-editor">
      {templateCss && <style>{templateCss}</style>}

      <NativeToolbar editorRef={editorRef} />

      <div className="doc-native-scroll">
        <div className="doc-native-page-wrap">
          <div
            ref={editorRef}
            className="doc-native-page"
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            spellCheck={false}
          />
        </div>
      </div>

      {/* React portals — montan las tablas interactivas dentro del editor nativo */}
      {Object.entries(ptHosts).map(([id, hostEl]) =>
        createPortal(
          <div contentEditable={false} style={{ userSelect: 'none' }}>
            <NativePricingTable
              {...ptStates[id]}
              onUpdate={updates => handlePtUpdate(id, updates)}
            />
          </div>,
          hostEl
        )
      )}
    </div>
  )
})

export default DocumentEditor
