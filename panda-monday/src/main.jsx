import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import PortalPage     from './pages/PortalPage.jsx'
import PublicRoomPage from './pages/PublicRoomPage.jsx'
import EditorPage     from './pages/EditorPage.jsx'
import './App.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Portal público del firmante */}
        <Route path="/sign/:signatureId" element={<PortalPage />} />
        {/* Deal Room público para clientes */}
        <Route path="/room/:token" element={<PublicRoomPage />} />
        {/* Editor de documentos en pantalla completa */}
        <Route path="/editor" element={<EditorPage />} />
        {/* App principal embebida en Monday.com */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
