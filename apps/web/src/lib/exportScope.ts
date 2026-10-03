import { completeSelection } from './assemblies'
import type { ModelDocument } from '@formforge/model'

/** Preserve feature order and explicit group semantics. Global cutters are included only when selected. */
export function createExportDocument(document: ModelDocument, selectedIds: readonly string[]): ModelDocument {
  if (!selectedIds.length) throw new Error('Select shapes before choosing selected-part export.')
  const ids = new Set(selectedIds)
  const nodes = completeSelection(document.nodes, [...ids])
  if (!nodes.some(node => !node.suppressed && node.boolean === 'add')) throw new Error('The selection must contain an enabled solid. Holes alone cannot be exported.')
  if (document.sculptStrokes.length && nodes.length !== document.nodes.length) throw new Error('Volume sculpting affects the whole model. Export the complete model or select all shapes to preserve it.')
  return { ...document, nodes, sculptStrokes: nodes.length === document.nodes.length ? document.sculptStrokes : [] }
}
