import { completeSelection } from './assemblies'
import type { MeshPayload, ModelDocument, ParameterBindingTarget, Vec3Value } from '@formforge/model'

export type PlatePlacementScope = 'selection' | 'document'
export type PlatePlacementAction = 'center' | 'drop' | 'center-and-drop'

export interface PlatePlacementTarget {
  nodeIds: ReadonlySet<string>
  evaluationDocument: ModelDocument
  movesWholeDocument: boolean
}

export function getPlatePlacementTarget(document: ModelDocument, selectedIds: readonly string[], scope: PlatePlacementScope): PlatePlacementTarget {
  const ids = new Set(scope === 'document' ? document.nodes.map(node => node.id) : selectedIds)
  const nodes = completeSelection(document.nodes, [...ids])
  if (!nodes.length) throw new Error(scope === 'selection' ? 'Select a shape or assembly to place.' : 'Add a printable solid before placing the model.')
  if (nodes.some(node => node.locked)) throw new Error('Unlock all affected shapes first. A locked part cannot move with the assembly.')
  const movesWholeDocument = nodes.length === document.nodes.length
  if (document.sculptStrokes.length && !movesWholeDocument) throw new Error('Place the whole model to keep volume sculpting attached. Partial sculpted selections cannot be placed independently.')
  return {
    nodeIds: new Set(nodes.map(node => node.id)),
    evaluationDocument: movesWholeDocument ? document : { ...document, nodes, sculptStrokes: [] },
    movesWholeDocument,
  }
}

export function placeDocumentFromMesh(document: ModelDocument, target: PlatePlacementTarget, mesh: MeshPayload, action: PlatePlacementAction): ModelDocument | null {
  if (!mesh.triangleCount || !mesh.positions.length) throw new Error('There is no printable solid in this placement scope.')
  if (mesh.positions.length % 3 !== 0) throw new Error('The evaluated geometry contains invalid coordinates.')
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < mesh.positions.length; index += 1) {
    const coordinate = mesh.positions[index]!
    if (!Number.isFinite(coordinate)) throw new Error('The evaluated geometry contains invalid coordinates.')
    const axis = index % 3
    min[axis] = Math.min(min[axis]!, coordinate)
    max[axis] = Math.max(max[axis]!, coordinate)
  }
  const delta: Vec3Value = {
    x: action === 'drop' ? 0 : -(min[0]! + max[0]!) / 2,
    y: action === 'drop' ? 0 : -(min[1]! + max[1]!) / 2,
    z: action === 'center' ? 0 : -min[2]!,
  }
  if (Object.values(delta).every(value => Math.abs(value) < 0.00001)) return null
  const axes = ['x', 'y', 'z'] as const
  for (const node of document.nodes) {
    if (!target.nodeIds.has(node.id)) continue
    if (!document.template?.nodeIds.includes(node.id) && axes.some(axis => Math.abs(delta[axis]) >= 0.00001 && node.parameterBindings?.[`position${axis.toUpperCase()}` as ParameterBindingTarget])) {
      throw new Error('Clear the affected position binding before placement so the saved model keeps its new location.')
    }
  }
  const translated = (value: Vec3Value): Vec3Value => ({ x: value.x + delta.x, y: value.y + delta.y, z: value.z + delta.z })
  return {
    ...document,
    nodes: document.nodes.map(node => {if(!target.nodeIds.has(node.id))return node;const bindings={...node.parameterBindings};if(document.template?.nodeIds.includes(node.id))for(const axis of axes){const key=`position${axis.toUpperCase()}` as ParameterBindingTarget;if(bindings[key]&&Math.abs(delta[axis])>=.00001)bindings[key]=`(${bindings[key]}) + (${delta[axis]})`}return { ...node,parameterBindings:node.parameterBindings?bindings:undefined, transform: { ...node.transform, position: translated(node.transform.position) } }}),
    sculptStrokes: target.movesWholeDocument ? document.sculptStrokes.map(stroke => ({ ...stroke, center: translated(stroke.center) })) : document.sculptStrokes,
    revision: document.revision + 1,
    updatedAt: new Date().toISOString(),
  }
}
