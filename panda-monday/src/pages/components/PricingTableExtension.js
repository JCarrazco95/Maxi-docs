import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import PricingTableView from './PricingTableView.jsx'

// ── Helpers de codificación ────────────────────────────────────
// Base64 seguro con Unicode para almacenar JSON en atributos HTML
export function encodeItems(items) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(items ?? []))))
  } catch {
    return btoa('[]')
  }
}

export function decodeItems(b64) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(b64 ?? btoa('[]')))))
  } catch {
    return []
  }
}

// ── Nodo TipTap: pricing-table ─────────────────────────────────
export const PricingTable = Node.create({
  name:       'pricingTable',
  group:      'block',
  atom:       true,      // bloque indivisible (como una imagen)
  selectable: true,
  draggable:  true,

  addAttributes() {
    return {
      title: {
        default:   'COTIZACIÓN RENTA',
        parseHTML: el => el.getAttribute('data-title') ?? 'COTIZACIÓN RENTA',
      },
      itemsB64: {
        default:   encodeItems([]),
        parseHTML: el => el.getAttribute('data-items-b64') ?? encodeItems([]),
      },
      ivaRate: {
        default:   16,
        parseHTML: el => Number(el.getAttribute('data-iva') ?? 16),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'pricing-table' }]
  },

  renderHTML({ node }) {
    // Serializa el nodo a HTML para guardarlo en la BD y enviarlo al backend
    return ['pricing-table', {
      'data-title':      node.attrs.title,
      'data-items-b64':  node.attrs.itemsB64,
      'data-iva':        String(node.attrs.ivaRate),
    }]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PricingTableView)
  },

  addCommands() {
    return {
      insertPricingTable: (attrs = {}) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            title:     attrs.title ?? 'COTIZACIÓN RENTA',
            itemsB64:  encodeItems([]),
            ivaRate:   16,
          },
        })
      },
    }
  },
})
