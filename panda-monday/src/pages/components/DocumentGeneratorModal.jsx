import { useState, useEffect, useCallback, useRef } from 'react'
import mondaySdk from 'monday-sdk-js'
import api from '../../api/client.js'
import WysiwygEditor from './WysiwygEditor.jsx'
import DocumentEditor from './DocumentEditor.jsx'
import CatalogPickerModal from './CatalogPickerModal.jsx'

const monday = mondaySdk()

// ── Preview: procesa <pricing-table> a HTML estático para el iframe ──
const _fmt = n => '$' + Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})
const _ths = 'background:#F5A000;color:white;font-weight:bold;font-size:8.5pt;padding:7px 10px;border:1px solid #ddd;'
const _tdc = 'padding:7px 10px;font-size:9pt;border:1px solid #e0e0e0;'

function processPreviewPricingTables(html) {
  return html.replace(/<pricing-table([^>]*)>\s*<\/pricing-table>/g, (_, attrs) => {
    const g = (re) => attrs.match(re)?.[1] ?? ''
    const title     = g(/data-title="([^"]*)"/) || 'Cotización'
    const tableType = g(/data-table-type="([^"]*)"/) || 'renta'
    const iva       = Number(g(/data-iva="([^"]*)"/) || 16)
    let items = []
    try { const b = g(/data-items-b64="([^"]*)"/) ; if (b) items = JSON.parse(atob(b)) } catch {}

    let thead = '', tbody = '', subtotal = 0

    if (tableType === 'renta') {
      thead = `<tr><th style="${_ths}text-align:center">CANTIDAD</th><th style="${_ths}">TIPO DE UNIDAD</th><th style="${_ths}text-align:right">TARIFA DIARIA</th><th style="${_ths}text-align:right">TARIFA MENSUAL</th><th style="${_ths}text-align:center">DEDUCIBLE</th><th style="${_ths}text-align:center">DÍAS</th></tr>`
      tbody = items.map(i => {
        const qty=i.quantity||1, sub=(i.price||0)*qty, daily=i.dailyRate!=null?i.dailyRate:(i.price||0)/30
        subtotal+=sub
        return `<tr><td style="${_tdc}text-align:center">${qty}</td><td style="${_tdc}">${i.name}</td><td style="${_tdc}text-align:right">${_fmt(daily)}</td><td style="${_tdc}text-align:right;font-weight:bold;color:#1B3055">${_fmt(i.price||0)}</td><td style="${_tdc}text-align:center">${i.deductible??10}%</td><td style="${_tdc}text-align:center">${i.days??30}</td></tr>`
      }).join('')
    } else if (tableType === 'traslados') {
      thead = `<tr><th style="${_ths}text-align:center">CANTIDAD</th><th style="${_ths}">TIPO UNIDAD</th><th style="${_ths}text-align:right">TRASLADO</th><th style="${_ths}text-align:right">ENTREGA</th><th style="${_ths}text-align:right">RECOLECCIÓN</th><th style="${_ths}text-align:right">SUBTOTAL</th></tr>`
      tbody = items.map(i => {
        const qty=i.quantity||1, sub=((i.price||0)+(i.delivery||0)+(i.retrieval||0))*qty
        subtotal+=sub
        return `<tr><td style="${_tdc}text-align:center">${qty}</td><td style="${_tdc}">${i.name}</td><td style="${_tdc}text-align:right">${_fmt(i.price||0)}</td><td style="${_tdc}text-align:right">${_fmt(i.delivery||0)}</td><td style="${_tdc}text-align:right">${_fmt(i.retrieval||0)}</td><td style="${_tdc}text-align:right;font-weight:bold;color:#1B3055">${_fmt(sub)}</td></tr>`
      }).join('')
    } else if (tableType === 'accesorios') {
      thead = `<tr><th style="${_ths}text-align:center">CANTIDAD</th><th style="${_ths}">ACCESORIO / SERVICIO</th><th style="${_ths}text-align:right">SUBTOTAL</th></tr>`
      tbody = items.map(i => {
        const qty=i.quantity||1, sub=(i.price||0)*qty; subtotal+=sub
        return `<tr><td style="${_tdc}text-align:center">${qty}</td><td style="${_tdc}">${i.name}</td><td style="${_tdc}text-align:right;font-weight:bold;color:#1B3055">${_fmt(sub)}</td></tr>`
      }).join('')
    } else {
      thead = `<tr><th style="${_ths}text-align:center">CANT.</th><th style="${_ths}">SERVICIO</th><th style="${_ths}text-align:right">PRECIO</th><th style="${_ths}text-align:right">SUBTOTAL</th></tr>`
      tbody = items.map(i => {
        const qty=i.quantity||1, sub=(i.price||0)*qty; subtotal+=sub
        return `<tr><td style="${_tdc}text-align:center">${qty}</td><td style="${_tdc}">${i.name}</td><td style="${_tdc}text-align:right">${_fmt(i.price||0)}</td><td style="${_tdc}text-align:right;font-weight:bold;color:#1B3055">${_fmt(sub)}</td></tr>`
      }).join('')
    }

    if (!items.length) tbody = `<tr><td colspan="6" style="${_tdc}text-align:center;color:#999;font-style:italic;padding:14px">Sin artículos — agregar desde el catálogo</td></tr>`

    const ivaAmt = subtotal*(iva/100), total = subtotal+ivaAmt
    const totals = items.length ? `<div style="text-align:right;padding:6px 0;font-size:9.5pt">
      <span style="color:#1B3055;font-weight:bold">IVA ${iva}%&nbsp;&nbsp;${_fmt(ivaAmt)}</span>
      &nbsp;&nbsp;&nbsp;
      <span style="color:#F5A000;font-size:12pt;font-weight:bold">Total con IVA&nbsp;&nbsp;${_fmt(total)}</span>
    </div>` : ''

    return `<div style="margin:16px 0">
      <div style="background:#1B3055;color:white;font-weight:bold;padding:10px 16px;font-size:11pt;letter-spacing:0.5px">${title.toUpperCase()}</div>
      <table style="width:100%;border-collapse:collapse"><thead>${thead}</thead><tbody>${tbody}</tbody></table>
      ${totals}
    </div>`
  })
}

