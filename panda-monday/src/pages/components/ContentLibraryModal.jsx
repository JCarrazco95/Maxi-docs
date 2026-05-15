import { useState, useEffect } from 'react'
import api from '../../api/client.js'

const IconX     = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconPlus  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconSave  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
const IconTrash = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
const IconInst  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>

export default function ContentLibraryModal({ onClose, onInsert, currentHtml }) {
  const [blocks, setBlocks]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('library') // 'library' | 'save'
  const [saveName, setSaveName]   = useState('')
  const [saveDesc, setSaveDesc]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')

  useEffect(() => {
    api.get('/api/content-library')
      .then(r => setBlocks(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!saveName.trim() || !currentHtml?.trim()) return
    setSaving(true)
    try {
      const res = await api.post('/api/content-library', {
        name: saveName.trim(),
        description: saveDesc.trim() || null,
        content_html: currentHtml,
      })
      setBlocks(prev => [res.data, ...prev])
      setSaveName(''); setSaveDesc(''); setTab('library')
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar')
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este bloque?')) return
    await api.delete(`/api/content-library/${id}`)
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  const filtered = blocks.filter(b =>
    !search || b.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">Biblioteca de contenido</div>
          <button className="close-btn" onClick={onClose}><IconX /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[{ key: 'library', label: '📚 Mis bloques' }, { key: 'save', label: '💾 Guardar selección' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
                background: 'none', border: 'none', borderRadius: 0, cursor: 'pointer',
                color: tab === t.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {tab === 'save' ? (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Se guardará el contenido actual del editor como un bloque reutilizable.
              </p>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nombre del bloque *</label>
                <input className="form-input" value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="Ej: Sección de términos y condiciones" autoFocus required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Descripción <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(opcional)</span></label>
                <input className="form-input" value={saveDesc}
                  onChange={e => setSaveDesc(e.target.value)}
                  placeholder="Para qué sirve este bloque…" />
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving || !saveName.trim()}>
                {saving ? 'Guardando…' : <><IconSave /> Guardar bloque</>}
              </button>
            </form>
          ) : (
            <>
              <input className="form-input" placeholder="Buscar bloque…" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ marginBottom: 12, fontSize: 13 }} />
              {loading ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Cargando…</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>
                  {search ? 'No hay resultados' : 'Sin bloques guardados. Guarda una selección del editor para empezar.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtered.map(b => (
                    <div key={b.id} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{b.name}</div>
                        {b.description && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{b.description}</div>}
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                          {new Date(b.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => { onInsert(b.content_html); onClose() }} title="Insertar en documento">
                          <IconInst /> Insertar
                        </button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(b.id)} title="Eliminar">
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
