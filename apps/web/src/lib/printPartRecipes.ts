import { createNode, createProfileRecipe, vec3, type ModelDocument, type ModelNode } from '@formforge/model'
import { Box3, Vector3 } from 'three'
import { nodeWorldBounds } from './modelGeometry'

export type VentOptions = { kind: 'vent'; width: number; depth: number; thickness: number; cornerRadius: number; pattern: 'slots' | 'round'; rows: number; columns: number; openingWidth: number; openingLength: number; gap: number; border: number }
export type BracketOptions = { kind: 'bracket'; width: number; depth: number; height: number; wall: number; ribThickness: number; ribCount: number; ribReach: number; ribHeight: number; holeDiameter: number }
export type BossOptions = { kind: 'boss'; outerDiameter: number; height: number; boreDiameter: number; boreDepth: number; leadIn: number; baseDiameter: number; baseThickness: number }
export type PrintPartOptions = VentOptions | BracketOptions | BossOptions
export const printPartDefaults = {
  vent: { kind: 'vent', width: 80, depth: 50, thickness: 3, cornerRadius: 4, pattern: 'slots', rows: 2, columns: 6, openingWidth: 4, openingLength: 16, gap: 3, border: 5 } as VentOptions,
  bracket: { kind: 'bracket', width: 40, depth: 30, height: 30, wall: 3, ribThickness: 3, ribCount: 2, ribReach: 20, ribHeight: 20, holeDiameter: 4 } as BracketOptions,
  boss: { kind: 'boss', outerDiameter: 14, height: 12, boreDiameter: 4.6, boreDepth: 8, leadIn: 0.6, baseDiameter: 20, baseThickness: 2 } as BossOptions,
}
export interface PrintPart { title: string; nodes: ModelNode[]; facts: string[]; warnings: string[] }
const bounded = (value: number, label: string, min: number, max: number) => {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label}: use ${min}–${max} mm.`)
  return value
}
const count = (value: number, label: string, min: number, max: number) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: use a whole number from ${min} to ${max}.`)
  return value
}
const mm = (value: number) => Number(value.toFixed(3))

