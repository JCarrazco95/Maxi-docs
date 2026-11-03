import { useState, useEffect } from 'react'
import api from '../../api/client.js'

/**
 * Propuestas guardadas (borradores con PDF) de la misma oportunidad, para
 * mandarlas junto con la que se está enviando en UN solo correo.
 * Por defecto van todas marcadas; el ejecutivo puede quitar las que no.
 */
export function useBorradoresDeOportunidad(itemId, excludeId) {
  const [borradores, setBorradores] = useState([])
  const [incluirIds, setIncluirIds] = useState([])
  const [cargado,    setCargado]    = useState(false)

  useEffect(() => {
    if (!itemId) { setCargado(true); return }
    let vivo = true
    api.get('/api/documents', { params: { monday_item_id: String(itemId) } })
      .then(r => {
        if (!vivo) return
        const lista = (r.data ?? []).filter(d => d.status === 'draft' && d.pdf_url && d.id !== excludeId)
        setBorradores(lista)
        setIncluirIds(lista.map(d => d.id))
      })
      .catch(() => {})
      .finally(() => vivo && setCargado(true))
    return () => { vivo = false }
  }, [itemId, excludeId])

  function alternar(id) {
    setIncluirIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return { borradores, incluirIds, alternar, cargado }
}

export default function PropuestasAIncluir({ borradores, incluirIds, alternar, mostrarAyuda = false }) {
  if (!borradores.length) {
    if (!mostrarAyuda) return null
    return (
      <div style={st.ayuda}>
        ¿Vas a mandar varias propuestas? Guarda las demás con <strong>Guardar PDF</strong> y aparecerán aquí
        para enviarlas todas en un solo correo.
      </div>
    )
  }
  return (
    <div style={st.caja}>
      <div style={st.titulo}>Enviar en el mismo correo</div>
      <div style={st.sub}>Propuestas guardadas de esta oportunidad. El cliente las verá lado a lado y elegirá una.</div>
      {borradores.map(d => (
        <label key={d.id} style={st.fila}>
          <input type="checkbox" checked={incluirIds.includes(d.id)} onChange={() => alternar(d.id)} />
          <span style={{ minWidth: 0 }}>
            {d.doc_number && <span style={st.folio}>{d.doc_number}</span>}
            <span style={st.nombre}>{d.name}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

const st = {
  caja:   { border: '1px solid #e0e2ea', borderRadius: 8, padding: '10px 12px', background: '#f6f7fb', margin: '12px 0' },
  titulo: { fontSize: 12.5, fontWeight: 700, color: '#323338' },
  sub:    { fontSize: 11.5, color: '#676879', margin: '2px 0 8px', lineHeight: 1.4 },
  fila:   { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', fontSize: 12.5, cursor: 'pointer' },
  folio:  { display: 'block', fontSize: 11, fontWeight: 700, color: '#CC6227' },
  nombre: { display: 'block', color: '#323338', wordBreak: 'break-word' },
  ayuda:  { fontSize: 11.5, color: '#676879', lineHeight: 1.5, background: '#f6f7fb', borderRadius: 8, padding: '8px 10px', margin: '12px 0' },
}
