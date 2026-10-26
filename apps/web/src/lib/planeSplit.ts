import { createNode, vec3, type ModelDocument, type MeshPayload } from '@formforge/model'
import { evaluateSnapshot } from '../geometry/evaluateSnapshot'
import type { SplitParts, SplitPlane, SplitWorkerResponse } from '../geometry/split.worker'
import { validateSplitConnector, type SplitConnector } from '../geometry/splitConnectors'
import { meshBounds } from './importReview'
export type SplitOptions = SplitPlane & { keep: 'both' | 'positive' | 'negative'; connector?: SplitConnector }
type SplitContext = { signal?: AbortSignal; isCurrent?: () => boolean; compute?: (document: ModelDocument, options: SplitOptions, signal?: AbortSignal) => Promise<SplitParts> }
const aborted = () => new DOMException('Split cancelled. Your model was not changed.', 'AbortError')

function validate(document: ModelDocument, options: SplitOptions) {
  if (document.nodes.some(node => node.locked)) throw new Error('Unlock every shape before replacing the model with split meshes.')
  if (!document.nodes.some(node => !node.suppressed)) throw new Error('Add a solid before splitting the model.')
  if (!['x', 'y', 'z'].includes(options.axis) || !Number.isFinite(options.offset) || Math.abs(options.offset) > 1_000_000) throw new Error('Choose a finite plane position within ±1,000,000 mm.')
  if (!['both', 'positive', 'negative'].includes(options.keep)) throw new Error('Choose which half to keep.')
  if (options.connector) {
    if (options.keep !== 'both') throw new Error('Keep both halves when creating matching connectors.')
    validateSplitConnector(options.connector)
  }
}

export function createSplitDocument(source: ModelDocument, parts: SplitParts, options: SplitOptions): ModelDocument {
  validate(source, options)
  const sides = options.keep === 'both' ? ['positive', 'negative'] as const : [options.keep]
  const color = source.nodes.find(node => !node.suppressed && node.boolean === 'add')?.color ?? '#8dc8c2'
  // Every mesh coordinate is already evaluated in world space. Keep those vertices
  // unchanged and never reapply the original source transforms.
  const outputParts = sides.map(side => ({ mesh: parts[side], name: `Split ${side} · ${options.axis.toUpperCase()} ${side === 'positive' ? '≥' : '≤'} ${Number(options.offset.toFixed(4))} mm` }))
  if (options.connector) outputParts.push(...(parts.extras ?? []))
  const nodes = outputParts.map(({ mesh, name }) => {
    if (!mesh?.indices.length || !mesh.positions.length || !(mesh.volume > 0)) throw new Error('Both split halves must contain nonempty closed solids.')
    const node = createNode('mesh', 'add', vec3())
    node.name = name
    node.color = color
    node.mesh = { positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) }
    return node
  })
  if (options.connector) {
    // Touching assembly faces would be fused by the ordinary whole-model export
    // union (and turn blind dowel sockets into trapped cavity shells). Lay out
    // connector parts with a real gap using node transforms, preserving mesh data.
    const bounds = outputParts.map(part => meshBounds(part.mesh)), gap = 8
    const totalWidth = bounds.reduce((width, bound) => width + bound.size.x, 0) + gap * (nodes.length - 1)
    let cursor = -totalWidth / 2
    nodes.forEach((node, index) => {
      const bound = bounds[index]!
      node.transform.position = vec3(cursor - bound.min.x, -(bound.min.y + bound.max.y) / 2, -bound.min.z)
      cursor += bound.size.x + gap
    })
  }
  return { ...source, nodes, sculptStrokes: [], revision: source.revision + 1, updatedAt: new Date().toISOString() }
}

function splitInWorker(mesh: MeshPayload, options: SplitOptions, signal?: AbortSignal): Promise<SplitParts> {
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
    try { worker.postMessage({ mesh, plane: { axis: options.axis, offset: options.offset }, connector: options.connector }) } catch (error) { cleanup(); reject(error) }
  })
}

async function evaluateAndSplit(document: ModelDocument, options: SplitOptions, signal?: AbortSignal) {
  const mesh = await evaluateSnapshot(document, signal)
  return splitInWorker(mesh, options, signal)
}

export interface SplitPreview { source: ModelDocument; options: SplitOptions; parts: SplitParts; replacement: ModelDocument }
const availablePreviews = new WeakSet<SplitPreview>()

/** Produces isolated, reviewed output without changing the project or creating a checkpoint. */
export async function previewSplitDocument(getDocument: () => ModelDocument, requested: SplitOptions, context: SplitContext = {}): Promise<SplitPreview> {
  if (context.signal?.aborted) throw aborted()
  const source = getDocument(), options = structuredClone(requested)
  validate(source, options)
  if (context.isCurrent?.() === false) throw new Error('The split settings changed. Preview again.')
  const parts = await (context.compute ?? evaluateAndSplit)(source, options, context.signal)
  if (context.signal?.aborted) throw aborted()
  if (getDocument() !== source || context.isCurrent?.() === false) throw new Error('The project or split settings changed. Preview the current design again.')
  const preview = { source, options, parts, replacement: createSplitDocument(source, parts, options) }
  availablePreviews.add(preview)
  return preview
}

/** Save an independent recovery version before the only document mutation. Recheck after the async write. */
export async function applySplitPreview(getDocument: () => ModelDocument, preview: SplitPreview, saveRecovery: (document: ModelDocument, label: string) => Promise<unknown>, apply: (document: ModelDocument) => void, context: Pick<SplitContext, 'signal' | 'isCurrent'> = {}): Promise<ModelDocument> {
  const check = () => {
    if (context.signal?.aborted) throw aborted()
    if (!availablePreviews.has(preview)) throw new Error('Preview the split before applying it. This preview has already been used.')
    if (getDocument() !== preview.source || context.isCurrent?.() === false) throw new Error('The project or split settings changed. Preview again before applying.')
  }
  check()
  await saveRecovery(preview.source, preview.options.connector ? 'Before split with connectors' : 'Before plane split')
  check()
  apply(preview.replacement)
  availablePreviews.delete(preview)
  return preview.replacement
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