/** Uses existing primitives and explicit Boolean groups; no mesh baking or new project schema. */
export function generatePrintPart(options: PrintPartOptions): PrintPart {
  const nodes: ModelNode[] = [], groupId = crypto.randomUUID()
  const add = (kind: ModelNode['kind'], name: string, x: number, y: number, z: number, parameters: Partial<ModelNode['parameters']>, cut = false) => {
    const node = createNode(kind, cut ? 'cut' : 'add', vec3(x, y, z))
    Object.assign(node, { name, combined: true, groupId, groupOperation: 'boolean' })
    node.parameters = { ...node.parameters, ...parameters, segments: 96 }
    nodes.push(node); return node
  }
  const box = (name: string, x: number, y: number, z: number, width: number, depth: number, height: number) => add('box', name, x, y, z, { width, depth, height })
  const round = (name: string, x: number, y: number, z: number, radius: number, height: number, cut = false) => add('cylinder', name, x, y, z, { radius, height }, cut)
  if (options.kind === 'vent') {
    const p = options
    for (const [label, value] of [['Panel width', p.width], ['Panel depth', p.depth]] as const) bounded(value, label, 10, 300)
    bounded(p.thickness, 'Panel thickness', 0.8, 20); bounded(p.cornerRadius, 'Corner radius', 0, Math.min(p.width, p.depth) / 2)
    bounded(p.openingWidth, 'Opening width', 1, 40); bounded(p.gap, 'Material between openings', 0.8, 30); bounded(p.border, 'Border', 1, Math.min(p.width, p.depth) / 2)
    count(p.rows, 'Rows', 1, 8); count(p.columns, 'Columns', 1, 12)
    if (p.rows * p.columns > 64) throw new Error('Keep the pattern to at most 64 openings.')
    if (p.pattern !== 'slots' && p.pattern !== 'round') throw new Error('Choose round holes or rounded slots.')
    if (p.pattern === 'slots') bounded(p.openingLength, 'Slot length', p.openingWidth, 100)
    const length = p.pattern === 'round' ? p.openingWidth : p.openingLength
    const extentX = p.columns * p.openingWidth + (p.columns - 1) * p.gap
    const extentY = p.rows * length + (p.rows - 1) * p.gap
    // Keeping openings inside the corner-radius inset is conservative for rounded corners.
    const inset = Math.max(p.border, p.cornerRadius)
    if (extentX > p.width - 2 * inset || extentY > p.depth - 2 * inset) throw new Error('The openings do not fit inside the border. Reduce rows, columns, opening size or gap, or enlarge the panel.')
    const plate = add('extrude', 'Vented panel outline', 0, 0, p.thickness / 2, { height: p.thickness })
    const outline = createProfileRecipe({ kind: 'roundedRectangle', width: p.width, height: p.depth, cornerRadius: p.cornerRadius })
    plate.profile = outline.points; plate.profileSettings = outline.settings
    for (let row = 0; row < p.rows; row++) for (let col = 0; col < p.columns; col++) {
      const x = (col - (p.columns - 1) / 2) * (p.openingWidth + p.gap), y = (row - (p.rows - 1) / 2) * (length + p.gap)
      const name = `Vent ${row + 1}.${col + 1}`
      if (p.pattern === 'round') round(name, x, y, p.thickness / 2, p.openingWidth / 2, p.thickness + 0.2, true)
      else {
        const node = add('extrude', name, x, y, p.thickness / 2, { height: p.thickness + 0.2 }, true)
        const slot = createProfileRecipe({ kind: 'capsule', width: p.openingWidth, height: length })
        node.profile = slot.points; node.profileSettings = slot.settings
      }
    }
    const openingArea = p.pattern === 'round' ? Math.PI * (p.openingWidth / 2) ** 2 : p.openingWidth * (length - p.openingWidth) + Math.PI * (p.openingWidth / 2) ** 2
    const plateArea = p.width * p.depth - (4 - Math.PI) * p.cornerRadius ** 2
    return { title: 'Vented panel', nodes, facts: [`${p.rows * p.columns} openings · ${p.rows} rows × ${p.columns} columns`, `${p.gap} mm material between openings; at least ${p.border} mm border`, `${mm(openingArea * p.rows * p.columns / plateArea * 100)}% nominal open area`], warnings: ['Open area describes geometry, not cooling performance. Check the vent orientation and support needs in your slicer.'] }
  }
  if (options.kind === 'bracket') {
    const p = options
    for (const [label, value] of [['Width', p.width], ['Depth', p.depth], ['Height', p.height]] as const) bounded(value, label, 20, 200)
    bounded(p.wall, 'Wall thickness', 1, Math.min(p.width, p.depth, p.height) / 4)
    bounded(p.ribThickness, 'Rib thickness', 1, Math.min(10, p.width / 8)); count(p.ribCount, 'Ribs', 1, 2)
    bounded(p.ribReach, 'Rib reach', 5, p.depth - p.wall); bounded(p.ribHeight, 'Rib height', 5, p.height - p.wall)
    bounded(p.holeDiameter, 'Hole diameter', 1, 20)
    const r = p.holeDiameter / 2
    if (p.width / 4 - p.ribThickness - r < 1 || p.depth / 4 - r < 1 || p.height * 0.3 - r < 1 || p.height * 0.7 - r < p.wall + 1) throw new Error('Mounting holes need at least 1 mm of edge and rib margin. Enlarge the bracket or reduce hole/rib size.')
    box('Bracket foot', 0, 0, p.wall / 2, p.width, p.depth, p.wall)
    box('Bracket upright', 0, p.depth / 2 - p.wall / 2, p.height / 2, p.width, p.wall, p.height)
    const xs = p.ribCount === 1 ? [0] : [-p.width / 2 + p.ribThickness / 2, p.width / 2 - p.ribThickness / 2]
    for (const [i, x] of xs.entries()) {
      // A small overlap joins the gusset to both walls without coplanar-only contact.
      const rib = add('wedge', `Reinforcement rib ${i + 1}`, x, p.depth / 2 - p.wall - p.ribReach / 2 + 0.1, p.wall + p.ribHeight / 2 - 0.1, { width: p.ribReach, depth: p.ribThickness, height: p.ribHeight })
      rib.transform.rotation.z = -90
    }
    for (const [i, x] of [-p.width / 4, p.width / 4].entries()) {
      round(`Foot mounting hole ${i + 1}`, x, -p.depth / 4, p.wall / 2, r, p.wall + 0.2, true)
      const hole = round(`Upright mounting hole ${i + 1}`, x, p.depth / 2 - p.wall / 2, p.height * 0.7, r, p.wall + 0.2, true)
      hole.transform.rotation.x = 90
    }
    return { title: 'Ribbed bracket', nodes, facts: [`${p.ribCount} triangular ${p.ribThickness} mm ribs`, `Four ${p.holeDiameter} mm mounting holes · ${p.width / 2} mm center spacing`, `${p.wall} mm foot and upright thickness`], warnings: ['Ribs add material between the foot and upright; load capacity is unverified. Consider layer direction and test the part for its intended use.'] }
  }
  if (options.kind !== 'boss') throw new Error('Choose a supported print-friendly part.')
  const p = options
  bounded(p.outerDiameter, 'Boss diameter', 5, 80); bounded(p.height, 'Boss height', 4, 100)
  bounded(p.boreDiameter, 'Insert bore diameter', 1, p.outerDiameter - 2); bounded(p.boreDepth, 'Insert bore depth', 1, 99)
  if (p.height - p.boreDepth < 1) throw new Error('Leave at least 1 mm of floor below the insert bore.')
  bounded(p.leadIn, 'Lead-in chamfer', 0, Math.min((p.outerDiameter - p.boreDiameter) / 2 - 1, p.boreDepth / 2))
  bounded(p.baseDiameter, 'Base diameter', p.outerDiameter, 120); bounded(p.baseThickness, 'Base thickness', 1, p.height / 2)
  round('Boss base', 0, 0, p.baseThickness / 2, p.baseDiameter / 2, p.baseThickness)
  round('Insert mounting boss', 0, 0, p.height / 2, p.outerDiameter / 2, p.height)
  round('Insert pilot bore', 0, 0, p.height - p.boreDepth / 2 + 0.05, p.boreDiameter / 2, p.boreDepth + 0.1, true)
  if (p.leadIn > 0) add('cone', 'Insert lead-in chamfer', 0, 0, p.height - p.leadIn / 2, { radius: p.boreDiameter / 2, radiusTop: p.boreDiameter / 2 + p.leadIn, height: p.leadIn }, true)
  return { title: 'Insert mounting boss', nodes, facts: [`${p.boreDiameter} mm bore × ${p.boreDepth} mm deep`, `${mm((p.outerDiameter - p.boreDiameter) / 2)} mm radial wall; ${mm(p.height - p.boreDepth)} mm floor`, `${p.leadIn} mm 45° entry chamfer`], warnings: ['Illustrative dimensions, not a standard insert size. Use the insert manufacturer’s recommended bore and print a fit test. Heat-set inserts need a compatible thermoplastic; retention strength is unverified.'] }
}

