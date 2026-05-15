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
          <div className="page-title">Configuración</div>
          <div className="page-subtitle">Branding, notificaciones y webhooks</div>
        </div>
      </div>

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
    </div>
  )
}
