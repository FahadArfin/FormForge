import type { ModelDocument } from '@formforge/model'

/** Exact geometry prefix; metadata and revision never establish compatibility. */
export function isVolumeContinuation(previous: ModelDocument | null, next: ModelDocument): boolean {
  return Boolean(previous && previous.id === next.id
    && JSON.stringify(previous.nodes) === JSON.stringify(next.nodes)
    && previous.sculptStrokes.length <= next.sculptStrokes.length
    && previous.sculptStrokes.every((stroke, index) => JSON.stringify(stroke) === JSON.stringify(next.sculptStrokes[index]))
    && next.sculptStrokes.slice(previous.sculptStrokes.length).every(stroke => ['add', 'carve', 'inflate'].includes(stroke.mode)))
}