/** Place a new independent group beside all existing source bounds, leaving old geometry alone. */
export function placePrintPart(document: ModelDocument, part: PrintPart): PrintPart {
  if (document.sculptStrokes.length) throw new Error('Bake volume sculpting before adding a print-friendly part, so existing strokes cannot change it.')
  const occupied = new Box3(), bounds = new Box3()
  for (const node of document.nodes) occupied.union(nodeWorldBounds(node))
  for (const node of part.nodes.filter(n => n.boolean === 'add')) bounds.union(nodeWorldBounds(node))
  const x = occupied.isEmpty() ? 0 : occupied.max.x + 8 - bounds.min.x
  const y = occupied.isEmpty() ? 0 : (occupied.min.y + occupied.max.y) / 2
  const nodes = part.nodes.map(node => ({ ...node, transform: { ...node.transform, position: { ...node.transform.position, x: node.transform.position.x + x, y: node.transform.position.y + y } } }))
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.max(Math.abs(x), Math.abs(y)) > 10_000) throw new Error('The current model is too far from the plate to place another part beside it.')
  bounds.translate(new Vector3(x, y, 0))
  const p = document.printer.buildVolume, warnings = [...part.warnings]
  if (bounds.min.x < -p.x / 2 || bounds.max.x > p.x / 2 || bounds.min.y < -p.y / 2 || bounds.max.y > p.y / 2 || bounds.max.z > p.z) warnings.push('The proposed placement extends outside the nominal build volume. Move or resize the part and review Print before exporting.')
  if (document.printer.usableBedExclusions?.some(e => bounds.min.x < e.x + e.width && bounds.max.x > e.x && bounds.min.y < e.y + e.depth && bounds.max.y > e.y)) warnings.push('The proposed placement overlaps a configured bed exclusion. Arrange the part in Print before exporting.')
  return { ...part, nodes, warnings }
}
