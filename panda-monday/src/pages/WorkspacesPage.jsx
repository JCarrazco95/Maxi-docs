import { useState } from 'react'
import api from '../api/client.js'
import { useWorkspace } from '../context/WorkspaceContext.jsx'

const IconPlus  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconEdit  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconTrash = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
const IconCheck = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>

export default function WorkspacesPage() {
  const { workspaces, active, switchWorkspace, reload } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [newName, setNewName]   = useState('')
  const [newDesc, setNewDesc]   = useState('')
  const [saving, setSaving]     = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      await api.post('/api/workspaces', { name: newName.trim(), description: newDesc.trim() || null })
      setNewName(''); setNewDesc(''); setCreating(false)
      await reload()
    } catch (err) { alert(err.response?.data?.error || 'Error') }
    finally { setSaving(false) }
  }

  async function handleRename(id) {
    if (!editing?.name?.trim()) return
    await api.put(`/api/workspaces/${id}`, { name: editing.name, description: editing.description })
    setEditing(null)
    await reload()
  }

  async function handleDelete(ws) {
    if (!confirm(`¿Eliminar el workspace "${ws.name}"? Los documentos se moverán al workspace principal.`)) return
    await api.delete(`/api/workspaces/${ws.id}`)
    await reload()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Workspaces</div>
          <div className="page-subtitle">Separa documentos por equipo, proyecto o cliente</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <IconPlus /> Nuevo workspace
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nombre *</label>
            <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Ventas Norte, Flota Monterrey…" autoFocus required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Descripción <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(opcional)</span></label>
            <input className="form-input" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Propósito de este workspace" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear'}</button>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {workspaces.map(ws => (
          <div key={ws.id} style={{
            background: 'white', borderRadius: 10, border: active?.id === ws.id ? '2px solid var(--primary)' : '1px solid var(--border)',
            padding: 20, position: 'relative',
          }}>
            {ws.is_default && (
              <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                PRINCIPAL
              </span>
            )}
            {active?.id === ws.id && (
              <span style={{ position: 'absolute', top: 12, right: ws.is_default ? 90 : 12, fontSize: 10, background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                <IconCheck /> ACTIVO
              </span>
            )}

            {editing?.id === ws.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input className="form-input" value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} style={{ fontSize: 13 }} autoFocus />
                <input className="form-input" value={editing.description || ''} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} placeholder="Descripción" style={{ fontSize: 13 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancelar</button>
                  <button className="btn btn-primary btn-sm" onClick={() => handleRename(ws.id)}>Guardar</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#323338', marginBottom: 4, paddingRight: ws.is_default ? 80 : 24 }}>
                  🗂 {ws.name}
                </div>
                {ws.description && <div style={{ fontSize: 12, color: '#676879', marginBottom: 10 }}>{ws.description}</div>}
                <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 12, marginBottom: 14 }}>
                  <span>📄 {ws.doc_count || 0} docs</span>
                  <span>📋 {ws.tpl_count || 0} plantillas</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {active?.id !== ws.id && (
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => switchWorkspace(ws.id)}>
                      Cambiar a este
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditing({ id: ws.id, name: ws.name, description: ws.description || '' })}>
                    <IconEdit />
                  </button>
                  {!ws.is_default && (
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(ws)}>
                      <IconTrash />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
