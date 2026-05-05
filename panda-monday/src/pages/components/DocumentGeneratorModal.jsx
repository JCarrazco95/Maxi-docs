import { useState, useEffect } from 'react'
import mondaySdk from 'monday-sdk-js'
import api from '../../api/client.js'

const monday = mondaySdk()

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

// Mapeo automático mejorado — puntúa similitud entre variable y columna
function scoreMatch(varName, colTitle) {
  const vn = normalize(varName)
  const ct = normalize(colTitle)
  if (vn === ct) return 3                      // coincidencia exacta
  if (ct.includes(vn) || vn.includes(ct)) return 2  // una contiene a la otra
  // coincidencia parcial de palabras
  const vParts = vn.split('_')
  const cParts = ct.split('_')
  const shared = vParts.filter(p => cParts.includes(p)).length
  return shared > 0 ? 1 : 0
}

function mapMondayColumns(columns, variables) {
  const prefilled = {}
  for (const variable of variables) {
    let bestCol = null, bestScore = 0
    for (const col of columns) {
      const score = scoreMatch(variable, col.title)
      if (score > bestScore) { bestScore = score; bestCol = col }
    }
    if (bestScore > 0 && bestCol?.text) prefilled[variable] = bestCol.text
  }
  return prefilled
}

// Guarda mapeos manuales en localStorage para reusar entre sesiones
const MAPPING_KEY = 'maxi_col_mapping'
function loadSavedMapping() {
  try { return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}') } catch { return {} }
}
function saveMapping(varName, colId) {
  const m = loadSavedMapping(); m[varName] = colId
  localStorage.setItem(MAPPING_KEY, JSON.stringify(m))
}

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const IconGenerate = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

const IconAlertCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

const IconCheckCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
)

const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
  </svg>
)

const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

const IconLayers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
)

