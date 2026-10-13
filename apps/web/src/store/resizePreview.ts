import { create } from 'zustand'
import type { ModelDocument, Vec3Value } from '@formforge/model'
import { useEditor } from './editor'

// Ephemeral UI state: never changes the document, history, persistence or geometry worker.
export const useResizePreview = create<{
  document: ModelDocument | null
  scales: Record<string, Vec3Value>
}>(() => ({ document: null, scales: {} }))

export function clearResizePreview() {
  useResizePreview.setState({ document: null, scales: {} })
}

export function useResizeScale(nodeId: string | undefined) {
  const document = useEditor(state => state.document)
  // Document identity also rejects previews after an edit, undo or project replacement.
  return useResizePreview(state => state.document === document && nodeId ? state.scales[nodeId] : undefined)
}
