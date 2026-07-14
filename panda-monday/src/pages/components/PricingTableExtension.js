import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import PricingTableView from './PricingTableView.jsx'

// ── Codificación Base64 Unicode-safe ───────────────────────────
export function encodeItems(items) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(items ?? [])))) }
  catch { return btoa('[]') }
}

export function decodeItems(b64) {
  try { return JSON.parse(decodeURIComponent(escape(atob(b64 ?? btoa('[]'))))) }
  catch { return [] }
}

// ── Codificación columnas personalizadas ───────────────────────
export function encodeColumns(cols) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(cols ?? [])))) }
  catch { return btoa('[]') }
}
export function decodeColumns(b64) {
  try { return JSON.parse(decodeURIComponent(escape(atob(b64 ?? btoa('[]'))))) }
  catch { return [] }
}

// Títulos por defecto según tipo de tabla
export const TABLE_TYPE_DEFAULTS = {
  renta:        { title: 'COTIZACIÓN RENTA',      label: 'Renta' },
  traslados:    { title: 'COTIZACIÓN TRASLADOS',  label: 'Traslados' },
  accesorios:   { title: 'COTIZACIÓN ACCESORIOS', label: 'Accesorios' },
  generic:      { title: 'COTIZACIÓN',            label: 'Genérico' },
  personalizada:{ title: 'TABLA PERSONALIZADA',   label: 'Personalizada' },
}

// ── Nodo TipTap: pricing-table ─────────────────────────────────
export const PricingTable = Node.create({
  name:       'pricingTable',
  group:      'block',
  atom:       true,
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
        // El backend (pdfService.processPricingTableNodes) y las plantillas
        // usan "data-iva-rate", no "data-iva" — deben coincidir para que el
        // IVA sobreviva un guardado desde Edición libre.
        parseHTML: el => Number(el.getAttribute('data-iva-rate') ?? 16),
      },
      tableType: {
        default:   'renta',
        parseHTML: el => el.getAttribute('data-table-type') ?? 'renta',
      },
      // Columnas personalizadas (solo usado por tableType='personalizada')
      columnsB64: {
        default:   encodeColumns([]),
        parseHTML: el => el.getAttribute('data-columns-b64') ?? encodeColumns([]),
      },
    }
  },

  parseHTML() { return [{ tag: 'pricing-table' }] },

  renderHTML({ node }) {
    return ['pricing-table', {
      'data-title':       node.attrs.title,
      'data-items-b64':   node.attrs.itemsB64,
      'data-iva-rate':    String(node.attrs.ivaRate),
      'data-table-type':  node.attrs.tableType,
      'data-columns-b64': node.attrs.columnsB64,
    }]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PricingTableView)
  },

  addCommands() {
    return {
      insertPricingTable: (attrs = {}) => ({ commands }) => {
        const type = attrs.tableType ?? 'renta'
        const defaultTitle = TABLE_TYPE_DEFAULTS[type]?.title ?? 'COTIZACIÓN'
        return commands.insertContent({
          type: this.name,
          attrs: {
            title:      attrs.title ?? defaultTitle,
            itemsB64:   encodeItems([]),
            ivaRate:    16,
            tableType:  type,
            columnsB64: attrs.columnsB64 ?? encodeColumns([]),
          },
        })
      },
    }
  },
})
