/**
 * SignatureFieldExtension — campos de firma inline estilo PandaDoc
 * Cada campo es un nodo TipTap (bloque atómico) que renderiza un React component.
 * Tipos: signature | initials | date | text
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'

// ── Colores por tipo de campo ─────────────────────────────────
export const FIELD_COLORS = {
  signature: { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8', icon: '✍️' },
  initials:  { bg: '#ede9fe', border: '#7c3aed', text: '#5b21b6', icon: 'IN' },
  date:      { bg: '#dcfce7', border: '#16a34a', text: '#15803d', icon: '📅' },
  text:      { bg: '#fef9c3', border: '#ca8a04', text: '#854d0e', icon: 'Aa' },
}

export const FIELD_LABELS = {
  signature: 'Firma',
  initials:  'Iniciales',
  date:      'Fecha',
  text:      'Texto',
}

// ── React NodeView — lo que se ve en el editor ────────────────
function SignatureFieldView({ node, deleteNode, selected }) {
  const { fieldType, signerName, signerColor, fieldId } = node.attrs
  const colors = FIELD_COLORS[fieldType] ?? FIELD_COLORS.signature

  return (
    <NodeViewWrapper
      as="span"
      data-signature-field="true"
      data-field-type={fieldType}
      data-field-id={fieldId}
      data-signer-name={signerName || ''}
      style={{ display: 'inline-block', userSelect: 'none' }}
    >
      <span
        contentEditable={false}
        style={{
          display:       'inline-flex',
          alignItems:    'center',
          gap:           6,
          background:    colors.bg,
          border:        `1.5px ${selected ? 'solid' : 'dashed'} ${colors.border}`,
          borderRadius:  6,
          padding:       '4px 10px',
          fontSize:      11,
          fontWeight:    600,
          color:         colors.text,
          cursor:        'default',
          verticalAlign: 'middle',
          minWidth:      100,
          boxShadow:     selected ? `0 0 0 2px ${colors.border}40` : 'none',
          transition:    'box-shadow 0.15s',
          position:      'relative',
        }}
      >
        <span style={{ fontSize: 13 }}>{colors.icon}</span>
        <span>{FIELD_LABELS[fieldType]}</span>
        {signerName && (
          <span style={{
            fontSize: 10, fontWeight: 500,
            color: colors.text, opacity: 0.75,
            maxWidth: 100, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            — {signerName}
          </span>
        )}
        {/* Botón eliminar */}
        <button
          contentEditable={false}
          onClick={deleteNode}
          style={{
            position: 'absolute', top: -8, right: -8,
            width: 16, height: 16, borderRadius: '50%',
            background: '#ef4444', border: 'none',
            color: 'white', fontSize: 9, fontWeight: 700,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: 0,
          }}
          title="Eliminar campo"
        >×</button>
      </span>
    </NodeViewWrapper>
  )
}

// ── TipTap Node Definition ─────────────────────────────────────
export const SignatureField = Node.create({
  name:     'signatureField',
  group:    'inline',
  inline:   true,
  atom:     true,
  draggable: true,

  addAttributes() {
    return {
      fieldType:   { default: 'signature' },
      fieldId:     { default: () => crypto.randomUUID() },
      signerIndex: { default: 0 },
      signerName:  { default: '' },
      signerColor: { default: '#0073ea' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-signature-field]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-signature-field': 'true' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SignatureFieldView)
  },

  addCommands() {
    return {
      insertSignatureField: (attrs) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { fieldId: crypto.randomUUID(), ...attrs },
        })
      },
    }
  },
})
