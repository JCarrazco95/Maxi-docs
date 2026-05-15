import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client.js'

const IconPlus  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconBack  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
const IconSend  = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const IconCopy  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const IconTrash = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>

const STATUS_COLOR = { draft: '#94a3b8', sent: '#3b82f6', signed: '#22c55e', rejected: '#ef4444' }

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Vista detalle de un Room ────────────────────────────────────
function RoomDetail({ room: initialRoom, onBack }) {
  const [room, setRoom]       = useState(initialRoom)
  const [message, setMessage] = useState('')
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied]   = useState(false)
  const messagesEndRef         = useRef(null)

  const PUBLIC_URL = window.location.origin
  const shareUrl   = `${PUBLIC_URL}/room/${room.access_token}`

  const refresh = useCallback(async () => {
    const res = await api.get(`/api/rooms/${room.id}`)
    setRoom(res.data)
  }, [room.id])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [room.messages])

  async function sendMessage(e) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    try {
      await api.post(`/api/rooms/${room.id}/messages`, {
        content: message.trim(), author_name: name || 'Yo', author_email: email || null,
      })
      setMessage('')
      await refresh()
    } catch { } finally { setSending(false) }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function removeDoc(docId) {
    await api.delete(`/api/rooms/${room.id}/documents/${docId}`)
    await refresh()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}><IconBack /> Volver</button>
          <div>
            <div className="page-title">{room.name}</div>
            {room.description && <div className="page-subtitle">{room.description}</div>}
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={copyLink}>
            <IconCopy /> {copied ? '¡Copiado!' : 'Copiar link del cliente'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* Documentos */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#323338' }}>
            Documentos ({room.documents?.length || 0})
          </div>
          {(!room.documents || room.documents.length === 0) ? (
            <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--border)', padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Sin documentos en este room
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {room.documents.map(doc => (
                <div key={doc.id} style={{ background: 'white', borderRadius: 8, border: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#323338' }}>{doc.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      <span style={{ background: STATUS_COLOR[doc.status] + '20', color: STATUS_COLOR[doc.status], padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>
                        {doc.status}
                      </span>
                      {' · '}{formatDate(doc.added_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {doc.pdf_url && <a href={doc.pdf_url.replace('http://localhost:3001', '')} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>PDF</a>}
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeDoc(doc.id)}><IconTrash /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: 500 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
            💬 Chat ({room.messages?.length || 0})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(!room.messages || room.messages.length === 0) ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 20 }}>Sin mensajes aún</div>
            ) : (
              room.messages.map(msg => (
                <div key={msg.id} style={{ background: '#f6f7fb', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1B3055', marginBottom: 3 }}>{msg.author_name}</div>
                  <div style={{ fontSize: 13, color: '#323338', lineHeight: 1.5 }}>{msg.content}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{formatDate(msg.created_at)}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input className="form-input" placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} style={{ fontSize: 11, padding: '4px 8px' }} />
              <input className="form-input" placeholder="Email (opcional)" type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ fontSize: 11, padding: '4px 8px' }} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" placeholder="Escribe un mensaje…" value={message} onChange={e => setMessage(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={sending || !message.trim()}>
                <IconSend />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Lista de Deal Rooms ─────────────────────────────────────────
export default function DealRoomsPage() {
  const [rooms, setRooms]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [newDesc, setNewDesc]   = useState('')
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await api.get('/api/rooms'); setRooms(res.data) }
    catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function createRoom(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await api.post('/api/rooms', { name: newName.trim(), description: newDesc.trim() || null })
      setRooms(prev => [res.data, ...prev])
      setNewName(''); setNewDesc(''); setCreating(false)
      setSelected({ ...res.data, documents: [], messages: [] })
    } catch (err) { alert(err.response?.data?.error || 'Error') }
    finally { setSaving(false) }
  }

  async function deleteRoom(id) {
    if (!confirm('¿Eliminar este Deal Room?')) return
    await api.delete(`/api/rooms/${id}`)
    setRooms(prev => prev.filter(r => r.id !== id))
  }

  if (selected) return <RoomDetail room={selected} onBack={() => { setSelected(null); load() }} />

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Deal Rooms</div>
          <div className="page-subtitle">Espacios colaborativos con tus clientes</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus /> Nuevo Room</button>
      </div>

      {creating && (
        <form onSubmit={createRoom} style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nombre del Room *</label>
            <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Propuesta Empresa ABC" autoFocus required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Descripción</label>
            <input className="form-input" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Objetivo o contexto de la negociación" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear Room'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading"><div className="spinner" /> Cargando rooms…</div>
      ) : rooms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ fontSize: 40 }}>🤝</div>
          <h3>Sin Deal Rooms</h3>
          <p>Crea un espacio colaborativo para compartir documentos y conversar con tu cliente.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus /> Nuevo Room</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {rooms.map(room => (
            <div key={room.id} style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', padding: 20, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#323338', flex: 1 }} onClick={() => setSelected({ ...room, documents: [], messages: [] })}>
                  🤝 {room.name}
                </div>
                <button className="btn btn-danger btn-sm btn-icon" onClick={e => { e.stopPropagation(); deleteRoom(room.id) }}><IconTrash /></button>
              </div>
              {room.description && <div style={{ fontSize: 12, color: '#676879', marginBottom: 10 }}>{room.description}</div>}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8' }}>
                <span>📄 {room.doc_count || 0} docs</span>
                <span>💬 {room.msg_count || 0} msgs</span>
                <span>{formatDate(room.created_at)}</span>
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: '100%' }}
                onClick={() => setSelected({ ...room, documents: [], messages: [] })}>
                Entrar al Room →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
