import { useState, useEffect } from 'react'
import mondaySdk from 'monday-sdk-js'
import { updateMondayContext } from './api/client.js'
import TemplatesPage   from './pages/TemplatesPage.jsx'
import DocumentsPage   from './pages/DocumentsPage.jsx'
import DashboardPage   from './pages/DashboardPage.jsx'
import SettingsPage    from './pages/SettingsPage.jsx'
import PipelinePage    from './pages/PipelinePage.jsx'
import CatalogPage     from './pages/CatalogPage.jsx'
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext.jsx'
import './App.css'

const monday = mondaySdk()

const IconTemplate  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
const IconDocs      = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const IconDashboard = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
const IconSettings  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
const IconPipeline  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="4" height="15"/><rect x="10" y="4" width="4" height="18"/><rect x="18" y="2" width="4" height="20"/></svg>
const IconCatalog   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>

// ── Selector de workspace en el header ──────────────────────────
function WorkspaceSwitcher() {
  const { workspaces, active, switchWorkspace } = useWorkspace()
  if (!workspaces || workspaces.length <= 1) return null
  return (
    <select
      value={active?.id || ''}
      onChange={e => switchWorkspace(e.target.value)}
      style={{
        fontSize: 12, padding: '3px 8px', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 6, background: 'rgba(255,255,255,0.1)', color: 'white',
        cursor: 'pointer', maxWidth: 160,
      }}
    >
      {workspaces.map(ws => (
        <option key={ws.id} value={ws.id} style={{ background: '#1B3055' }}>
          🗂 {ws.name}
        </option>
      ))}
    </select>
  )
}

export default function App() {
  const [mondayCtx, setMondayCtx] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    monday.get('context')
      .then(res => {
        setMondayCtx(res.data)
        updateMondayContext(res.data)
      })
      .catch(() => {
        setMondayCtx({ boardId: null, itemId: null })
      })

    monday.listen('context', res => {
      setMondayCtx(res.data)
      updateMondayContext(res.data)
    })
  }, [])

  const itemId   = mondayCtx?.itemId        ?? null
  const boardId  = mondayCtx?.boardId       ?? null
  const userId   = mondayCtx?.user?.id      ?? null
  const userName = mondayCtx?.user?.name    ?? null
  const isAdmin  = mondayCtx?.user?.isAdmin ?? false
  const accountId = mondayCtx?.account?.id  ?? null

  return (
    <WorkspaceProvider accountId={accountId || 'dev'}>
    <div className="app">
      <header className="app-header">
        <div className="app-header-logo">
          <div className="app-header-icon">
            <svg viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <span className="app-header-name">Maxi<span>Docs</span></span>
        </div>
        <div className="app-header-sep" />
        <WorkspaceSwitcher />
        {userName && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>
            {userName}
          </span>
        )}
      </header>

      <nav className="tabs">
        <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <IconDashboard /> Dashboard
        </button>
        <button className={`tab ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
          <IconTemplate /> Plantillas
        </button>
        <button className={`tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>
          <IconDocs /> Documentos
        </button>
        <button className={`tab ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => setActiveTab('pipeline')}>
          <IconPipeline /> Pipeline
        </button>
        <button className={`tab ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>
          <IconCatalog /> Catálogo
        </button>
        {/* Settings visible para todos: vendedores pueden conectar su Gmail.
            Las secciones admin-only se ocultan dentro de SettingsPage según isAdmin. */}
        <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <IconSettings /> {isAdmin ? 'Config.' : 'Mi cuenta'}
        </button>
      </nav>

      <div className="tab-content">
        {activeTab === 'dashboard' && (
          <DashboardPage isAdmin={isAdmin} userName={userName} itemId={itemId} />
        )}
        {activeTab === 'templates' && <TemplatesPage />}
        {activeTab === 'documents' && (
          <DocumentsPage
            itemId={itemId}
            boardId={boardId}
            accountId={accountId}
            userId={userId}
            userName={userName}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === 'pipeline' && <PipelinePage isAdmin={isAdmin} />}
        {activeTab === 'catalog'  && <CatalogPage />}
        {activeTab === 'settings' && <SettingsPage isAdmin={isAdmin} />}
      </div>
    </div>
    </WorkspaceProvider>
  )
}
