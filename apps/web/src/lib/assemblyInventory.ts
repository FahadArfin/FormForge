import type { ModelDocument, ModelNode } from '@formforge/model'
import { csv } from './exportPackage'

export interface InventoryComponent {
  id: string
  name: string
  quantity: 1
  nodeIds: string[]
  featureNames: string[]
  solidFeatures: number
  cutFeatures: number
  intersectFeatures: number
  materials: string[]
}
export interface AssemblyInventory {
  version: 1
  source: { projectId: string; name: string; revision: number }
  scope: 'whole' | 'selected'
  components: InventoryComponent[]
  suppressedFeatures: number
  unassignedTools: number
  warnings: string[]
}

/** An inventory of editable source components, deliberately not inferred physical parts. */
export function assemblyInventory(document: ModelDocument, selectedIds?: readonly string[]): AssemblyInventory {
  if (document.nodes.length > 2000) throw new Error('Inventory supports up to 2,000 source features. Split the project into smaller assemblies.')
  if (new Set(document.nodes.map(n => n.id)).size !== document.nodes.length) throw new Error('Source feature IDs must be unique.')
  const nodes = document.nodes
  const parents = nodes.map((_, i) => i)
  const find = (index: number): number => {
    let root = index
    while (parents[root] !== root) root = parents[root]!
    while (index !== root) { const next = parents[index]!; parents[index] = root; index = next }
    return root
  }
  const join = (a: number, b: number) => { parents[find(b)] = find(a) }
  const byId = new Map(nodes.map((node, i) => [node.id, i]))
  const booleans = new Map<string, number>()
  const groups = new Map<string, number>(), assemblies = new Map<string, number>()
  const connect = (map: Map<string, number>, key: string | undefined, index: number) => {
    if (!key) return
    const previous = map.get(key)
    if (previous !== undefined) join(previous, index)
    else map.set(key, index)
  }
  // Same connected relationships as completeSelection, with bounded linear passes.
  nodes.forEach((node, index) => {
    connect(booleans,node.booleanPath?.[0]?.id,index)
    if (node.combined) connect(groups, node.groupId, index)
    connect(assemblies, node.assemblyPath?.[0], index)
    const target = node.faceAttachment && byId.get(node.faceAttachment.targetNodeId)
    if (target !== undefined) join(index, target)
  })
  const selected = selectedIds === undefined ? null : new Set(selectedIds)
  const partitions = new Map<number, ModelNode[]>()
  nodes.forEach((node, index) => { const key = find(index); const group = partitions.get(key) ?? []; group.push(node); partitions.set(key, group) })
  const materials = new Map(document.materialPalette.map(material => [material.id, material.name]))
  const components: InventoryComponent[] = []
  let unassignedTools = 0
  for (const connected of partitions.values()) {
    if (selected && !connected.some(n => selected.has(n.id))) continue
    const group = connected.filter(n => !n.suppressed)
    const solids = group.filter(n => n.boolean === 'add')
    if (!solids.length) { unassignedTools += group.length; continue }
    const labels = new Set<string>()
    for (const node of solids) {
      labels.add(node.materialId ? materials.get(node.materialId) ?? 'Unknown material' : `Color ${node.color}`)
      for (const assignment of node.mesh?.triangleMaterials ?? []) labels.add(materials.get(assignment.materialId) ?? 'Unknown material')
    }
    components.push({
      id: solids[0]!.id, name: solids[0]!.name, quantity: 1,
      nodeIds: group.map(n => n.id), featureNames: group.map(n => n.name), solidFeatures: solids.length,
      cutFeatures: group.filter(n => n.boolean === 'cut').length,
      intersectFeatures: group.filter(n => n.boolean === 'intersect').length,
      materials: [...labels],
    })
  }
  const warnings = [
    'Components follow editable assembly, boolean-group and attached-feature relationships; they are not a count of physical solids. Ungrouped solids may overlap or be cut by global tools.',
    'Quantity is one per listed component. Identical names are not merged. Materials are assigned labels or display colors, not verified filament composition.',
    'No purchasing part numbers, supplier details, evaluated dimensions, mass, cost or print readiness are inferred.',
  ]
  if (unassignedTools) warnings.push(`${unassignedTools} ungrouped cut/intersection feature(s) affect geometry but are not listed as separate components.`)
  if (document.sculptStrokes.length) warnings.push('Volume sculpting can connect or separate components. Use the evaluated parts export to inspect physical shells.')
  return { version: 1, source: { projectId: document.id, name: document.name, revision: document.revision }, scope: selected ? 'selected' : 'whole', components, suppressedFeatures: nodes.filter(n => n.suppressed).length, unassignedTools, warnings }
}

export function inventoryCsv(inventory: AssemblyInventory): string {
  return csv([
    ['Project', 'Revision', 'Scope', 'Component', 'Quantity (source component)', 'Solid features', 'Cut features', 'Intersection features', 'Assigned materials / display colors', 'Source feature IDs', 'Source feature names'],
    ...inventory.components.map(c => [inventory.source.name, inventory.source.revision, inventory.scope, c.name, c.quantity, c.solidFeatures, c.cutFeatures, c.intersectFeatures, c.materials.join('; '), c.nodeIds.join('; '), c.featureNames.join('; ')]),
    ...inventory.warnings.map(warning => ['Note', warning]),
  ])
}
export function inventoryJson(inventory: AssemblyInventory): string { return JSON.stringify(inventory, null, 2) }
