import { useState, useEffect } from 'react'
import api from '../api/client.js'

const IconSave    = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
const IconPlus    = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
const IconAlert   = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>

const EVENTS = ['document.sent', 'document.viewed', 'document.signed', 'document.completed']

export default function SettingsPage({ isAdmin }) {
  const [settings, setSettings] = useState({
    company_name:   '',
    logo_url:       '',
    primary_color:  '#1B3055',
    email_from_name:'MaxiDocs',
    notify_email:   '',
    webhook_url:    '',
  })
  const [webhooks, setWebhooks]   = useState([])
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState(null)
  const [newHook, setNewHook]     = useState({ url: '', events: [...EVENTS] })
  const [addingHook, setAddingHook] = useState(false)

  // ── Gmail integration ──────────────────────────────────────
  const [gmail, setGmail] = useState({ loading: true, connected: false, email: null })
  const [gmailMsg, setGmailMsg] = useState(null)   // success/error tras callback

  async function reloadGmailStatus() {
    try {
      const r = await api.get('/api/integrations/gmail/status')
      setGmail({ loading: false, connected: !!r.data.connected, email: r.data.email || null })
    } catch {
      setGmail({ loading: false, connected: false, email: null })
    }
  }

  async function connectGmail() {
    setGmailMsg(null)
    try {
      const r = await api.get('/api/integrations/gmail/connect')
      if (r.data?.auth_url) {
        window.location.href = r.data.auth_url
      } else {
        setGmailMsg({ type: 'error', text: 'No se recibió la URL de autorización' })
      }
    } catch (e) {
      setGmailMsg({ type: 'error', text: e.response?.data?.error || e.message })
    }
  }

  async function disconnectGmail() {
    if (!confirm('¿Desconectar tu Gmail? Los próximos correos se enviarán desde el correo genérico de MaxiDocs.')) return
    try {
      await api.delete('/api/integrations/gmail/disconnect')
      setGmail({ loading: false, connected: false, email: null })
      setGmailMsg({ type: 'success', text: 'Gmail desconectado' })
    } catch (e) {
      setGmailMsg({ type: 'error', text: e.response?.data?.error || e.message })
    }
  }

  useEffect(() => {
    api.get('/api/settings').then(r => {
      const s = r.data
      setSettings({
        company_name:    s.company_name    || '',
        logo_url:        s.logo_url        || '',
        primary_color:   s.primary_color   || '#1B3055',
        email_from_name: s.email_from_name || 'MaxiDocs',
        notify_email:    s.notify_email    || '',
        webhook_url:     s.webhook_url     || '',
      })
    }).catch(() => {})

    api.get('/api/settings/webhooks').then(r => setWebhooks(r.data)).catch(() => {})

    // Detectar callback de OAuth Gmail
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmail') === 'connected') {
      setGmailMsg({ type: 'success', text: `✅ Gmail conectado: ${params.get('email') || ''}` })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('gmail') === 'error') {
      setGmailMsg({ type: 'error', text: `❌ Error conectando Gmail: ${params.get('reason') || 'desconocido'}` })
      window.history.replaceState({}, '', window.location.pathname)
    }

    reloadGmailStatus()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      await api.put('/api/settings', settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally { setSaving(false) }
  }

  async function addWebhook() {
    if (!newHook.url.trim()) return
    try {
      const res = await api.post('/api/settings/webhooks', { url: newHook.url.trim(), events: newHook.events })
      setWebhooks(prev => [res.data, ...prev])
      setNewHook({ url: '', events: [...EVENTS] })
      setAddingHook(false)
    } catch (err) { alert(err.response?.data?.error || 'Error') }
  }

  async function deleteWebhook(id) {
    if (!confirm('¿Eliminar este webhook?')) return
    await api.delete(`/api/settings/webhooks/${id}`)
    setWebhooks(prev => prev.filter(w => w.id !== id))
  }

  function toggleEvent(evt) {
    setNewHook(prev => ({
      ...prev,
      events: prev.events.includes(evt)
        ? prev.events.filter(e => e !== evt)
        : [...prev.events, evt],
    }))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{isAdmin ? 'Configuración' : 'Mi cuenta'}</div>
          <div className="page-subtitle">
            {isAdmin
              ? 'Branding, notificaciones, webhooks y tu correo de envío'
              : 'Conecta tu correo de Gmail para que las cotizaciones salgan desde tu cuenta'}
          </div>
        </div>
      </div>

      {/* ── Mi correo (Gmail OAuth) ── */}
      <div style={{
        background: 'white', borderRadius: 10, border: '1px solid var(--border)',
        overflow: 'hidden', marginBottom: 24,
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>📧 Mi correo de envío</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Conecta tu Gmail para que las cotizaciones salgan desde tu cuenta personal de @maxirent.com.mx
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {gmailMsg && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, marginBottom: 14, fontSize: 13,
              background: gmailMsg.type === 'success' ? '#e6f4ec' : '#fdecec',
              color:      gmailMsg.type === 'success' ? '#1f7a3a' : '#b91c1c',
              border: `1px solid ${gmailMsg.type === 'success' ? '#a7d5b5' : '#f5c2c2'}`,
            }}>
              {gmailMsg.text}
            </div>
          )}

          {gmail.loading ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando…</div>
          ) : gmail.connected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: '#e6f4ec',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}>✅</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Conectado: <span style={{ color: '#0073ea' }}>{gmail.email}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Las cotizaciones y correos de firma se enviarán desde esta cuenta.
                  </div>
                </div>
              </div>
              <button onClick={disconnectGmail} className="btn btn-secondary btn-sm">
                <IconTrash /> Desconectar
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: '#f0f4ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}>📭</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Sin Gmail conectado
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Los correos se envían desde la cuenta genérica de MaxiDocs.
                  </div>
                </div>
              </div>
              <button onClick={connectGmail} className="btn btn-primary">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginRight: 4 }}>
                  <path d="M22 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5v-13A1.5 1.5 0 0 1 3.5 4h17A1.5 1.5 0 0 1 22 5.5zM4 6.4v.7l8 5.3 8-5.3v-.7H4zm0 2.9V18h16V9.3L12 14.6 4 9.3z"/>
                </svg>
                Conectar Gmail
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Secciones admin-only: branding, webhooks */}
      {isAdmin && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Branding ── */}
        <form onSubmit={handleSave} style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Marca y empresa</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Información que aparece en emails y portal de firma</div>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div className="error-msg"><IconAlert /> {error}</div>}

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre de la empresa</label>
              <input className="form-input" value={settings.company_name}
                onChange={e => setSettings(p => ({ ...p, company_name: e.target.value }))}
                placeholder="MAXIRent Renta Empresarial" />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre del remitente (emails)</label>
              <input className="form-input" value={settings.email_from_name}
                onChange={e => setSettings(p => ({ ...p, email_from_name: e.target.value }))}
                placeholder="MaxiDocs" />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Email de notificaciones</label>
              <input className="form-input" type="email" value={settings.notify_email}
                onChange={e => setSettings(p => ({ ...p, notify_email: e.target.value }))}
                placeholder="admin@tuempresa.com" />
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Recibe notificación cuando un documento se abre o firma
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">URL del logo (PNG/SVG)</label>
              <input className="form-input" type="url" value={settings.logo_url}
                onChange={e => setSettings(p => ({ ...p, logo_url: e.target.value }))}
                placeholder="https://tuempresa.com/logo.png" />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Color primario
                <span style={{ width: 20, height: 20, borderRadius: 4, background: settings.primary_color, border: '1px solid #e0e2ea', display: 'inline-block' }} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={settings.primary_color}
                  onChange={e => setSettings(p => ({ ...p, primary_color: e.target.value }))}
                  style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }} />
                <input className="form-input" value={settings.primary_color}
                  onChange={e => setSettings(p => ({ ...p, primary_color: e.target.value }))}
                  placeholder="#1B3055" style={{ flex: 1 }} />
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Webhook URL global</label>
              <input className="form-input" type="url" value={settings.webhook_url}
                onChange={e => setSettings(p => ({ ...p, webhook_url: e.target.value }))}
                placeholder="https://hook.make.com/..." />
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-end' }}>
              {saving ? 'Guardando…' : saved ? '✅ Guardado' : <><IconSave /> Guardar cambios</>}
            </button>
          </div>
        </form>

        {/* ── Webhooks ── */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Webhooks configurados</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Notificaciones a sistemas externos</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setAddingHook(v => !v)}>
              <IconPlus /> Agregar
            </button>
          </div>

          {addingHook && (
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)', background: '#f9fafc' }}>
              <input className="form-input" placeholder="URL del webhook *" type="url"
                value={newHook.url} onChange={e => setNewHook(p => ({ ...p, url: e.target.value }))}
                style={{ marginBottom: 10, fontSize: 13 }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Eventos:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {EVENTS.map(evt => (
                  <label key={evt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={newHook.events.includes(evt)}
                      onChange={() => toggleEvent(evt)} />
                    {evt}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setAddingHook(false)}>Cancelar</button>
                <button className="btn btn-primary btn-sm" onClick={addWebhook}>Guardar webhook</button>
              </div>
            </div>
          )}

          <div style={{ padding: webhooks.length === 0 ? 24 : 0 }}>
            {webhooks.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Sin webhooks configurados
              </div>
            ) : (
              webhooks.map(wh => (
                <div key={wh.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-all', color: 'var(--primary)' }}>{wh.url}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {(wh.events || []).join(' · ')}
                    </div>
                  </div>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteWebhook(wh.id)}>
                    <IconTrash />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
