import { useState, useEffect, useRef, Component } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { decodeItems, encodeItems, decodeColumns, encodeColumns } from './PricingTableExtension.js'
import CatalogPickerModal from './CatalogPickerModal.jsx'
import api from '../../api/client.js'
import { TRAMOS, rateFor, monthlyFrom, minTramo, tramoById } from '../../shared/rateCard.js'

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
  if (tableType === 'tabulador') {
    // Tarifa del tabulador × 30 días. El tramo 13+ no tiene tarifa de tabla,
    // así que su dailyRate queda en 0 y no aporta al total.
    return monthlyFrom(item.dailyRate, qty)
  }
  if (tableType === 'adicionales' || tableType === 'costos') {
    return (Number(item.price) || 0) * qty
  }
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
  if (tableType === 'tabulador')   return { id: Date.now(), grupo: '', tramo: '', name: '', specs: '', quantity: 1, dailyRate: 0, rateOverride: false, manualName: false }
  if (tableType === 'costos')      return { id: Date.now(), estado: '', municipio: '', tipo: '', name: '', specs: '', quantity: 1, price: 0, priceOverride: false }
  if (tableType === 'adicionales') return { id: Date.now(), name: '', specs: '', quantity: 1, price: 0 }
  if (tableType === 'tarifas')   return { ...base, dailyRate: 0, deductible: 10, delivery: 0, retrieval: 0 }
  if (tableType === 'acuerdo')   return { id: Date.now(), name: '', subtotal: 0, ivaPct: 16 }
  if (tableType === 'renta')     return { ...base, dailyRate: 0, deductible: 10, days: 30 }
  if (tableType === 'traslados') return { ...base, delivery: 0, retrieval: 0 }
  return base
}

function typeDefaults(tableType) {
  if (tableType === 'tabulador')   return { grupo: '', tramo: '', specs: '', dailyRate: 0, rateOverride: false }
  if (tableType === 'costos')      return { estado: '', municipio: '', tipo: '', specs: '', priceOverride: false }
  if (tableType === 'adicionales') return { specs: '' }
  if (tableType === 'tarifas')   return { dailyRate: 0, deductible: 10, delivery: 0, retrieval: 0 }
  if (tableType === 'acuerdo')   return { subtotal: 0, ivaPct: 16 }
  if (tableType === 'renta')     return { dailyRate: null, deductible: 10, days: 30 }
  if (tableType === 'traslados') return { delivery: 0, retrieval: 0 }
  return {}
}

const COLS = {
  // Propuesta LP — UNIDADES PROPUESTAS. La UNIDAD va primero porque es lo que
  // el ejecutivo elige; GRUPO y TARIFA DIARIA se deducen de ella y del PLAZO.
  // En el PDF solo salen las 4 columnas del diseño.
  tabulador:  { grid: '58px 1.25fr 108px 1.25fr 104px 104px 118px 40px', headers: ['CANT.', 'UNIDAD', 'GRUPO', 'ESPECIFICACIONES', 'PLAZO', 'TARIFA DIARIA', 'MENSUALIDAD', ''], align: ['center', 'left', 'left', 'left', 'left', 'right', 'right', 'center'] },
  // Propuesta LP — COSTOS ADICIONALES y ADECUACIONES
  // Propuesta LP — COSTOS ADICIONALES. Estado y municipio salen del board de
  // Traslados; el costo depende además del tipo de unidad. Ojo: NO se llama
  // 'traslados' porque ese tipo ya existe (la tabla de la plantilla vieja).
  // En el PDF solo se imprimen las 4 columnas del diseño.
  costos:     { grid: '52px 116px 130px 126px 1fr 108px 40px', headers: ['CANT.', 'ESTADO', 'MUNICIPIO', 'TIPO DE UNIDAD', 'CONCEPTO', 'COSTO', ''], align: ['center', 'left', 'left', 'left', 'left', 'right', 'center'] },
  adicionales:{ grid: '58px 1.1fr 1.4fr 130px 40px', headers: ['CANT.', 'UNIDAD', 'ESPECIFICACIONES', 'MENSUALIDAD SIN IVA', ''], align: ['center', 'left', 'left', 'right', 'center'] },
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

/**
 * Input de texto estable — mismo patrón que NumInput y por la misma razón.
 * Estaba definido DENTRO del componente padre, así que React lo trataba como
 * un tipo nuevo en cada render, lo desmontaba y el foco se perdía: solo se
 * podía escribir un carácter y había que volver a hacer clic. No controlado,
 * para que el ciclo updateAttributes → re-render del NodeView tampoco pise
 * lo que el usuario está tecleando.
 */
function TextInput({ value, onSave, placeholder, list, listOptions }) {
  const inputRef  = useRef(null)
  const isFocused = useRef(false)

  // Sincronizar desde afuera solo cuando el input no tiene el foco
  useEffect(() => {
    const el = inputRef.current
    if (el && !isFocused.current) el.value = value ?? ''
  }, [value])

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        defaultValue={value ?? ''}
        placeholder={placeholder}
        className="pt-text-input"
        list={list}
        onFocus={() => { isFocused.current = true }}
        onBlur={e => { isFocused.current = false; onSave(e.target.value) }}
        onChange={e => onSave(e.target.value)}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      />
      {list && (
        <datalist id={list}>
          {(listOptions ?? []).map(v => <option key={v} value={v} />)}
        </datalist>
      )}
    </>
  )
}

