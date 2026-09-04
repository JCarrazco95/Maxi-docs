/**
 * RateCardsPage — Tabulador de tarifas por plazo.
 *
 * Las tarifas son diarias por placa, antes de IVA, y cambian cada semestre.
 * Esta pantalla es la que evita que actualizarlas requiera tocar código.
 * El editor de documentos consume estos valores vía GET /api/rate-cards/active.
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../api/client.js'
import { TRAMOS } from '../shared/rateCard.js'

const IcoPlus  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IcoTrash = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
const IcoSave  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>

const GRID = '150px 1.3fr 110px 110px 110px 110px 40px'
const NUM_COLS = ['precio_hoy', 'tramo_1_3', 'tramo_4_6', 'tramo_7_12']

// Solo se editan los tramos con tarifa de tabla; 13+ no tiene columna.
const TRAMOS_CON_TABLA = TRAMOS.filter(t => t.col)

function toDateInput(v) {
  if (!v) return ''
  return String(v).slice(0, 10)   // la API devuelve ISO; el input espera YYYY-MM-DD
}

export default function RateCardsPage() {
  const [cards,   setCards]   = useState([])
  const [cardId,  setCardId]  = useState(null)
  const [card,    setCard]    = useState(null)
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [dirty,   setDirty]   = useState(false)
  const [error,   setError]   = useState(null)
  const [okMsg,   setOkMsg]   = useState(null)

  const loadCards = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      // Siembra el tabulador S2 2026 la primera vez; después es no-op
      await api.post('/api/rate-cards/seed').catch(() => {})
      const res = await api.get('/api/rate-cards')
      setCards(res.data)
      setCardId(prev => prev ?? res.data.find(c => c.active)?.id ?? res.data[0]?.id ?? null)
    } catch (e) {
      setError(e.response?.data?.error || 'Error cargando el tabulador. Verifica que el backend esté corriendo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCards() }, [loadCards])

  useEffect(() => {
    if (!cardId) return
    let alive = true
    api.get(`/api/rate-cards/${cardId}`)
      .then(res => {
        if (!alive) return
        setCard(res.data.card)
        setRows(res.data.rows)
        setDirty(false)
      })
      .catch(e => alive && setError(e.response?.data?.error || 'Error cargando las tarifas'))
    return () => { alive = false }
  }, [cardId])

  function setRowField(id, field, value) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: value } : r))
    setDirty(true); setOkMsg(null)
  }
  function setCardField(field, value) {
    setCard(c => ({ ...c, [field]: value }))
    setDirty(true); setOkMsg(null)
  }
  function addRow() {
    // id negativo: marca la fila como nueva. El backend reemplaza todas las
    // filas en cada guardado, así que el id local solo sirve para el React key.
    setRows(rs => [...rs, {
      id: -Date.now(), grupo: '', label: '',
      precio_hoy: '', tramo_1_3: '', tramo_4_6: '', tramo_7_12: '',
      sort_order: rs.length,
    }])
    setDirty(true); setOkMsg(null)
  }
  function removeRow(id) {
    setRows(rs => rs.filter(r => r.id !== id))
    setDirty(true); setOkMsg(null)
  }

  async function handleSave() {
    const sinGrupo = rows.some(r => !String(r.grupo ?? '').trim())
    if (sinGrupo) { setError('Hay filas sin grupo. Complétalas o elimínalas.'); return }
    const grupos = rows.map(r => String(r.grupo).trim().toUpperCase())
    if (new Set(grupos).size !== grupos.length) {
      setError('Hay grupos repetidos. Cada grupo debe aparecer una sola vez.'); return
    }

    setSaving(true); setError(null); setOkMsg(null)
    try {
      await api.put(`/api/rate-cards/${cardId}`, {
        name:       card.name,
        valid_from: card.valid_from || null,
        valid_to:   card.valid_to   || null,
        notes:      card.notes,
        active:     card.active,
      })
      const payload = rows.map((r, i) => ({
        grupo: String(r.grupo).trim(),
        label: r.label || null,
        precio_hoy: r.precio_hoy === '' ? null : Number(r.precio_hoy),
        tramo_1_3:  r.tramo_1_3  === '' ? null : Number(r.tramo_1_3),
        tramo_4_6:  r.tramo_4_6  === '' ? null : Number(r.tramo_4_6),
        tramo_7_12: r.tramo_7_12 === '' ? null : Number(r.tramo_7_12),
        sort_order: i,
      }))
      const res = await api.put(`/api/rate-cards/${cardId}/rows`, { rows: payload })
      setRows(res.data.rows)
      setDirty(false)
      setOkMsg('Tabulador guardado. Los documentos nuevos ya cotizan con estas tarifas.')
      loadCards()
    } catch (e) {
      setError(e.response?.data?.error || 'Error guardando el tabulador')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#676879' }}>
        <span className="spinner-sm" /> Cargando tabulador…
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Tabulador de tarifas</div>
          <div className="page-subtitle">
            Tarifa diaria por placa, antes de IVA. La mensualidad de las propuestas
            se calcula como tarifa diaria × 30 × cantidad.
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? <><span className="spinner-sm" /> Guardando…</> : <><IcoSave /> Guardar cambios</>}
          </button>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 14 }}>{error}</div>}
      {okMsg && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6,
          background: '#E8F5EC', color: '#1F7A3F', fontSize: 13, fontWeight: 600 }}>
          {okMsg}
        </div>
      )}

      {/* ── Datos del tabulador ── */}
      {card && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap' }}>
          {cards.length > 1 && (
            <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
              <label className="form-label">Tabulador</label>
              <select className="form-input" value={cardId ?? ''} onChange={e => setCardId(e.target.value)}>
                {cards.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.active ? ' (vigente)' : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group" style={{ margin: 0, minWidth: 240 }}>
            <label className="form-label">Nombre</label>
            <input className="form-input" value={card.name ?? ''}
              onChange={e => setCardField('name', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Vigente desde</label>
            <input type="date" className="form-input" value={toDateInput(card.valid_from)}
              onChange={e => setCardField('valid_from', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Vigente hasta</label>
            <input type="date" className="form-input" value={toDateInput(card.valid_to)}
              onChange={e => setCardField('valid_to', e.target.value)} />
          </div>
        </div>
      )}

      {/* ── Grilla de tarifas ── */}
      <div style={{ border: '1px solid #e0e2ea', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: GRID, gap: 0,
          background: '#063B4A', color: 'white', fontSize: 11, fontWeight: 700,
          letterSpacing: 0.4, padding: '9px 12px',
        }}>
          <div>GRUPO</div>
          <div>NOMBRE COMERCIAL</div>
          <div style={{ textAlign: 'right' }}>PRECIO HOY</div>
          {TRAMOS_CON_TABLA.map(t => (
            <div key={t.id} style={{ textAlign: 'right' }}>{t.label.toUpperCase()}</div>
          ))}
          <div />
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', color: '#676879', fontSize: 13 }}>
            Este tabulador no tiene grupos todavía.
          </div>
        ) : rows.map(r => (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: GRID, gap: 0,
            alignItems: 'center', padding: '5px 12px', borderTop: '1px solid #f0f1f5',
          }}>
            <input className="form-input" value={r.grupo ?? ''} placeholder="DOB.C"
              style={{ height: 30, fontSize: 12, fontWeight: 700 }}
              onChange={e => setRowField(r.id, 'grupo', e.target.value)} />
            <input className="form-input" value={r.label ?? ''} placeholder="Pick up doble cabina"
              style={{ height: 30, fontSize: 12, marginLeft: 6 }}
              onChange={e => setRowField(r.id, 'label', e.target.value)} />
            {NUM_COLS.map(col => (
              <input key={col} type="number" min="0" step="1" value={r[col] ?? ''}
                className="form-input"
                style={{ height: 30, fontSize: 12, textAlign: 'right', marginLeft: 6,
                  color: col === 'precio_hoy' ? '#676879' : '#323338' }}
                onChange={e => setRowField(r.id, col, e.target.value)} />
            ))}
            <div style={{ textAlign: 'center' }}>
              <button className="btn-icon" title="Eliminar grupo" onClick={() => removeRow(r.id)}>
                <IcoTrash />
              </button>
            </div>
          </div>
        ))}

        <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f1f5' }}>
          <button className="btn btn-secondary btn-sm" onClick={addRow}>
            <IcoPlus /> Agregar grupo
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: '#676879', lineHeight: 1.6 }}>
        <strong>Precio Hoy</strong> es solo referencia interna: no se cotiza con él y no aparece
        en las propuestas. <strong>13+ meses</strong> no tiene tarifa de tabla — al elegir ese
        plazo en un documento, la fila se marca para escalar a Dirección Comercial.
        Los subarrendamientos y las compras nuevas a solicitud del cliente tampoco se cotizan
        con esta tabla.
      </div>
    </div>
  )
}
