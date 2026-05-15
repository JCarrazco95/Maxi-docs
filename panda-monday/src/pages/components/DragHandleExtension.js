/**
 * DragHandleExtension — handle de drag global para TipTap
 * Usa position:fixed para evitar problemas de scroll.
 * El handle permanece visible mientras el mouse esté sobre él.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const HANDLE_KEY = new PluginKey('globalDragHandle')

// ── Obtener posición del bloque en ProseMirror ────────────────
function getBlockAt(view, clientX, clientY) {
  const pos = view.posAtCoords({ left: clientX, top: clientY })
  if (!pos) return null

  const $pos  = view.state.doc.resolve(pos.pos)
  let depth   = $pos.depth

  // Subir hasta encontrar un nodo bloque de nivel top
  while (depth > 0 && $pos.node(depth).isInline) depth--

  const node  = $pos.node(depth)
  const from  = $pos.before(depth)

  if (!node || !node.isBlock) return null
  return { node, from, to: from + node.nodeSize }
}

export const GlobalDragHandle = Extension.create({
  name: 'globalDragHandle',

  addProseMirrorPlugins() {
    let handle      = null   // el elemento DOM del handle
    let hideTimer   = null
    let currentFrom = -1     // pos ProseMirror del bloque activo
    let currentTo   = -1
    let currentDOM  = null   // DOM node del bloque activo
    let isDragging  = false
    let overHandle  = false  // mouse está sobre el handle

    // ── Crear el elemento handle una sola vez ─────────────────
    function ensureHandle() {
      if (handle) return handle
      handle = document.createElement('div')
      handle.className = 'drag-handle-btn'
      handle.setAttribute('draggable', 'true')
      handle.title = 'Arrastrar bloque'
      handle.innerHTML = `<svg viewBox="0 0 8 14" width="8" height="14" fill="currentColor">
        <circle cx="2" cy="2"  r="1.4"/><circle cx="6" cy="2"  r="1.4"/>
        <circle cx="2" cy="7"  r="1.4"/><circle cx="6" cy="7"  r="1.4"/>
        <circle cx="2" cy="12" r="1.4"/><circle cx="6" cy="12" r="1.4"/>
      </svg>`
      document.body.appendChild(handle)

      // ── El handle se mantiene visible cuando el mouse está sobre él
      handle.addEventListener('mouseenter', () => {
        overHandle = true
        clearTimeout(hideTimer)
      })
      handle.addEventListener('mouseleave', () => {
        overHandle = false
        scheduleHide()
      })

      // ── Drag del handle ────────────────────────────────────────
      handle.addEventListener('dragstart', (e) => {
        if (currentFrom === -1) { e.preventDefault(); return }
        isDragging = true
        handle.style.display = 'none'

        // Guardar posiciones en dataTransfer
        e.dataTransfer.setData('text/x-block-from', String(currentFrom))
        e.dataTransfer.setData('text/x-block-to',   String(currentTo))
        e.dataTransfer.effectAllowed = 'move'

        // Indicador visual del bloque origen
        if (currentDOM) currentDOM.classList.add('drag-source-highlight')

        // Imagen de drag personalizada
        const ghost = document.createElement('div')
        ghost.style.cssText = 'position:fixed;top:-100px;background:#1B3055;color:white;padding:6px 12px;border-radius:6px;font-size:12px;font-family:Arial,sans-serif;opacity:0.9;pointer-events:none;'
        ghost.textContent = '↕ Moviendo bloque…'
        document.body.appendChild(ghost)
        e.dataTransfer.setDragImage(ghost, 60, 15)
        setTimeout(() => ghost.remove(), 0)
      })

      handle.addEventListener('dragend', () => {
        isDragging = false
        if (currentDOM) currentDOM.classList.remove('drag-source-highlight')
        currentDOM  = null
        currentFrom = -1
        currentTo   = -1
      })

      return handle
    }

    function positionHandle(domNode, view) {
      const h      = ensureHandle()
      const rect   = domNode.getBoundingClientRect()
      const eRect  = view.dom.getBoundingClientRect()

      h.style.top     = `${rect.top + (rect.height / 2) - 10}px`
      h.style.left    = `${eRect.left - 28}px`
      h.style.display = 'flex'
    }

    function scheduleHide() {
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        if (!isDragging && !overHandle && handle) {
          handle.style.display = 'none'
          currentDOM  = null
          currentFrom = -1
          currentTo   = -1
        }
      }, 300)
    }

    return [
      new Plugin({
        key: HANDLE_KEY,

        view(view) {
          function onMouseMove(e) {
            if (isDragging) return

            const result = getBlockAt(view, e.clientX, e.clientY)
            if (!result) { scheduleHide(); return }

            // Obtener DOM del bloque
            let dom
            try { dom = view.nodeDOM(result.from) } catch { dom = null }
            if (!dom || typeof dom.getBoundingClientRect !== 'function') {
              scheduleHide(); return
            }

            clearTimeout(hideTimer)
            currentFrom = result.from
            currentTo   = result.to
            currentDOM  = dom

            positionHandle(dom, view)
          }

          function onMouseLeave(e) {
            // Solo esconder si el mouse NO va al handle
            if (e.relatedTarget && handle && (handle === e.relatedTarget || handle.contains(e.relatedTarget))) {
              return  // el mouse va al handle — mantener visible
            }
            scheduleHide()
          }

          function onScroll() {
            // Al scrollear, reposicionar si hay bloque activo
            if (currentDOM && !isDragging) {
              positionHandle(currentDOM, view)
            }
          }

          view.dom.addEventListener('mousemove',  onMouseMove)
          view.dom.addEventListener('mouseleave', onMouseLeave)
          view.dom.closest?.('.doc-editor-body')?.addEventListener('scroll', onScroll)
          window.addEventListener('scroll', onScroll, true)

          return {
            destroy() {
              view.dom.removeEventListener('mousemove',  onMouseMove)
              view.dom.removeEventListener('mouseleave', onMouseLeave)
              window.removeEventListener('scroll', onScroll, true)
              clearTimeout(hideTimer)
              handle?.remove()
              handle = null
            },
          }
        },

        props: {
          handleDOMEvents: {
            drop(view, e) {
              const fromStr = e.dataTransfer?.getData('text/x-block-from')
              const toStr   = e.dataTransfer?.getData('text/x-block-to')
              if (!fromStr || !toStr) return false

              const from = parseInt(fromStr)
              const to   = parseInt(toStr)
              if (isNaN(from) || isNaN(to)) return false

              const dropPos = view.posAtCoords({ left: e.clientX, top: e.clientY })
              if (!dropPos) return false

              const dest = dropPos.pos
              if (dest >= from && dest <= to) return true  // mismo bloque

              e.preventDefault()

              const { state, dispatch } = view
              const slice = state.doc.slice(from, to)
              const tr    = state.tr

              if (dest > to) {
                tr.insert(dest, slice.content)
                tr.delete(from, to)
              } else {
                tr.delete(from, to)
                const adj = dest > from ? Math.max(0, dest - (to - from)) : dest
                tr.insert(adj, slice.content)
              }

              dispatch(tr)
              return true
            },
          },
        },
      }),
    ]
  },
})
