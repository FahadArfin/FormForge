export const cadTools = [
  { id: 'workplane', name: 'Workplane and drawing plane', group: 'Create', keywords: 'surface face plane', tab: 'tools', toolkit: 'create' },
  { id: 'image', name: 'Trace a reference image', group: 'Create', keywords: 'reference photo picture blueprint calibrate', tab: 'tools', toolkit: 'create' },
  { id: 'text', name: 'Emboss or engrave text', group: 'Create', keywords: 'writing letters label deboss', tab: 'tools', toolkit: 'create' },
  { id: 'parts', name: 'Insert reusable parts', group: 'Create', keywords: 'library saved assembly', tab: 'tools', toolkit: 'create' },
  { id: 'recipes', name: 'Enclosures, brackets, adapters and snaps', group: 'Create', keywords: 'recipe functional box case snap fit', tab: 'tools', toolkit: 'create' },
  { id: 'coupon', name: 'Fit-test coupon and pin gauge', group: 'Create', keywords: 'tolerance calibration fit clearance test', tab: 'tools', toolkit: 'create' },
  { id: 'holes', name: 'Hole builder', group: 'Create', keywords: 'screw bolt countersink tolerance clearance', tab: 'tools', toolkit: 'create' },
  { id: 'section', name: 'Inspect a cross section', group: 'Inspect', keywords: 'slice clipping inside', tab: 'tools', toolkit: 'inspect' },
  { id: 'properties', name: 'Evaluate part properties', group: 'Inspect', keywords: 'volume area centroid center mass size dimensions', tab: 'tools', toolkit: 'inspect' },
  { id: 'mesh-doctor', name: 'Mesh Doctor: inspect and clean up', group: 'Inspect', keywords: 'repair topology watertight manifold winding duplicate triangles', tab: 'tools', toolkit: 'inspect' },
  { id: 'annotations', name: 'Dimensions and angle annotations', group: 'Inspect', keywords: 'angle distance dimension note', tab: 'tools', toolkit: 'inspect' },
  { id: 'measure', name: 'Measure the mesh', group: 'Inspect', keywords: 'ruler vertex distance', tab: 'tools', toolkit: 'inspect' },
  { id: 'diameter', name: 'Measure circle diameter and radius', group: 'Inspect', keywords: 'three points circumference circle', tab: 'tools', toolkit: 'inspect' },
  { id: 'transform', name: 'Precise assembly transform', group: 'Prepare', keywords: 'numeric move rotate scale pivot', tab: 'tools', toolkit: 'prepare' },
  { id: 'face', name: 'Place a face on the build plate', group: 'Prepare', keywords: 'orient contact lay flat', tab: 'tools', toolkit: 'prepare' },
  { id: 'plate', name: 'Center and drop on the plate', group: 'Prepare', keywords: 'position bed placement', tab: 'tools', toolkit: 'prepare' },
  { id: 'assembly', name: 'Align and pattern assemblies', group: 'Prepare', keywords: 'array distribute circular repeat', tab: 'tools', toolkit: 'prepare' },
  { id: 'split', name: 'Split into printable pieces', group: 'Prepare', keywords: 'cut plane dowel connector', tab: 'tools', toolkit: 'prepare' },
  { id: 'material', name: 'Material profiles and print cost', group: 'Print', keywords: 'filament slicer weight price', tab: 'print' },
  { id: 'parameters', name: 'Parameters and design variants', group: 'Project', keywords: 'variant formula variable', tab: 'parameters' },
  { id: 'history', name: 'Browse edit history', group: 'Project', keywords: 'undo redo timeline session', tab: 'history' },
  { id: 'rebuild', name: 'Choose automatic or manual rebuilding', group: 'Project', keywords: 'preview performance slow rebuild complex', tab: 'history' },
] as const

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export function searchCommands<T extends { name: string; group: string; keywords?: string }>(items: readonly T[], query: string): T[] {
  const term = normalize(query)
  const words = term.split(/\s+/).filter(Boolean)
  return items.map((item, index) => ({ item, index, name: normalize(item.name), haystack: normalize(`${item.name} ${item.group} ${item.keywords ?? ''}`) }))
    .filter(entry => words.every(word => entry.haystack.includes(word)))
    .sort((a, b) => Number(b.name.includes(term)) - Number(a.name.includes(term)) || a.index - b.index).map(entry => entry.item)
}
