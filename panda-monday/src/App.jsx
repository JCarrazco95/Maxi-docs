import { useState, useEffect } from 'react'
import mondaySdk from 'monday-sdk-js'
import { updateMondayContext } from './api/client.js'
import TemplatesPage from './pages/TemplatesPage.jsx'
import DocumentsPage from './pages/DocumentsPage.jsx'
import './App.css'

const monday = mondaySdk()

const IconDoc = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

const IconTemplate = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="9" y1="21" x2="9" y2="9"/>
  </svg>
)

const IconDocs = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
)

export default function App() {
  const [mondayCtx, setMondayCtx] = useState(null)
  const [activeTab, setActiveTab] = useState('templates')

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

  return (
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
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>
          Gestión de documentos
        </span>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <IconTemplate />
          Plantillas
        </button>
        <button
          className={`tab ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          <IconDocs />
          Documentos
        </button>
      </nav>

      <div className="tab-content">
        {activeTab === 'templates' && <TemplatesPage />}
        {activeTab === 'documents' && (
          <DocumentsPage
            itemId={itemId}
            boardId={boardId}
            userId={userId}
            userName={userName}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  )
}
