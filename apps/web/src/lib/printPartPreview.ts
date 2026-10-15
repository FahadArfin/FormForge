import { createDocument, modelDocumentSchema, type MeshPayload, type ModelDocument, type ModelNode } from '@formforge/model'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'
import { analyzeMesh } from './meshTools'
import { generatePrintPart, placePrintPart, type PrintPart, type PrintPartOptions } from './printPartRecipes'

export interface PrintPartPreview { source: ModelDocument; part: PrintPart; mesh: MeshPayload }
export async function previewPrintPart(getCurrent: () => ModelDocument, options: PrintPartOptions, signal: AbortSignal, evaluate = evaluateSnapshot): Promise<PrintPartPreview> {
  const source = getCurrent()
  const part = placePrintPart(source, generatePrintPart(options))
  const document = modelDocumentSchema.parse({ ...createDocument('Part preview'), printer: source.printer, nodes: part.nodes })
  const mesh = await evaluate(document, signal)
  if (signal.aborted) throw new DOMException('Part preview cancelled.', 'AbortError')
  if (getCurrent() !== source) throw new Error('The project changed. Preview the part again before adding it.')
  if (!mesh.triangleCount || !Number.isFinite(mesh.volume) || mesh.volume <= 0 || !analyzeMesh({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) }).watertight) throw new Error('This recipe did not produce a closed printable solid. Adjust its dimensions and try again.')
  return { source, part, mesh }
}

export function applyPrintPart(getCurrent: () => ModelDocument, preview: PrintPartPreview, append: (nodes: ModelNode[]) => void) {
  if (getCurrent() !== preview.source) throw new Error('The project changed. Preview the part again before adding it.')
  append(preview.part.nodes)
  if (!preview.part.nodes.every(node => getCurrent().nodes.some(current => current.id === node.id))) throw new Error('The editor could not add this part. Finish the current edit and try again.')
}
