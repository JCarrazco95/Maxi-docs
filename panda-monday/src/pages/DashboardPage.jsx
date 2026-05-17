import { useState, useEffect, useCallback } from 'react'
import api from '../api/client.js'

// ── Íconos ───────────────────────────────────────────────────
const IconDoc      = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
const IconSend     = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const IconCheck    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconDraft    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
const IconRefresh  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
const IconTemplate = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
const IconLink     = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
const IconClock    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IconAlert    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>

// Mini gráfica de barras semanal
function WeeklyChart({ data }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="weekly-chart">
      {data.map((d, i) => (
        <div key={i} className="weekly-bar-col">
          <div className="weekly-bar-wrap">
            <div
              className="weekly-bar-fill"
              style={{ height: `${Math.round((d.count / max) * 100)}%` }}
              title={`${d.week}: ${d.count} docs`}
            />
          </div>
          <div className="weekly-bar-label">{d.week}</div>
        </div>
      ))}
    </div>
  )
}

const STATUS_LABEL = { draft: 'Borrador', sent: 'Enviado', signed: 'Firmado', rejected: 'Rechazado' }
const STATUS_CLASS  = { draft: 'badge-draft', sent: 'badge-sent', signed: 'badge-signed', rejected: 'badge-rejected' }

function resolvePdfUrl(url) {
  if (!url) return null
  if (url.startsWith('http://localhost:3001')) return url.replace('http://localhost:3001', window.location.origin)
  return url
}

function StatCard({ icon, label, value, color, trend }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="stat-card-icon" style={{ background: color + '18', color }}>
        {icon}
      </div>
      <div className="stat-card-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

export default function DashboardPage({ isAdmin, userName, itemId }) {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = itemId ? { monday_item_id: String(itemId) } : {}
      const res = await api.get('/api/documents/stats', { params })
      setStats(res.data)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => { load() }, [load])

  const formatDate = iso =>
    new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })

  const signRate = stats?.total > 0
    ? Math.round((stats.signed / stats.total) * 100)
    : 0

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">
            {itemId
              ? `Documentos del contacto #${itemId}`
              : isAdmin ? 'Resumen de toda la cuenta' : `Tus documentos, ${userName ?? ''}`}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          <IconRefresh /> {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /> Cargando estadísticas…</div>
      ) : !stats ? (
        <div className="empty-state">
          <div className="empty-state-icon"><IconDoc /></div>
          <h3>Sin datos todavía</h3>
          <p>Genera tu primer documento para ver estadísticas aquí.</p>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ─────────────────────────────────── */}
          <div className="stats-grid">
            <StatCard icon={<IconDoc />}   label="Total documentos" value={stats.total}    color="var(--primary)" />
            <StatCard icon={<IconDraft />} label="Borradores"        value={stats.draft}    color="var(--text-secondary)" />
            <StatCard icon={<IconSend />}  label="Enviados a firma"  value={stats.sent}     color="var(--warning)" />
            <StatCard icon={<IconCheck />} label="Firmados"          value={stats.signed}   color="var(--success)" />
          </div>

          {/* ── Métricas secundarias ─────────────────────── */}
          <div className="metrics-row">
            {/* Tasa de firma */}
            {stats.total > 0 && (
              <div className="sign-rate-card">
                <div className="sign-rate-header">
                  <span className="sign-rate-label">Tasa de firma</span>
                  <span className="sign-rate-value">{signRate}%</span>
                </div>
                <div className="sign-rate-bar">
                  <div className="sign-rate-fill" style={{ width: `${signRate}%` }} />
                </div>
                <div className="sign-rate-sub">{stats.signed} de {stats.total} documentos firmados</div>
              </div>
            )}

            {/* Tiempo promedio a firma */}
            <div className="metric-mini-card">
              <div className="metric-mini-icon" style={{ color: 'var(--primary)' }}><IconClock /></div>
              <div>
                <div className="metric-mini-value">
                  {stats.avgSigningDays != null ? `${stats.avgSigningDays} días` : '—'}
                </div>
                <div className="metric-mini-label">Tiempo promedio para firmar</div>
              </div>
            </div>

            {/* Overdue alert */}
            {stats.overdue > 0 && (
              <div className="metric-mini-card overdue">
                <div className="metric-mini-icon" style={{ color: 'var(--danger)' }}><IconAlert /></div>
                <div>
                  <div className="metric-mini-value" style={{ color: 'var(--danger)' }}>{stats.overdue}</div>
                  <div className="metric-mini-label">Sin firmar hace +7 días</div>
                </div>
              </div>
            )}
          </div>

          {/* Gráfica semanal */}
          {stats.byWeek?.length > 1 && (
            <div className="dash-section" style={{ marginBottom: 16 }}>
              <div className="dash-section-title"><IconDoc /> Documentos últimos 30 días</div>
              <div style={{ padding: '16px 16px 8px' }}>
                <WeeklyChart data={stats.byWeek} />
              </div>
            </div>
          )}

          <div className="dashboard-cols">
            {/* ── Actividad reciente ───────────────────── */}
            <div className="dash-section">
              <div className="dash-section-title">
                <IconDoc /> Actividad reciente
              </div>
              {stats.recent.length === 0 ? (
                <div className="dash-empty">Sin documentos todavía</div>
              ) : (
                <div className="dash-list">
                  {stats.recent.map(doc => (
                    <div key={doc.id} className="dash-list-item">
                      <div className="dash-item-info">
                        <div className="dash-item-name">{doc.name}</div>
                        <div className="dash-item-date">{formatDate(doc.created_at)}</div>
                      </div>
                      <div className="dash-item-right">
                        <span className={`badge ${STATUS_CLASS[doc.status] ?? 'badge-draft'}`}>
                          {STATUS_LABEL[doc.status] ?? doc.status}
                        </span>
                        {doc.pdf_url && (
                          <a
                            href={resolvePdfUrl(doc.pdf_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="dash-link"
                            title="Ver PDF"
                          >
                            <IconLink />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Por plantilla ────────────────────────── */}
            <div className="dash-section">
              <div className="dash-section-title">
                <IconTemplate /> Documentos por plantilla
              </div>
              {stats.byTemplate.length === 0 ? (
                <div className="dash-empty">Sin datos</div>
              ) : (
                <div className="dash-list">
                  {stats.byTemplate.map((row, i) => {
                    const pct = stats.total > 0 ? Math.round((row.count / stats.total) * 100) : 0
                    return (
                      <div key={i} className="dash-template-item">
                        <div className="dash-template-name">{row.template_name ?? 'Sin plantilla'}</div>
                        <div className="dash-template-bar-wrap">
                          <div className="dash-template-bar">
                            <div className="dash-template-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="dash-template-count">{row.count}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