// El NodeView de TipTap se remonta a cada rato (cualquier cambio en el
// documento lo recrea). Sin cache, cada remonte disparaba de nuevo estas
// peticiones y cancelaba la anterior: /units consulta la API de Monday y tarda
// ~1s, así que nunca alcanzaba a resolver y el dropdown de unidades quedaba
// vacío. Se piden una sola vez por carga del editor y se comparten entre todas
// las tablas del documento.
let rateRowsPromise = null
let unitGroupsPromise = null
let trasladosPromise = null

function loadRateRows() {
  if (!rateRowsPromise) {
    rateRowsPromise = api.get('/api/rate-cards/active')
      .then(r => r.data?.rows ?? [])
      .catch(() => [])
  }
  return rateRowsPromise
}

function loadTraslados() {
  if (!trasladosPromise) {
    trasladosPromise = api.get('/api/traslados')
      .then(r => ({ estados: r.data?.estados ?? [], tipos: r.data?.tipos ?? [] }))
      .catch(() => ({ estados: [], tipos: [] }))
  }
  return trasladosPromise
}

function loadUnitGroups() {
  if (!unitGroupsPromise) {
    unitGroupsPromise = api.get('/api/rate-cards/units')
      .then(r => r.data?.grupos ?? [])
      .catch(() => [])
  }
  return unitGroupsPromise
}

