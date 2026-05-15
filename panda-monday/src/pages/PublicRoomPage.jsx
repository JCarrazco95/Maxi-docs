import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/client.js'

const STATUS_COLOR = { draft: '#94a3b8', sent: '#3b82f6', signed: '#22c55e', rejected: '#ef4444' }
const IconSend = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>

function formatDate(iso) {
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function PublicRoomPage() {
  const { token } = useParams()
  const [room, setRoom]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [message, setMessage] = useState('')
  const [name, setName]       = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef         = useRef(null)

  useEffect(() => {
    api.get(`/api/rooms/public/${token}`)
      .then(r => setRoom(r.data))
      .catch(() => setError('Room no encontrado o acceso no válido'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [room?.messages])

  async function sendMessage(e) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    try {
      await api.post(`/api/rooms/${room.id}/messages`, { content: message.trim(), author_name: name || 'Cliente' })
      setMessage('')
      const res = await api.get(`/api/rooms/public/${token}`)
      setRoom(res.data)
    } catch { } finally { setSending(false) }
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (error)   return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#676879' }}><div style={{ fontSize: 40 }}>🔒</div><h2>{error}</h2></div>

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb' }}>
      {/* Header */}
      <header style={{ background: '#1B3055', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ background: 'linear-gradient(135deg,#0073ea,#0060c0)', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'white', fontWeight: 900, fontSize: 16 }}>M</span>
        </div>
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Maxi<span style={{ color: '#60a5fa' }}>Docs</span> · Deal Room</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>{room.name}</div>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        {/* Documentos */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📄 Documentos compartidos</div>
          {room.documents?.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e0e2ea', padding: 32, textAlign: 'center', color: '#94a3b8' }}>
              Aún no hay documentos en este espacio
            </div>
          ) : (
            room.documents?.map(doc => (
              <div key={doc.id} style={{ background: 'white', borderRadius: 8, border: '1px solid #e0e2ea', padding: '14px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{doc.name}</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    <span style={{ background: STATUS_COLOR[doc.status] + '20', color: STATUS_COLOR[doc.status], padding: '2px 8px', borderRadius: 10, fontWeight: 600, fontSize: 10 }}>
                      {doc.status}
                    </span>
                  </div>
                </div>
                {doc.pdf_url && (
                  <a href={doc.pdf_url.replace('http://localhost:3001', '')} target="_blank" rel="noreferrer"
                    style={{ background: '#1B3055', color: 'white', padding: '6px 14px', borderRadius: 6, fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>
                    Ver PDF
                  </a>
                )}
              </div>
            ))
          )}
        </div>

        {/* Chat */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e0e2ea', display: 'flex', flexDirection: 'column', height: 480 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e2ea', fontWeight: 600, fontSize: 13 }}>💬 Chat</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {room.messages?.map(msg => (
              <div key={msg.id} style={{ background: '#f6f7fb', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1B3055', marginBottom: 2 }}>{msg.author_name}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>{msg.content}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{formatDate(msg.created_at)}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} style={{ padding: 10, borderTop: '1px solid #e0e2ea' }}>
            <input className="form-input" placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: 6, fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" placeholder="Mensaje…" value={message} onChange={e => setMessage(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={sending || !message.trim()}><IconSend /></button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
