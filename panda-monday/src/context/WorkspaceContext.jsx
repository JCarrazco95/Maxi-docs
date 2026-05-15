import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/client.js'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children, accountId }) {
  const [workspaces, setWorkspaces] = useState([])
  const [activeId, setActiveId]     = useState(() => sessionStorage.getItem('mxd_workspace') || null)
  const [loading, setLoading]       = useState(true)

  const load = useCallback(async () => {
    if (!accountId) return
    try {
      const res = await api.get('/api/workspaces')
      setWorkspaces(res.data)
      // Si no hay workspace activo, usar el default
      if (!activeId && res.data.length > 0) {
        const def = res.data.find(w => w.is_default) || res.data[0]
        setActiveId(def.id)
        sessionStorage.setItem('mxd_workspace', def.id)
      }
    } catch { }
    finally { setLoading(false) }
  }, [accountId])

  useEffect(() => { load() }, [load])

  function switchWorkspace(id) {
    setActiveId(id)
    sessionStorage.setItem('mxd_workspace', id)
    // Propagamos el workspace_id a todas las requests vía header
    api.defaults.headers.common['x-monday-workspace-id'] = id
  }

  const active = workspaces.find(w => w.id === activeId) || workspaces[0] || null

  return (
    <WorkspaceContext.Provider value={{ workspaces, active, activeId, loading, switchWorkspace, reload: load }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
