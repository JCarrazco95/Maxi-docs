/**
 * VariableHighlight — resalta {{variables}} en amarillo dentro del editor TipTap
 * Sin dependencias externas — usa el sistema de Decorations de ProseMirror.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const VAR_REGEX = /\{\{(\w+)\}\}/g

export const VariableHighlight = Extension.create({
  name: 'variableHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('variableHighlight'),
        props: {
          decorations(state) {
            const decorations = []
            state.doc.descendants((node, pos) => {
              if (!node.isText) return
              VAR_REGEX.lastIndex = 0
              let match
              while ((match = VAR_REGEX.exec(node.text)) !== null) {
                const from = pos + match.index
                const to   = from + match[0].length
                decorations.push(
                  Decoration.inline(from, to, {
                    class: 'mxd-var-highlight',
                    'data-var': match[1],
                  })
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