function buildPreviewDoc(currentHtml, css) {
  const processed = processPreviewPricingTables(currentHtml)
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<style>
  html,body{margin:0;padding:0;background:#6b7280;}
  .page-wrap{max-width:800px;margin:0 auto;background:white;box-shadow:0 4px 24px rgba(0,0,0,0.4);}
  ${css}
</style>
</head>
<body>
  <div class="page-wrap">${processed}</div>
</body></html>`
}

// ── Inyecta los items del editor TipTap en el HTML original del template ──
// El template original tiene CSS y clases → el editor TipTap tiene los items del catálogo
// Resultado: HTML con diseño completo + productos seleccionados
function mergePricingTableItems(templateHtml, tiptapHtml) {
  // Extrae los nodos <pricing-table> del HTML de TipTap (tienen data-items-b64 con items reales)
  const tiptapNodes = {}
  tiptapHtml.replace(/<pricing-table([^>]*)><\/pricing-table>/g, (match, attrs) => {
    const titleM = attrs.match(/data-title="([^"]*)"/)
    const typeM  = attrs.match(/data-table-type="([^"]*)"/)
    const key    = `${titleM?.[1]||''}|${typeM?.[1]||''}`
    tiptapNodes[key] = match
  })

  // Sustituye los nodos vacíos del template original con los llenados del editor
  return templateHtml.replace(/<pricing-table([^>]*)>\s*<\/pricing-table>/g, (original, attrs) => {
    const titleM = attrs.match(/data-title="([^"]*)"/)
    const typeM  = attrs.match(/data-table-type="([^"]*)"/)
    const key    = `${titleM?.[1]||''}|${typeM?.[1]||''}`
    return tiptapNodes[key] ?? original
  })
}

// ── Mapeo de variables por plantilla (guardado en localStorage) ──
const tplMapKey  = id => `maxi_tpl_map_${id}`
function loadTplMap(tplId)             { try { return JSON.parse(localStorage.getItem(tplMapKey(tplId)) ?? '{}') } catch { return {} } }
function saveTplMap(tplId, varN, colId){ const m = loadTplMap(tplId); m[varN] = colId; localStorage.setItem(tplMapKey(tplId), JSON.stringify(m)) }
function saveTplValue(tplId, varN, val){ const key = `maxi_tpl_val_${tplId}`; const m = (() => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') } catch { return {} } })(); m[varN] = val; localStorage.setItem(key, JSON.stringify(m)) }
function loadTplValues(tplId)          { try { return JSON.parse(localStorage.getItem(`maxi_tpl_val_${tplId}`) ?? '{}') } catch { return {} } }

// ── Parse pricing tables del HTML del template ──────────────────
function parsePricingTablesFromHtml(html) {
  const tables = []
  let i = 0
  ;(html || '').replace(/<pricing-table([^>]*)>\s*<\/pricing-table>/g, (_, attrs) => {
    const g = re => attrs.match(re)?.[1] ?? ''
    tables.push({
      key:       `pt-${++i}`,
      title:     g(/data-title="([^"]*)"/) || 'Cotización',
      tableType: g(/data-table-type="([^"]*)"/) || 'renta',
      ivaRate:   Number(g(/data-iva="([^"]*)"/) || 16),
      items:     [],
    })
  })
  return tables
}

// ── Inyecta items de ptStates en el HTML del template ──────────
function injectPricingTableStates(templateHtml, ptStates) {
  let i = 0
  return (templateHtml || '').replace(/<pricing-table([^>]*)>\s*<\/pricing-table>/g, (match, attrs) => {
    const st = ptStates[i++]
    if (!st) return match
    const newB64 = btoa(unescape(encodeURIComponent(JSON.stringify(st.items))))
    return match
      .replace(/data-items-b64="[^"]*"/, `data-items-b64="${newB64}"`)
      .replace(/data-iva="[^"]*"/, `data-iva="${st.ivaRate}"`)
  })
}

// ── Detección de tipo de campo ─────────────────────────────────
function detectFieldType(varName) {
  const lc = varName.toLowerCase()
  if (/fecha|date/.test(lc)) return 'date'
  if (/iva$|pct|porcentaje|cantidad|^num|monto|tarifa|precio|dias$/.test(lc)) return 'number'
  if (/vigencia|plazo|tipo|periodo|contrato|unidad/.test(lc)) return 'select'
  return 'text'
}

const FIELD_SELECT_OPTIONS = {
  vigencia:      ['15 días', '30 días', '60 días', '90 días', '6 meses', '12 meses'],
  plazo:         ['15 días', '30 días', '60 días', '90 días'],
  tipo:          ['Renta mensual', 'Renta diaria', 'Arrendamiento'],
  tipo_contrato: ['Renta mensual', 'Renta diaria', 'Arrendamiento'],
  periodo:       ['1 mes', '3 meses', '6 meses', '12 meses'],
  unidad:        ['Pick up 4x4', 'Camioneta', 'Sedan', 'SUV', 'Camión'],
}

// ── Helpers ────────────────────────────────────────────────────
function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function scoreMatch(varName, colTitle) {
  const vn = normalize(varName), ct = normalize(colTitle)
  if (vn === ct) return 3
  if (ct.includes(vn) || vn.includes(ct)) return 2
  const shared = vn.split('_').filter(p => ct.split('_').includes(p)).length
  return shared > 0 ? 1 : 0
}

function mapMondayColumns(columns, variables) {
  const result = {}
  for (const variable of variables) {
    // 1. Match exacto por column ID (ej: variable = "text_abc123" = column id)
    const byId = columns.find(c => c.id === variable)
    if (byId?.text) { result[variable] = byId.text; continue }

    // 2. Match por nombre (score)
    let best = null, bestScore = 0
    for (const col of columns) {
      const score = scoreMatch(variable, col.title)
      if (score > bestScore) { bestScore = score; best = col }
    }
    if (bestScore > 0 && best?.text) result[variable] = best.text
  }
  return result
}

// Detecta {{variables}} que quedaron sin llenar en el HTML
function detectUnfilled(html) {
  const matches = html.matchAll(/\{\{(\w+)\}\}/g)
  return [...new Set([...matches].map(m => m[1]))]
}

// Reemplaza {{variables}} en HTML con los valores dados
function applyValues(html, values) {
  let result = html
  for (const [key, val] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, val ?? '')
  }
  return result
}

const MAPPING_KEY = 'maxi_col_mapping'
function loadSavedMapping() {
  try { return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}') } catch { return {} }
}
function saveMapping(varName, colId) {
  const m = loadSavedMapping(); m[varName] = colId
  localStorage.setItem(MAPPING_KEY, JSON.stringify(m))
}

// ── Icons ──────────────────────────────────────────────────────
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconGenerate = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
)
const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)
const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
)
const IconPdf = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <path d="M9 13h1a2 2 0 0 1 0 4H9v-4z"/><path d="M13 13h3"/><path d="M13 17h2"/>
  </svg>
)

// ══════════════════════════════════════════════════════════════
// STEP 0 — Configuración rápida
// ══════════════════════════════════════════════════════════════
function SetupStep({
  templates, loadingTpl, loadingItem, selectedTpl, docName,
  mondayCols, fieldValues, error, itemName, itemId, boardId,
  contactSearch, contactResults, searchingContact,
  ptStates, onPtUpdate,
  onSelectTemplate, onSetDocName, onOpenEditor, onClose,
  onUpdateField, onManualMap, onImportDemoTemplates,
  onContactSearch, onSelectContact,
}) {
  const [catalogForPt, setCatalogForPt] = useState(null) // key de la tabla abierta
  const variables   = selectedTpl?.variables ?? []
  const filled      = variables.filter(v => fieldValues[v])
  const unfilled    = variables.filter(v => !fieldValues[v])
  const fillPct     = variables.length ? Math.round((filled.length / variables.length) * 100) : 0

  return (
    <>
      <div className="modal-header">
        <div className="modal-header-icon">
          <div className="modal-header-icon-wrap primary"><IconGenerate /></div>
          <div>
            <div className="modal-title">Nuevo documento{itemName ? ` — ${itemName}` : ''}</div>
            <div className="modal-subtitle">Selecciona plantilla y abre el editor</div>
          </div>
        </div>
        <button className="close-btn" onClick={onClose} type="button"><IconClose /></button>
      </div>

      <div className="modal-body">
        {error && <div className="error-msg"><IconAlert />{error}</div>}

        {loadingItem && (
          <div className="dg-loading-row">
            <span className="spinner-sm" />Cargando datos del contacto desde Monday…
          </div>
        )}

        {/* Búsqueda de contacto — se muestra cuando no hay itemId (Board View) */}
        {!itemId && boardId && (
          <div className="form-group">
            <label className="form-label">
              Buscar contacto de Monday
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6 }}>
                (para autollenar variables)
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                placeholder="Escribe el nombre del cliente…"
                value={contactSearch}
                onChange={e => onContactSearch(e.target.value)}
              />
              {searchingContact && (
                <span className="spinner-sm" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} />
              )}
              {contactResults.length > 0 && (
                <div className="dg-contact-dropdown">
                  {contactResults.map(item => (
                    <button key={item.id} type="button" className="dg-contact-option"
                      onClick={() => onSelectContact(item)}>
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>ID: {item.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Template selector */}
        <div className="form-group">
          <label className="form-label">Plantilla *</label>
          {loadingTpl ? (
            <div className="dg-loading-row"><span className="spinner-sm" />Cargando plantillas…</div>
          ) : (
            <>
              <select className="form-select" value={selectedTpl?.id ?? ''}
                onChange={e => onSelectTemplate(e.target.value)}>
                <option value="">— Selecciona una plantilla —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {templates.length === 0 && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm"
                    style={{ fontSize: 12 }}
                    onClick={onImportDemoTemplates}>
                    📥 Importar plantillas MAXIRent
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Importa las plantillas de demostración a tu cuenta
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Document name */}
        <div className="form-group">
          <label className="form-label">Nombre del documento *</label>
          <input className="form-input" value={docName}
            onChange={e => onSetDocName(e.target.value)}
            placeholder="Ej: Propuesta MAXIRent — Empresa X" />
        </div>

        {/* Monday auto-fill status */}
        {selectedTpl && variables.length > 0 && (
          <div className="dg-autofill-panel">
            <div className="dg-autofill-header">
              <span className="dg-autofill-label">
                {filled.length === variables.length
                  ? <><IconCheck /> Todos los campos llenados desde Monday.com</>
                  : `${filled.length}/${variables.length} campos llenados automáticamente`}
              </span>
              <span className="dg-autofill-pct">{fillPct}%</span>
            </div>
            <div className="dg-progress-bar">
              <div className="dg-progress-fill" style={{ width: `${fillPct}%` }} />
            </div>

            {/* Variables auto-llenadas */}
            {filled.length > 0 && (
              <div className="dg-vars-group">
                <div className="dg-vars-group-title">✓ Llenadas automáticamente</div>
                <div className="dg-vars-chips">
                  {filled.map(v => (
                    <div key={v} className="dg-var-chip dg-var-chip-ok">
                      <span className="dg-var-name">{v}</span>
                      <span className="dg-var-val">{fieldValues[v]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Variables sin llenar */}
            {unfilled.length > 0 && (
              <div className="dg-vars-group">
                <div className="dg-vars-group-title">
                  ⚠ Sin llenar — puedes completarlas aquí o editarlas directamente en el documento
                </div>
                {unfilled.map(v => {
                  const savedMap = loadSavedMapping()
                  const mappedColId = savedMap[v]
                  return (
                    <div key={v} className="dg-unfilled-row">
                      <span className="dg-var-tag">{`{{${v}}}`}</span>
                      {mondayCols.length > 0 && (
                        <select className="col-picker-select" value={mappedColId ?? ''}
                          onChange={e => { onManualMap(v, e.target.value) }}
                          style={{ flex: 1, fontSize: 11 }}>
                          <option value="">— columna Monday —</option>
                          {mondayCols.map(col => (
                            <option key={col.id} value={col.id}>
                              {col.title} [{col.id}]{col.text ? ` = ${col.text.slice(0, 15)}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <input className="form-input" style={{ flex: 2, fontSize: 12 }}
                        value={fieldValues[v] ?? ''}
                        onChange={e => onUpdateField(v, e.target.value)}
                        placeholder={`Valor para {{${v}}}`} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Columnas disponibles de Monday — con IDs para mapeo */}
        {mondayCols.length > 0 && (
          <details className="dg-cols-details">
            <summary className="dg-cols-summary">
              📋 {mondayCols.length} columnas de Monday — ver IDs para autofill
            </summary>
            <div style={{ padding: '6px 8px', background: '#e8f0fe', borderRadius: 4, fontSize: 11, color: '#1B3055', margin: '4px 0' }}>
              💡 <strong>Elemento</strong> (nombre del item) = <code style={{ background: '#1B3055', color: 'white', padding: '0 4px', borderRadius: 3 }}>{'{{name}}'}</code> — ya incluido automáticamente
            </div>
            <div className="dg-cols-grid">
              {mondayCols.map(col => (
                <div key={col.id} className="dg-col-row">
                  <code className="dg-col-id">{'{{' + col.id + '}}'}</code>
                  <span className="dg-col-title">{col.title}</span>
                  <span className="dg-col-val">{col.text || '—'}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* ── TABLAS DE COTIZACIÓN — gestión en el setup ── */}
        {ptStates.length > 0 && (
          <div className="dg-pt-section">
            <div className="dg-pt-section-title">Tablas de cotización</div>
            {ptStates.map((pt, idx) => {
              const totalItems = pt.items.length
              const subtotal   = pt.items.reduce((s, i) => s + (i.price||0)*(i.quantity||1), 0)
              return (
                <div key={pt.key} className="dg-pt-row">
                  <div className="dg-pt-row-info">
                    <span className="dg-pt-row-title">{pt.title}</span>
                    {totalItems > 0
                      ? <span className="dg-pt-row-count">{totalItems} item{totalItems > 1 ? 's' : ''} · ${subtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                      : <span className="dg-pt-row-empty">Sin artículos</span>
                    }
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm"
                    onClick={() => setCatalogForPt(idx)}>
                    🗂 {totalItems > 0 ? 'Editar' : 'Agregar del catálogo'}
                  </button>
                  {totalItems > 0 && (
                    <button type="button" className="btn btn-danger btn-sm btn-icon"
                      onClick={() => onPtUpdate(idx, { items: [], ivaRate: pt.ivaRate })}
                      title="Vaciar tabla">
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {catalogForPt !== null && (
          <CatalogPickerModal
            initialItems={ptStates[catalogForPt]?.items ?? []}
            onClose={() => setCatalogForPt(null)}
            onConfirm={({ items, ivaRate }) => {
              onPtUpdate(catalogForPt, { items, ivaRate })
              setCatalogForPt(null)
            }}
          />
        )}
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary"
          disabled={!selectedTpl || loadingTpl}
          onClick={onOpenEditor}>
          Abrir en editor <IconArrowRight />
        </button>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// PANEL LATERAL DE CAMPOS — Fase C
// ══════════════════════════════════════════════════════════════
function FieldsPanel({ variables, fieldValues, autoFilled, onFieldChange, onApply, applying }) {
  const [search, setSearch] = useState('')

  const filtered = variables.filter(v =>
    !search || v.toLowerCase().includes(search.toLowerCase())
  )
  const filled   = variables.filter(v => fieldValues[v])
  const fillPct  = variables.length ? Math.round((filled.length / variables.length) * 100) : 0

  return (
    <div className="doc-fields-panel">
      {/* Header */}
      <div className="doc-fields-panel-header">
        <div className="doc-fields-panel-title">Campos</div>
        <div className="doc-fields-panel-stats">
          <div className="doc-fields-mini-bar">
            <div className="doc-fields-mini-fill" style={{ width: `${fillPct}%` }} />
          </div>
          <span className="doc-fields-panel-pct">{filled.length}/{variables.length}</span>
        </div>
      </div>

      {/* Búsqueda */}
      {variables.length > 5 && (
        <div className="doc-fields-search">
          <input
            className="doc-fields-search-input"
            placeholder="Buscar campo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Lista de campos */}
      <div className="doc-fields-list">
        {filtered.map(varName => {
          const type    = detectFieldType(varName)
          const value   = fieldValues[varName] ?? ''
          const fromMon = autoFilled.has(varName)
          const isEmpty = !value

          const opts = FIELD_SELECT_OPTIONS[varName.toLowerCase()] ?? null

          return (
            <div key={varName} className={`doc-field-item ${isEmpty ? 'doc-field-item-empty' : ''}`}>
              <div className="doc-field-label-row">
                <span className="doc-field-name" title={`{{${varName}}}`}>{varName.replace(/_/g, ' ')}</span>
                <span className={`doc-field-badge ${fromMon ? 'doc-field-badge-monday' : isEmpty ? 'doc-field-badge-empty' : 'doc-field-badge-manual'}`}>
                  {fromMon ? '● Monday' : isEmpty ? '○ Vacío' : '✎ Manual'}
                </span>
              </div>

              {(type === 'select' && opts) ? (
                <select
                  className={`doc-field-input ${isEmpty ? 'doc-field-input-empty' : ''}`}
                  value={value}
                  onChange={e => onFieldChange(varName, e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : type === 'date' ? (
                <input type="date"
                  className={`doc-field-input ${isEmpty ? 'doc-field-input-empty' : ''}`}
                  value={value}
                  onChange={e => onFieldChange(varName, e.target.value)}
                />
              ) : type === 'number' ? (
                <input type="number"
                  className={`doc-field-input ${isEmpty ? 'doc-field-input-empty' : ''}`}
                  value={value}
                  placeholder={`{{${varName}}}`}
                  onChange={e => onFieldChange(varName, e.target.value)}
                />
              ) : (
                <input type="text"
                  className={`doc-field-input ${isEmpty ? 'doc-field-input-empty' : ''}`}
                  value={value}
                  placeholder={`{{${varName}}}`}
                  onChange={e => onFieldChange(varName, e.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Botón aplicar */}
      <div className="doc-fields-apply-row">
        <button type="button" className="btn btn-primary btn-sm"
          style={{ width: '100%' }}
          onClick={onApply}
          disabled={applying}
        >
          {applying ? <><span className="spinner-sm" />Aplicando…</> : '↺ Aplicar al documento'}
        </button>
        <div className="doc-fields-apply-hint">
          Reemplaza los campos <code>{'{{variable}}'}</code> en el documento
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// STEP 1 — Editor de documento en vivo (con panel Fase C)
// ══════════════════════════════════════════════════════════════
function EditorStep({
  docName, editorHtml, templateCss, editorRef,
  generating, error, unfilled,
  variables, fieldValues, autoFilled, applying,
  onDocNameChange, onHtmlChange, onGeneratePdf, onBack,
  onFieldChange, onApplyFields,
}) {
  const [panelOpen, setPanelOpen] = useState(true)

  return (
    <div className="doc-editor-layout">
      {/* ── Barra superior ──────────────────────────────── */}
      <div className="doc-editor-topbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          <IconArrowLeft /> Volver
        </button>

        {variables.length > 0 && (
          <button
            type="button"
            className={`btn btn-secondary btn-sm ${panelOpen ? 'active' : ''}`}
            onClick={() => setPanelOpen(v => !v)}
            style={{ fontSize: 11, padding: '5px 10px' }}
          >
            ≡ Campos
            {unfilled.length > 0 && (
              <span style={{ marginLeft: 4, background: '#ffc107', color: '#333', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>
                {unfilled.length}
              </span>
            )}
          </button>
        )}

        <input
          className="doc-editor-name-input"
          value={docName}
          onChange={e => onDocNameChange(e.target.value)}
          placeholder="Nombre del documento"
        />

        {error && <div className="doc-editor-error"><IconAlert />{error}</div>}

        <button type="button" className="btn btn-primary" onClick={onGeneratePdf} disabled={generating}>
          {generating
            ? <><span className="spinner-sm" />Generando PDF…</>
            : <><IconPdf /> Generar PDF</>
          }
        </button>
      </div>

      {/* ── Cuerpo: panel de campos + editor nativo ─────── */}
      <div className="doc-editor-content">
        {panelOpen && variables.length > 0 && (
          <FieldsPanel
            variables={variables}
            fieldValues={fieldValues}
            autoFilled={autoFilled}
            onFieldChange={onFieldChange}
            onApply={onApplyFields}
            applying={applying}
          />
        )}

        {/* Editor nativo — documento formateado con CSS real + tablas interactivas */}
        <div className="doc-editor-body">
          <DocumentEditor
            ref={editorRef}
            html={editorHtml}
            templateCss={templateCss}
            onChange={onHtmlChange}
          />
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function DocumentGeneratorModal({ itemId, boardId, onClose, onGenerated }) {
  const [step, setStep]             = useState(0)

  // Setup state
  const [templates, setTemplates]   = useState([])
  const [selectedTpl, setSelectedTpl] = useState(null)
  const [docName, setDocName]       = useState('')
  const [fieldValues, setFieldValues] = useState({})
  const [mondayCols, setMondayCols] = useState([])
  const [itemName, setItemName]     = useState('')
  const [loadingTpl, setLoadingTpl] = useState(true)
  const [loadingItem, setLoadingItem] = useState(false)
  const [error, setError]           = useState(null)

  // Editor state
  const [editorHtml, setEditorHtml]     = useState('')
  const [editorKey, setEditorKey]       = useState(0)   // fuerza remount al aplicar campos
  const [currentHtml, setCurrentHtml]   = useState('')
  const [unfilledVars, setUnfilledVars] = useState([])
  const [generating, setGenerating]     = useState(false)
  const [applying, setApplying]         = useState(false)
  const [autoFilled, setAutoFilled]     = useState(new Set())
  const [templateCss, setTemplateCss]   = useState('')
  const docEditorRef = useRef(null)

  // Búsqueda de contacto (para Board View donde no hay itemId)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState([])
  const [searchingContact, setSearchingContact] = useState(false)

  // Tablas de precios en el setup (para llenar antes de abrir el editor)
  const [ptStates, setPtStates] = useState([]) // [{ key, title, tableType, ivaRate, items }]

  // Load templates
  useEffect(() => {
    api.get('/api/templates')
      .then(res => setTemplates(res.data))
      .catch(() => setError('Error al cargar plantillas'))
      .finally(() => setLoadingTpl(false))
  }, [])

  // Load Monday item data
  useEffect(() => {
    if (!itemId) return
    setLoadingItem(true)
    monday.api(`
      query {
        items(ids: [${itemId}]) {
          name
          column_values { id title text }
        }
      }
    `).then(res => {
      const item = res.data?.items?.[0]
      if (item) {
        setItemName(item.name)
        // "name" es el ID especial de Monday para el nombre del item
        const cols = item.column_values.filter(c => c.text?.trim())
        cols.unshift({ id: 'name', title: 'Nombre (item)', text: item.name })
        setMondayCols(cols)
      }
    }).catch(() => {}).finally(() => setLoadingItem(false))
  }, [itemId])

  function applyMondayMapping(tplVariables) {
    if (!mondayCols.length || !tplVariables?.length) return {}
    const saved   = loadSavedMapping()
    const autoMap = mapMondayColumns(mondayCols, tplVariables)
    const result  = { ...autoMap }
    for (const [varName, colId] of Object.entries(saved)) {
      const col = mondayCols.find(c => c.id === colId)
      if (col?.text) result[varName] = col.text
    }
    return result
  }

  // ── Búsqueda de contacto en Board View ─────────────────────
  async function handleContactSearch(query) {
    setContactSearch(query)
    if (!query.trim() || query.length < 2 || !boardId) { setContactResults([]); return }
    setSearchingContact(true)
    try {
      const res = await monday.api(`
        query {
          boards(ids: [${boardId}]) {
            items_page(limit: 8, query_params: {
              rules: [{ column_id: "name", compare_value: "${query}", operator: contains_text }]
            }) {
              items { id name column_values { id title text } }
            }
          }
        }
      `)
      setContactResults(res.data?.boards?.[0]?.items_page?.items ?? [])
    } catch { setContactResults([]) }
    finally { setSearchingContact(false) }
  }

  function handleSelectContact(item) {
    setItemName(item.name)
    setContactSearch(item.name)
    setContactResults([])
    const cols = item.column_values.filter(c => c.text?.trim())
    cols.unshift({ id: 'name', title: 'Nombre (item)', text: item.name })
    setMondayCols(cols)
    // Re-aplicar mapping con las nuevas columnas
    if (selectedTpl) {
      const vals = { ...applyMondayMappingWith(cols, selectedTpl.variables ?? []) }
      setFieldValues(vals)
    }
  }

  function applyMondayMappingWith(cols, vars) {
    if (!cols.length || !vars?.length) return {}
    const saved   = loadSavedMapping()
    const autoMap = mapMondayColumns(cols, vars)
    const result  = { ...autoMap }
    for (const [varName, colId] of Object.entries(saved)) {
      const col = cols.find(c => c.id === colId)
      if (col?.text) result[varName] = col.text
    }
    return result
  }

  async function handleSelectTemplate(id) {
    const tpl = templates.find(t => t.id === id) ?? null
    setSelectedTpl(tpl)
    if (!tpl) { setFieldValues({}); setDocName(''); setPtStates([]); return }

    const label = itemName ? ` — ${itemName}` : ''
    setDocName(`${tpl.name}${label}`)

    // Cargar valores guardados de esta plantilla + Monday autofill
    const savedVals = loadTplValues(tpl.id)
    const mondayVals = applyMondayMappingForTemplate(tpl.variables ?? [], tpl.id)
    setFieldValues({ ...savedVals, ...mondayVals })

    // Cargar tablas de precios — necesitamos el content_html completo
    let html = tpl.content_html
    if (!html) {
      try {
        const res = await api.get(`/api/templates/${tpl.id}`)
        html = res.data.content_html
        setSelectedTpl(res.data)
      } catch { /* ignore */ }
    }
    setPtStates(parsePricingTablesFromHtml(html))
  }

  function applyMondayMappingForTemplate(vars, tplId) {
    if (!mondayCols.length || !vars?.length) return {}
    const tplMap  = loadTplMap(tplId)
    const autoMap = mapMondayColumns(mondayCols, vars)
    const result  = { ...autoMap }
    for (const [varName, colId] of Object.entries(tplMap)) {
      const col = mondayCols.find(c => c.id === colId)
      if (col?.text) result[varName] = col.text
    }
    return result
  }

  // ── Importar plantillas demo desde cuenta 'dev' ─────────────
  async function handleImportDemoTemplates() {
    try {
      setLoadingTpl(true)
      const res = await api.post('/api/templates/migrate-dev')
      const data = res.data
      if (data.migrated > 0) {
        const tpls = await api.get('/api/templates')
        setTemplates(tpls.data)
        setError(null)
      } else {
        setError('No hay plantillas nuevas para importar')
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Error al importar plantillas')
    } finally {
      setLoadingTpl(false)
    }
  }

  function handleManualMap(varName, colId) {
    saveMapping(varName, colId)
    const col = mondayCols.find(c => c.id === colId)
    if (col?.text) setFieldValues(prev => ({ ...prev, [varName]: col.text }))
  }

  function handleUpdateField(varName, value) {
    setFieldValues(prev => ({ ...prev, [varName]: value }))
    if (selectedTpl?.id) saveTplValue(selectedTpl.id, varName, value)
  }

  function handleManualMapWithSave(varName, colId) {
    if (selectedTpl?.id) saveTplMap(selectedTpl.id, varName, colId)
    handleManualMap(varName, colId)
  }

  // ── Abrir editor: carga el HTML completo (la lista no lo incluye) ──
  async function handleOpenEditor() {
    if (!selectedTpl) { setError('Selecciona una plantilla'); return }
    if (!docName.trim()) { setError('El nombre del documento es requerido'); return }

    setError(null)

    // El listado de plantillas no incluye content_html — lo buscamos por ID
    let html = selectedTpl.content_html
    if (!html) {
      try {
        setLoadingTpl(true)
        const res = await api.get(`/api/templates/${selectedTpl.id}`)
        html = res.data.content_html
        setSelectedTpl(res.data)   // actualizar con objeto completo
      } catch {
        setError('Error al cargar la plantilla')
        return
      } finally {
        setLoadingTpl(false)
      }
    }

    const autoFilledNow = new Set(Object.keys(fieldValues).filter(k => fieldValues[k]))
    setAutoFilled(autoFilledNow)

    // Extraer CSS del template
    const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/i)
    setTemplateCss(cssMatch?.[1] ?? '')

    // Inyectar items de las tablas configuradas en el setup
    const htmlWithPt = injectPricingTableStates(html, ptStates)
    const filled = applyValues(htmlWithPt, fieldValues)
    const unfilled = detectUnfilled(filled)
    setEditorHtml(filled)
    setCurrentHtml(filled)
    setUnfilledVars(unfilled)
    setStep(1)
  }

  // ── Cambio de campo en el panel lateral ─────────────────────
  function handleFieldChange(varName, value) {
    setFieldValues(prev => ({ ...prev, [varName]: value }))
  }

  // ── Aplicar campos del panel al documento (sin perder productos) ───
  function handleApplyFields() {
    const html = selectedTpl?.content_html
    if (!html) return
    setApplying(true)
    const fresh    = applyValues(html, fieldValues)
    const unfilled = detectUnfilled(fresh)
    setUnfilledVars(unfilled)

    if (docEditorRef.current?.updateHtml) {
      // Actualiza texto preservando los items de las tablas de precios
      docEditorRef.current.updateHtml(fresh)
      setCurrentHtml(fresh)
    } else {
      // Fallback: remountar si el ref no está listo
      setEditorHtml(fresh)
      setCurrentHtml(fresh)
    }
    setTimeout(() => setApplying(false), 400)
  }

  // ── Trackear cambios del editor ─────────────────────────────
  const handleHtmlChange = useCallback((html) => {
    setCurrentHtml(html)
    setUnfilledVars(detectUnfilled(html))
  }, [])

  // ── Generar PDF desde el contenido actual del editor ────────
  async function handleGeneratePdf() {
    if (!docName.trim()) { setError('El nombre del documento es requerido'); return }
    setGenerating(true)
    setError(null)
    try {
      // Estrategia: usar el HTML ORIGINAL del template (preserva CSS + clases)
      // e inyectar los <pricing-table> con items del editor TipTap (currentHtml)
      const templateBase = selectedTpl?.content_html
      const finalHtml = templateBase
        ? mergePricingTableItems(templateBase, currentHtml)
        : currentHtml

      const res = await api.post('/api/documents/generate', {
        template_id:     selectedTpl?.id,
        name:            docName,
        monday_board_id: boardId ? String(boardId) : undefined,
        monday_item_id:  itemId  ? String(itemId)  : undefined,
        content_html:    finalHtml,
        filled_data:     fieldValues,
      })

      if (itemId) {
        monday.api(`
          mutation {
            create_update(item_id: ${itemId}, body: "📄 Se generó el documento \\"${docName}\\" desde MaxiDocs.") { id }
          }
        `).catch(() => {})
      }

      onGenerated(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al generar el documento')
    } finally {
      setGenerating(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="modal-overlay">
        <div className="modal modal-fce">
          <EditorStep
            docName={docName}
            editorHtml={editorHtml}
            templateCss={templateCss}
            editorRef={docEditorRef}
            generating={generating}
            error={error}
            unfilled={unfilledVars}
            variables={selectedTpl?.variables ?? []}
            fieldValues={fieldValues}
            autoFilled={autoFilled}
            applying={applying}
            onDocNameChange={setDocName}
            onHtmlChange={handleHtmlChange}
            onGeneratePdf={handleGeneratePdf}
            onBack={() => { setStep(0); setError(null) }}
            onFieldChange={handleFieldChange}
            onApplyFields={handleApplyFields}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-md">
        <SetupStep
          templates={templates}
          loadingTpl={loadingTpl}
          loadingItem={loadingItem}
          selectedTpl={selectedTpl}
          docName={docName}
          mondayCols={mondayCols}
          fieldValues={fieldValues}
          error={error}
          itemName={itemName}
          itemId={itemId}
          boardId={boardId}
          contactSearch={contactSearch}
          contactResults={contactResults}
          searchingContact={searchingContact}
          ptStates={ptStates}
          onPtUpdate={(idx, updates) => setPtStates(prev => prev.map((pt, i) => i === idx ? { ...pt, ...updates } : pt))}
          onSelectTemplate={handleSelectTemplate}
          onSetDocName={setDocName}
          onOpenEditor={handleOpenEditor}
          onClose={onClose}
          onUpdateField={handleUpdateField}
          onManualMap={handleManualMapWithSave}
          onImportDemoTemplates={handleImportDemoTemplates}
          onContactSearch={handleContactSearch}
          onSelectContact={handleSelectContact}
        />
      </div>
    </div>
  )
}
