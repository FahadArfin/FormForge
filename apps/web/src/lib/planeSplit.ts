import { createNode, vec3, type ModelDocument, type MeshPayload } from '@formforge/model'
import { evaluateSnapshot } from '../geometry/evaluateSnapshot'
import type { SplitParts, SplitPlane, SplitWorkerResponse } from '../geometry/split.worker'
export type SplitOptions = SplitPlane & { keep: 'both' | 'positive' | 'negative' }
type SplitContext = { signal?: AbortSignal; isCurrent?: () => boolean; compute?: (document: ModelDocument, plane: SplitPlane, signal?: AbortSignal) => Promise<SplitParts> }
const aborted = () => new DOMException('Split cancelled. Your model was not changed.', 'AbortError')

function validate(document: ModelDocument, options: SplitOptions) {
  if (document.nodes.some(node => node.locked)) throw new Error('Unlock every shape before replacing the model with split meshes.')
  if (!document.nodes.some(node => !node.suppressed)) throw new Error('Add a solid before splitting the model.')
  if (!['x', 'y', 'z'].includes(options.axis) || !Number.isFinite(options.offset) || Math.abs(options.offset) > 1_000_000) throw new Error('Choose a finite plane position within ±1,000,000 mm.')
  if (!['both', 'positive', 'negative'].includes(options.keep)) throw new Error('Choose which half to keep.')
}

export function createSplitDocument(source: ModelDocument, parts: SplitParts, options: SplitOptions): ModelDocument {
  validate(source, options)
  const sides = options.keep === 'both' ? ['positive', 'negative'] as const : [options.keep]
  const color = source.nodes.find(node => !node.suppressed && node.boolean === 'add')?.color ?? '#8dc8c2'
  // Every coordinate is already evaluated in world space. Do not recenter, rescale, or reapply source transforms.
  const nodes = sides.map(side => {
    const mesh = parts[side]
    if (!mesh?.indices.length || !mesh.positions.length || !(mesh.volume > 0)) throw new Error('Both split halves must contain nonempty closed solids.')
    const node = createNode('mesh', 'add', vec3())
    node.name = `Split ${side} · ${options.axis.toUpperCase()} ${side === 'positive' ? '≥' : '≤'} ${Number(options.offset.toFixed(4))} mm`
    node.color = color
    node.mesh = { positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) }
    return node
  })
  return { ...source, nodes, sculptStrokes: [], revision: source.revision + 1, updatedAt: new Date().toISOString() }
}

function splitInWorker(mesh: MeshPayload, plane: SplitPlane, signal?: AbortSignal): Promise<SplitParts> {
  if (signal?.aborted) return Promise.reject(aborted())
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../geometry/split.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker.terminate() }
    const cancel = () => { cleanup(); reject(aborted()) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('Splitting timed out. Your original model is unchanged. Simplify it or try a different plane.')) }, 60_000)
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onmessage = (event: MessageEvent<SplitWorkerResponse>) => {
      cleanup()
      if (event.data.ok) resolve(event.data.parts)
      else reject(new Error(event.data.error))
    }
    worker.onerror = event => { event.preventDefault(); cleanup(); reject(new Error(event.message || 'The split worker failed. Your model is unchanged.')) }
    worker.onmessageerror = () => { cleanup(); reject(new Error('The split worker returned unreadable data. Your model is unchanged.')) }
    try { worker.postMessage({ mesh, plane }) } catch (error) { cleanup(); reject(error) }
  })
}

async function evaluateAndSplit(document: ModelDocument, plane: SplitPlane, signal?: AbortSignal) {
  const mesh = await evaluateSnapshot(document, signal)
  return splitInWorker(mesh, plane, signal)
}

export async function splitDocumentSafely(getDocument: () => ModelDocument, options: SplitOptions, apply: (document: ModelDocument) => void, context: SplitContext = {}): Promise<ModelDocument> {
  if (context.signal?.aborted) throw aborted()
  const source = getDocument()
  validate(source, options)
  if (context.isCurrent?.() === false) throw new Error('The split settings changed. Try again with the current plane.')
  const parts = await (context.compute ?? evaluateAndSplit)(source, options, context.signal)
  if (context.signal?.aborted) throw aborted()
  if (getDocument() !== source || context.isCurrent?.() === false) throw new Error('The project or split plane changed while processing. Your model was not replaced; start the split again.')
  const replacement = createSplitDocument(source, parts, options)
  apply(replacement)
  return replacement
}