export default function DocumentGeneratorModal({ itemId, boardId, onClose, onGenerated }) {
  const [templates, setTemplates]         = useState([])
  const [selectedTpl, setSelectedTpl]     = useState(null)
  const [docName, setDocName]             = useState('')
  const [fieldValues, setFieldValues]     = useState({})
  const [mondayCols, setMondayCols]       = useState([])
  const [itemName, setItemName]           = useState('')
  const [loadingTpl, setLoadingTpl]       = useState(true)
  const [loadingItem, setLoadingItem]     = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [error, setError]                 = useState(null)

  useEffect(() => {
    api.get('/api/templates')
      .then(res => setTemplates(res.data))
      .catch(() => setError('Error al cargar plantillas'))
      .finally(() => setLoadingTpl(false))
  }, [])

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
        setMondayCols(item.column_values.filter(c => c.text?.trim()))
      }
    }).catch(() => {}).finally(() => setLoadingItem(false))
  }, [itemId])

  // Aplica mapeos guardados sobre columnas de Monday actuales
  function applyMondayMapping(tplVariables) {
    if (!mondayCols.length || !tplVariables?.length) return {}
    const saved   = loadSavedMapping()
    const autoMap = mapMondayColumns(mondayCols, tplVariables)
    const result  = { ...autoMap }
    // Los mapeos guardados del usuario tienen prioridad
    for (const [varName, colId] of Object.entries(saved)) {
      const col = mondayCols.find(c => c.id === colId)
      if (col?.text) result[varName] = col.text
    }
    return result
  }

  function handleSelectTemplate(id) {
    const tpl = templates.find(t => t.id === id) ?? null
    setSelectedTpl(tpl)
    if (!tpl) { setFieldValues({}); setDocName(''); return }

    const label = itemName ? ` — ${itemName}` : ''
    setDocName(`${tpl.name}${label} — ${new Date().toLocaleDateString('es')}`)

    setFieldValues(applyMondayMapping(tpl.variables))
  }

  async function handleGenerate(e) {
    e.preventDefault()
    if (!selectedTpl) { setError('Selecciona una plantilla'); return }
    if (!docName.trim()) { setError('El nombre del documento es requerido'); return }
    setGenerating(true)
    setError(null)
    try {
      const res = await api.post('/api/documents/generate', {
        template_id:     selectedTpl.id,
        name:            docName,
        monday_board_id: boardId ? String(boardId) : undefined,
        monday_item_id:  itemId  ? String(itemId)  : undefined,
        filled_data:     fieldValues,
      })

      // Notificación en Monday.com al item si estamos en Item View
      if (itemId) {
        monday.api(`
          mutation {
            create_update(item_id: ${itemId}, body: "📄 Se generó el documento \\"${docName}\\" desde MaxiDocs.") {
              id
            }
          }
        `).catch(() => {}) // silencioso — no bloquear si falla
      }

      onGenerated(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al generar el documento')
    } finally {
      setGenerating(false)
    }
  }

  const variables = selectedTpl?.variables ?? []
  const autoFilledCount = variables.filter(v => fieldValues[v]).length

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-md">
        <div className="modal-header">
          <div className="modal-header-icon">
            <div className="modal-header-icon-wrap primary">
              <IconGenerate />
            </div>
            <div>
              <div className="modal-title">
                Generar documento{itemName ? ` — ${itemName}` : ''}
              </div>
              <div className="modal-subtitle">
                Completa los campos y genera el PDF
              </div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} type="button" aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        <form onSubmit={handleGenerate}>
          <div className="modal-body">
            {error && (
              <div className="error-msg">
                <IconAlertCircle />
                {error}
              </div>
            )}

            {autoFilledCount > 0 && (
              <div className="success-msg">
                <IconCheckCircle />
                {autoFilledCount}/{variables.length} campos llenados automáticamente desde Monday.com
              </div>
            )}

            {loadingItem && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                <span className="spinner-sm" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
                Obteniendo columnas del contacto…
              </div>
            )}

            {mondayCols.length > 0 && (
              <details className="monday-cols-details">
                <summary className="monday-cols-summary">
                  <IconLayers />
                  Ver {mondayCols.length} columnas disponibles del contacto
                  <IconChevronDown />
                </summary>
                <div className="monday-cols-list">
                  {mondayCols.map(col => (
                    <span key={col.id} className="monday-col-chip">
                      <strong>{col.title}:</strong> {col.text}
                    </span>
                  ))}
                </div>
              </details>
            )}

            <div className="form-group">
              <label className="form-label">Plantilla *</label>
              {loadingTpl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13, padding: '8px 0' }}>
                  <span className="spinner-sm" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
                  Cargando plantillas…
                </div>
              ) : (
                <select
                  className="form-select"
                  value={selectedTpl?.id ?? ''}
                  onChange={e => handleSelectTemplate(e.target.value)}
                >
                  <option value="">— Selecciona una plantilla —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Nombre del documento *</label>
              <input
                className="form-input"
                value={docName}
                onChange={e => setDocName(e.target.value)}
                placeholder="Ej: Propuesta MAXIRent — Empresa X"
              />
            </div>

            {variables.length > 0 && (
              <>
                <hr className="divider" />
                <div className="fields-section-header">
                  <span className="fields-section-title">
                    Campos del documento
                    {mondayCols.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6 }}>
                        — mapea columnas de Monday una sola vez, se guardan automáticamente
                      </span>
                    )}
                  </span>
                  {mondayCols.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setFieldValues(applyMondayMapping(variables))}
                    >
                      <IconRefresh /> Re-aplicar
                    </button>
                  )}
                </div>

                {variables.map(varName => {
                  const savedMap    = loadSavedMapping()
                  const mappedColId = savedMap[varName]
                  const isAutoFilled = !!(fieldValues[varName])

                  return (
                    <div key={varName} className="form-group">
                      <div className="field-label-row">
                        <div className="field-label-left">
                          <span className="form-label" style={{ marginBottom: 0 }}>{varName}</span>
                          {isAutoFilled && <span className="auto-badge">✓</span>}
                        </div>
                        {mondayCols.length > 0 && (
                          <select
                            className="col-picker-select"
                            value={mappedColId ?? ''}
                            onChange={e => {
                              const colId = e.target.value
                              saveMapping(varName, colId)
                              const col = mondayCols.find(c => c.id === colId)
                              if (col?.text) setFieldValues(prev => ({ ...prev, [varName]: col.text }))
                            }}
                            title="Selecciona la columna de Monday que corresponde a este campo — se guarda para futuros documentos"
                          >
                            <option value="">— columna de Monday —</option>
                            {mondayCols.map(col => (
                              <option key={col.id} value={col.id}>
                                {col.title}{col.text ? `: ${col.text.slice(0, 22)}` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <input
                        className={`form-input${isAutoFilled ? ' auto-filled' : ''}`}
                        value={fieldValues[varName] ?? ''}
                        onChange={e => setFieldValues(prev => ({ ...prev, [varName]: e.target.value }))}
                        placeholder={mondayCols.length > 0 ? 'Selecciona columna ↑ o escribe manualmente' : `Valor para {{${varName}}}`}
                      />
                    </div>
                  )
                })}
              </>
            )}

            {generating && (
              <div className="generating-strip">
                <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                Generando PDF… puede tomar unos segundos
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={generating || loadingTpl}
            >
              {generating
                ? <><span className="spinner-sm" /> Generando PDF…</>
                : 'Generar documento'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