function PricingTableViewInner({ node, updateAttributes, selected, editor }) {
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]   = useState(node.attrs.title)
  const [colEditorOpen, setColEditorOpen] = useState(false)

  // Fuerza re-render de los tipos auto-calculados ("acuerdo" y "resumen")
  // cuando cualquier tabla del documento cambia
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    if (!editor || !['acuerdo', 'resumen'].includes(node.attrs.tableType)) return
    const handler = () => forceUpdate(v => v + 1)
    editor.on('update', handler)
    return () => editor.off('update', handler)
  }, [editor, node.attrs.tableType])

  // pricing-table es un nodo "atom" seleccionable — si queda seleccionado
  // (NodeSelection) por debajo del modal de catálogo y el usuario escribe sin
  // haber hecho click primero en el buscador, ProseMirror interpreta la tecla
  // como "reemplazar el nodo seleccionado por texto": borra la tabla entera.
  // Mientras el catálogo está abierto, el editor completo queda no-editable
  // para que ninguna tecla perdida pueda tocar el documento.
  useEffect(() => {
    if (!editor) return
    if (catalogOpen) editor.setEditable(false)
    return () => editor.setEditable(true)
  }, [editor, catalogOpen])

  const { title, itemsB64, tableType = 'renta', columnsB64 } = node.attrs

  // ── Tabulador vigente ────────────────────────────────────────
  // Solo lo carga el tipo que lo necesita. Si no hay tabulador sembrado,
  // rateRows queda vacío y los selects lo dicen en vez de fallar en silencio.
  const [rateRows, setRateRows] = useState([])
  const [rateLoaded, setRateLoaded] = useState(false)
  // Unidades del catálogo de Monday, ya agrupadas por grupo del tabulador
  const [unitGroups, setUnitGroups] = useState([])
  useEffect(() => {
    if (tableType !== 'tabulador') return
    let alive = true
    loadRateRows().then(rows => { if (alive) { setRateRows(rows); setRateLoaded(true) } })
    // El catálogo es opcional: si Monday no está conectado, el dropdown queda
    // vacío y se captura la unidad a mano.
    loadUnitGroups().then(g => { if (alive) setUnitGroups(g) })
    return () => { alive = false }
  }, [tableType])

  // ── Destinos de traslado (board de Monday) ───────────────────
  const [traslados, setTraslados] = useState({ estados: [], tipos: [] })
  useEffect(() => {
    if (tableType !== 'costos') return
    let alive = true
    loadTraslados().then(t => { if (alive) setTraslados(t) })
    return () => { alive = false }
  }, [tableType])

  const estadoSel   = e => traslados.estados.find(x => x.estado === e) ?? null
  const municipioDe = (e, m) => estadoSel(e)?.municipios.find(x => x.municipio === m) ?? null
  const tipoLabel   = id => traslados.tipos.find(t => t.id === id)?.label ?? ''

  const rateByGrupo = new Map(rateRows.map(r => [r.grupo, r]))
  // nombre de unidad → grupo del tabulador, para deducir el grupo al elegirla
  const grupoDeUnidad = new Map()
  for (const g of unitGroups) {
    for (const u of g.unidades) grupoDeUnidad.set(u.name, g.grupo)
  }
  const hayCatalogo = unitGroups.length > 0
  // IVA fijo en 16% — ya no es configurable. No usamos node.attrs.ivaRate:
  // documentos generados antes de este cambio pueden traerlo guardado en 0,
  // y el selector ya no ofrece otro valor para corregirlo desde la UI.
  const ivaRate = 16
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

  // ── Tabulador: grupo + plazo determinan la tarifa ──────────────
  // Mientras el usuario no active el override manual, la tarifa se recalcula
  // sola en cada cambio de grupo o de plazo. Así no queda un precio viejo
  // pegado a un tramo nuevo.
  function applyTabulador(item, patch) {
    const next  = { ...item, ...patch }
    const row   = rateByGrupo.get(next.grupo)
    if (!next.rateOverride) next.dailyRate = rateFor(row, next.tramo) ?? 0
    // Sugerir el nombre comercial del grupo la primera vez
    if (patch.grupo && !next.name && row?.label) next.name = row.label
    return next
  }
  function setTabulador(id, patch) {
    saveItems(items.map(i => i.id === id ? applyTabulador(i, patch) : i))
  }
  /**
   * Elegir la unidad deduce el grupo, y con él la tarifa. Es el camino
   * principal: el ejecutivo piensa en "la Hilux", no en "DOB.C", y así no
   * puede cotizar una unidad con la tarifa de otro grupo.
   */
  function setUnidadDesdeCatalogo(id, nombre) {
    const grupo = grupoDeUnidad.get(nombre)
    setTabulador(id, grupo ? { name: nombre, grupo } : { name: nombre })
  }
  function toggleOverride(id) {
    saveItems(items.map(i => {
      if (i.id !== id) return i
      const on = !i.rateOverride
      // Al desactivar el override, vuelve a mandar la tabla
      return on
        ? { ...i, rateOverride: true }
        : { ...i, rateOverride: false, dailyRate: rateFor(rateByGrupo.get(i.grupo), i.tramo) ?? 0 }
    }))
  }
  /**
   * Estado, municipio y tipo determinan el costo del traslado. Concepto y
   * especificaciones se recomponen a partir de la selección para que lo que
   * ve el cliente en el PDF siempre coincida con lo cotizado; quedan
   * editables después por si quieren redactarlo distinto.
   */
  function setTraslado(id, patch) {
    saveItems(items.map(i => {
      if (i.id !== id) return i
      const next = { ...i, ...patch }
      // Cambiar de estado invalida el municipio elegido
      if (patch.estado !== undefined && patch.estado !== i.estado) next.municipio = ''
      const muni = municipioDe(next.estado, next.municipio)
      if (muni) {
        next.name  = `Traslado a ${muni.municipio}`
        next.specs = [next.estado, tipoLabel(next.tipo)].filter(Boolean).join(' · ')
        if (!next.priceOverride) next.price = (next.tipo && muni.costos[next.tipo]) || 0
      } else if (patch.estado !== undefined || patch.municipio !== undefined) {
        // Sin municipio no hay traslado: limpiar lo derivado. Si no, al cambiar
        // de estado quedaba una fila que decía "Traslado a SALTILLO" con el
        // precio de Saltillo bajo otro estado — listo para enviarse sin que
        // nadie lo note.
        next.name  = ''
        next.specs = ''
        if (!next.priceOverride) next.price = 0
      }
      return next
    }))
  }
  /** Costo que publica el board para este renglón — null si falta algún dato. */
  function costoDeTabla(item) {
    const muni = municipioDe(item.estado, item.municipio)
    if (!muni || !item.tipo) return null
    return muni.costos[item.tipo] ?? null
  }

  /** Tarifa que la tabla publica para este renglón — null si no aplica. */
  function tableRateOf(item) {
    return rateFor(rateByGrupo.get(item.grupo), item.tramo)
  }

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
  // NumInput y TextInput están definidos fuera del componente (ver arriba)
  // para que React no los desmonte en cada re-render y se pueda escribir.

  // ── Render fila según tipo ────────────────────────────────────────
  function renderRow(item) {
    const qty = item.quantity || 1

    // ── TIPO TABULADOR (propuesta LP) ───────────────────────────
    if (tableType === 'tabulador') {
      const tableRate = tableRateOf(item)
      const sinTabla  = item.tramo === '13+'
      const bajoTabla = item.rateOverride && tableRate != null &&
                        (Number(item.dailyRate) || 0) < tableRate
      const aviso = sinTabla
        ? 'Sin tarifa de tabla — ver con Dirección Comercial'
        : bajoTabla
          ? `Por debajo de tabla ($${tableRate}) — escalar a Dirección Comercial`
          : (item.name && !item.grupo)
            ? 'Elige el grupo para que aplique la tarifa del tabulador'
            : null

      return (
        <div key={item.id}>
          <div className="pt-row" style={{
            gridTemplateColumns: cols.grid,
            background: aviso ? '#FFF7E6' : undefined,
          }}>
            {/* Cant. */}
            <div style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
              <NumInput value={item.quantity ?? 1} onSave={n => setField(item.id, 'quantity', n)}
                min="1" step="1" w={36} />
            </div>

            {/* Unidad — del catálogo, agrupada por grupo del tabulador.
                Elegirla deduce el grupo, así que no se puede cotizar una
                unidad con la tarifa de otro grupo. */}
            <div className="pt-c-name">
              {hayCatalogo && !item.manualName ? (
                <select className="pt-text-input" value={item.name ?? ''}
                  onChange={e => {
                    if (e.target.value === '__manual__') setTabulador(item.id, { manualName: true, name: '' })
                    else setUnidadDesdeCatalogo(item.id, e.target.value)
                  }}
                  onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                  <option value="">— elegir unidad —</option>
                  {unitGroups.map(g => (
                    <optgroup key={g.grupo} label={g.grupo}>
                      {g.unidades.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                    </optgroup>
                  ))}
                  <option value="__manual__">— otra (escribir a mano) —</option>
                </select>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                  <TextInput onSave={v => setFieldText(item.id, 'name', v)} value={item.name} placeholder="Nombre de la unidad…" />
                  {hayCatalogo && (
                    <button type="button" className="pt-del-btn" title="Volver a elegir del catálogo"
                      style={{ color:'#9699a6' }}
                      onClick={() => setTabulador(item.id, { manualName: false })}>
                      <IconPlus />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Grupo — deducido de la unidad; editable para unidades que no
                están en el board (EST.C REF, PROMA / CRAFTER). */}
            <div className="pt-c-name">
              <select className="pt-text-input" value={item.grupo ?? ''}
                style={{ color: item.grupo ? '#323338' : '#9699a6' }}
                onChange={e => setTabulador(item.id, { grupo: e.target.value })}
                onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <option value="">{rateLoaded && rateRows.length === 0 ? '— sin tabulador —' : '— grupo —'}</option>
                {rateRows.map(r => <option key={r.grupo} value={r.grupo}>{r.grupo}</option>)}
              </select>
            </div>

            {/* Especificaciones */}
            <div className="pt-c-name">
              <TextInput onSave={v => setFieldText(item.id, 'specs', v)} value={item.specs} placeholder="Especificaciones…" />
            </div>

            {/* Plazo */}
            <div className="pt-c-name">
              <select className="pt-text-input" value={item.tramo ?? ''}
                onChange={e => setTabulador(item.id, { tramo: e.target.value })}
                onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <option value="">— plazo —</option>
                {TRAMOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            {/* Tarifa diaria — de la tabla, salvo override explícito */}
            <div style={{ display:'flex', alignItems:'center', gap:3, justifyContent:'flex-end', paddingRight:4 }}>
              {item.rateOverride ? (
                <>
                  <span style={{ fontSize:11, color:'#676879' }}>$</span>
                  <NumInput value={item.dailyRate ?? 0}
                    onSave={n => setField(item.id, 'dailyRate', n)} w={58} />
                </>
              ) : (
                <span style={{ fontSize:12, color: sinTabla ? '#9699a6' : '#323338' }}>
                  {sinTabla ? '—' : fmt(item.dailyRate ?? 0)}
                </span>
              )}
              <button type="button" className="pt-del-btn" title={item.rateOverride ? 'Volver a la tarifa de tabla' : 'Editar tarifa manualmente'}
                style={{ color: item.rateOverride ? '#F58220' : '#9699a6' }}
                onClick={() => toggleOverride(item.id)}>
                <IconEdit />
              </button>
            </div>

            {/* Mensualidad — calculada */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end',
              paddingRight:8, fontWeight:700, color:'#063B4A', fontSize:12 }}>
              {sinTabla ? '—' : fmt(monthlyFrom(item.dailyRate, qty))}
            </div>

            <div className="pt-c-del">
              <button type="button" className="pt-del-btn" onClick={() => removeItem(item.id)}>
                <IconTrash />
              </button>
            </div>
          </div>

          {aviso && (
            <div style={{ background:'#FFF7E6', color:'#8A5A00', fontSize:11, fontWeight:600,
              padding:'3px 12px 6px', borderBottom:'1px solid #f0f1f5' }}>
              ⚠ {aviso}
            </div>
          )}
        </div>
      )
    }

    // ── TIPO COSTOS (propuesta LP) — traslados del board ────────
    if (tableType === 'costos') {
      const tabla    = costoDeTabla(item)
      const munis    = estadoSel(item.estado)?.municipios ?? []
      const sinTarifa = item.municipio && item.tipo && tabla == null
      const aviso = sinTarifa
        ? `Sin tarifa para ${item.municipio} en ${tipoLabel(item.tipo)} — captúrala a mano`
        : null

      return (
        <div key={item.id}>
          <div className="pt-row" style={{
            gridTemplateColumns: cols.grid,
            background: aviso ? '#FFF7E6' : undefined,
          }}>
            {/* Cant. */}
            <div style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
              <NumInput value={item.quantity ?? 1} onSave={n => setField(item.id, 'quantity', n)}
                min="1" step="1" w={34} />
            </div>

            {/* Estado */}
            <div className="pt-c-name">
              <select className="pt-text-input" value={item.estado ?? ''}
                onChange={e => setTraslado(item.id, { estado: e.target.value })}
                onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <option value="">
                  {traslados.estados.length === 0 ? '— sin destinos —' : '— estado —'}
                </option>
                {traslados.estados.map(e => (
                  <option key={e.estado} value={e.estado}>{e.estado}</option>
                ))}
              </select>
            </div>

            {/* Municipio — filtrado por el estado elegido */}
            <div className="pt-c-name">
              <select className="pt-text-input" value={item.municipio ?? ''}
                disabled={!item.estado}
                onChange={e => setTraslado(item.id, { municipio: e.target.value })}
                onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <option value="">{item.estado ? '— municipio —' : '— elige estado —'}</option>
                {munis.map(m => (
                  <option key={m.municipio} value={m.municipio}>{m.municipio}</option>
                ))}
              </select>
            </div>

            {/* Tipo de unidad — las 7 categorías del board de traslados, que
                no son los grupos del tabulador */}
            <div className="pt-c-name">
              <select className="pt-text-input" value={item.tipo ?? ''}
                onChange={e => setTraslado(item.id, { tipo: e.target.value })}
                onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <option value="">— tipo —</option>
                {traslados.tipos.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Concepto — se compone solo al elegir destino, editable después */}
            <div className="pt-c-name">
              <TextInput onSave={v => setFieldText(item.id, 'name', v)} value={item.name}
                placeholder="Concepto…" />
            </div>

            {/* Costo — del board, con override manual */}
            <div style={{ display:'flex', alignItems:'center', gap:3, justifyContent:'flex-end', paddingRight:4 }}>
              {item.priceOverride || tabla == null ? (
                <>
                  <span style={{ fontSize:11, color:'#676879' }}>$</span>
                  <NumInput value={item.price ?? 0} onSave={n => setField(item.id, 'price', n)} w={62} />
                </>
              ) : (
                <span style={{ fontSize:12, color:'#323338' }}>{fmt(item.price ?? 0)}</span>
              )}
              {tabla != null && (
                <button type="button" className="pt-del-btn"
                  title={item.priceOverride ? 'Volver al costo del tablero' : 'Editar el costo a mano'}
                  style={{ color: item.priceOverride ? '#F58220' : '#9699a6' }}
                  onClick={() => setTraslado(item.id, {
                    priceOverride: !item.priceOverride,
                    ...(item.priceOverride ? { price: tabla } : {}),
                  })}>
                  <IconEdit />
                </button>
              )}
            </div>

            <div className="pt-c-del">
              <button type="button" className="pt-del-btn" onClick={() => removeItem(item.id)}>
                <IconTrash />
              </button>
            </div>
          </div>

          {aviso && (
            <div style={{ background:'#FFF7E6', color:'#8A5A00', fontSize:11, fontWeight:600,
              padding:'3px 12px 6px', borderBottom:'1px solid #f0f1f5' }}>
              ⚠ {aviso}
            </div>
          )}
        </div>
      )
    }

    // ── TIPO ADICIONALES (propuesta LP) ─────────────────────────
    if (tableType === 'adicionales') {
      return (
        <div key={item.id} className="pt-row" style={{ gridTemplateColumns: cols.grid }}>
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
            <NumInput value={item.quantity ?? 1} onSave={n => setField(item.id, 'quantity', n)}
              min="1" step="1" w={36} />
          </div>
          <div className="pt-c-name">
            <TextInput onSave={v => setFieldText(item.id, 'name', v)} value={item.name} placeholder="Concepto…" />
          </div>
          <div className="pt-c-name">
            <TextInput onSave={v => setFieldText(item.id, 'specs', v)} value={item.specs} placeholder="Especificaciones…" />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:2, justifyContent:'flex-end', paddingRight:4 }}>
            <span style={{ fontSize:11, color:'#676879' }}>$</span>
            <NumInput value={item.price ?? 0} onSave={n => setField(item.id, 'price', n)} w={78} />
          </div>
          <div className="pt-c-del">
            <button type="button" className="pt-del-btn" onClick={() => removeItem(item.id)}>
              <IconTrash />
            </button>
          </div>
        </div>
      )
    }

    // ── TIPO TARIFAS ────────────────────────────────────────────
    if (tableType === 'tarifas') {
      const diaria  = Number(item.dailyRate) || 0
      const mensual = diaria * 30 * qty

      return (
        <div key={item.id} className="pt-row" style={{ gridTemplateColumns: cols.grid }}>
          {/* Tipo de unidad */}
          <div className="pt-c-name">
            <TextInput onSave={v => setFieldText(item.id, 'name', v)} value={item.name}
              placeholder="Tipo de unidad…" list={`vehicles-tf-${item.id}`} listOptions={VEHICLE_OPTIONS} />
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
          <TextInput onSave={v => setFieldText(item.id, 'name', v)} value={item.name}
            placeholder="Tipo de unidad…" list={`vehicles-${item.id}`} listOptions={VEHICLE_OPTIONS} />
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
          <TextInput onSave={v => setFieldText(item.id, 'name', v)} value={item.name}
            placeholder="Tipo de unidad…" list={`vehicles-tl-${item.id}`} listOptions={VEHICLE_OPTIONS} />
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
          <TextInput onSave={v => setFieldText(item.id, 'name', v)} value={item.name} placeholder="Descripción…" />
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
                  : <TextInput onSave={v => setFieldText(item.id, col.id, v)} value={item[col.id] ?? ''} placeholder={col.name} />
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
          <TextInput onSave={v => setFieldText(item.id, 'name', v)} value={item.name} placeholder="Nombre…" />
        </div>
        <div className="pt-c-sku">
          <TextInput onSave={v => setFieldText(item.id, 'sku', v)} value={item.sku} placeholder="SKU" />
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

  // ── TIPO RESUMEN — hero de la propuesta LP, auto-calculado ───
  // No tiene items propios: lee las tablas tabulador + adicionales del
  // documento, igual que hace 'acuerdo' con tarifas + accesorios.
  if (tableType === 'resumen') {
    const tabItems = [], addItems = []
    try {
      editor?.state.doc.descendants(n => {
        if (n.type.name !== 'pricingTable') return
        const its = decodeItems(n.attrs.itemsB64)
        if (n.attrs.tableType === 'tabulador')   tabItems.push(...its)
        if (n.attrs.tableType === 'adicionales' || n.attrs.tableType === 'costos') addItems.push(...its)
      })
    } catch { /* documento aún montándose — el hero se recalcula al siguiente update */ }

    const totalTab = tabItems.reduce((s, i) => s + monthlyFrom(i.dailyRate, i.quantity), 0)
    const totalAdd = addItems.reduce((s, i) => s + (Number(i.price)||0) * (Number(i.quantity)||1), 0)
    const monto    = totalTab + totalAdd
    const unidades = tabItems.reduce((s, i) => s + (Number(i.quantity)||1), 0)
    const plazoId  = minTramo(tabItems.map(i => i.tramo).filter(Boolean))
    const plazoTxt = plazoId ? `Plazo mínimo ${tramoById(plazoId)?.label ?? plazoId}` : 'Plazo por definir'

    return (
      <NodeViewWrapper>
        <div className={`pt-block ${selected ? 'pt-block-selected' : ''}`} contentEditable={false}
          style={{ background:'#063B4A', borderLeft:'6px solid #F58220', borderRadius:6, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', padding:'18px 22px' }}>
            <div style={{ flex:1, paddingRight:20 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#F58220', letterSpacing:1, textTransform:'uppercase', marginBottom:7 }}>
                Tu solución en una mirada
              </div>
              <div style={{ fontSize:19, fontWeight:800, color:'#FFFFFF', lineHeight:1.2 }}>
                {unidades === 1 ? '1 unidad' : `${unidades} unidades`}
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:'#C3D4DA', lineHeight:1.3, marginTop:3 }}>
                {plazoTxt}
              </div>
            </div>
            <div style={{ width:1, alignSelf:'stretch', background:'rgba(255,255,255,0.25)' }} />
            <div style={{ flex:1, paddingLeft:20, textAlign:'center' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#FFFFFF', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>
                Mensualidad total
              </div>
              <div style={{ fontSize:27, fontWeight:900, color:'#FFFFFF', lineHeight:1.1 }}>{fmt(monto)}</div>
              <div style={{ fontSize:10, fontWeight:700, color:'#F58220', letterSpacing:0.8, marginTop:4 }}>
                IVA NO INCLUIDO
              </div>
            </div>
          </div>
          {tabItems.length === 0 && addItems.length === 0 && (
            <div style={{ background:'rgba(255,255,255,0.08)', color:'#C3D4DA', fontSize:11,
              padding:'7px 22px', textAlign:'center' }}>
              Se calcula solo al llenar UNIDADES PROPUESTAS y COSTOS ADICIONALES
            </div>
          )}
        </div>
      </NodeViewWrapper>
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
    const ivaPct    = ivaRate
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
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.85)' }}>IVA 16%</span>
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
            {!['tarifas','accesorios','acuerdo','tabulador','adicionales','costos'].includes(tableType) && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>IVA 16%</span>
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
          {/* El catálogo no aplica al tabulador: ahí el precio lo fija la
              tabla de tarifas por plazo, no el precio del producto. */}
          {!['personalizada','tabulador','costos'].includes(tableType) && (
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

        {/* Totales de la propuesta LP — sin IVA: el total consolidado y el
            IVA viven en el hero, repetirlos por tabla contradiría el diseño */}
        {items.length > 0 && ['tabulador','adicionales','costos'].includes(tableType) && (
          <div className="pt-totals">
            <div className="pt-total-line pt-total-grand">
              <span>{tableType === 'tabulador' ? 'Total renta mensual' : 'Total'}</span>
              <span className="pt-grand-val">
                {fmt(items.reduce((s, i) => s + rowSubtotal(i, tableType), 0))}
              </span>
            </div>
          </div>
        )}

        {/* Totales con IVA — renta, traslados, generic */}
        {items.length > 0 && !['personalizada','tarifas','accesorios','acuerdo','tabulador','adicionales','costos'].includes(tableType) && (
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
