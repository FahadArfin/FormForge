import { createNode, createProfileRecipe, vec3, type ModelNode } from '@formforge/model'

type HolePlacement = { depth: number; clearance: number; x: number; y: number; bottomZ: number }
export type HoleRecipeOptions = HolePlacement & (
  | { kind: 'plain'; diameter: number }
  | { kind: 'counterbore'; diameter: number; headDiameter: number; headDepth: number }
  | { kind: 'countersink'; diameter: number; headDiameter: number; includedAngle: number }
  | { kind: 'slot'; diameter: number; length: number }
  | { kind: 'hex-pocket'; acrossFlats: number }
)

export type FitCouponOptions = {
  diameter: number
  clearanceStart: number
  clearanceStep: number
  sampleCount: number
  plateThickness: number
  pinHeight: number
  /** Lower-left corner of the hole strip, in millimeters. */
  x: number
  y: number
  bottomZ: number
}

export type FitCoupon = { nodes: ModelNode[]; samples: { label: string; clearance: number; holeDiameter: number }[] }

/** A hole strip and a detached pin gauge. Labels are node names, not printed text. */
export function createFitCoupon(options: FitCouponOptions): FitCoupon {
  const diameter = bounded(options.diameter, 'Nominal pin diameter (mm)', 1, 50)
  const start = bounded(options.clearanceStart, 'First diametral clearance (mm)', 0, 2)
  const step = bounded(options.clearanceStep, 'Clearance step (mm)', 0.05, 1)
  const count = bounded(options.sampleCount, 'Sample count', 3, 7)
  if (!Number.isInteger(count)) throw new Error('Sample count must be a whole number from 3 to 7.')
  const thickness = bounded(options.plateThickness, 'Strip thickness (mm)', 2, 20)
  const pinHeight = bounded(options.pinHeight, 'Pin height (mm)', 3, 40)
  const x = bounded(options.x, 'Coupon X (mm)', -10_000, 10_000)
  const y = bounded(options.y, 'Coupon Y (mm)', -10_000, 10_000)
  const bottomZ = bounded(options.bottomZ, 'Coupon bottom Z (mm)', -10_000, 10_000)
  const last = bounded(start + step * (count - 1), 'Last diametral clearance (mm)', 0, 3)
  const maxDiameter = diameter + last
  const pitch = maxDiameter + 4
  const width = count * pitch + 2
  const stripDepth = Math.max(14, maxDiameter + 6)
  const handleSize = Math.max(12, diameter + 6)
  bounded(x + width, 'Coupon right edge (mm)', -10_000, 10_000)
  bounded(y + stripDepth + 8 + handleSize, 'Coupon back edge (mm)', -10_000, 10_000)
  bounded(bottomZ + thickness + pinHeight, 'Coupon top (mm)', -10_000, 10_000)
  const plate = createNode('box', 'add', vec3(x + width / 2, y + stripDepth / 2, bottomZ + thickness / 2))
  plate.name = 'Fit-test hole strip'
  plate.parameters = { ...plate.parameters, width, depth: stripDepth, height: thickness }
  const samples: FitCoupon['samples'] = []
  const holes = Array.from({ length: count }, (_, index) => {
    const clearance = Number((start + index * step).toFixed(6))
    const holeDiameter = Number((diameter + clearance).toFixed(6))
    const label = `${index + 1}: +${clearance} mm clearance`
    samples.push({ label, clearance, holeDiameter })
    const [hole] = createHoleRecipe({ kind: 'plain', diameter: holeDiameter, clearance: 0, depth: thickness + 0.2, x: x + 1 + pitch * (index + 0.5), y: y + stripDepth / 2, bottomZ: bottomZ - 0.1 })
    hole!.name = `${label} (${holeDiameter} mm hole)`
    return hole!
  })
  const handleX = x + handleSize / 2
  const handleY = y + stripDepth + 8 + handleSize / 2
  const handle = createNode('box', 'add', vec3(handleX, handleY, bottomZ + thickness / 2))
  handle.name = 'Gauge handle'
  handle.parameters = { ...handle.parameters, width: handleSize, depth: handleSize, height: thickness }
  const pin = createNode('cylinder', 'add', vec3(handleX, handleY, bottomZ + thickness + pinHeight / 2))
  pin.name = `Gauge pin (${diameter} mm nominal)`
  pin.parameters = { ...pin.parameters, radius: diameter / 2, height: pinHeight, segments: 96 }
  // The gauge is spatially separate and added after the hole cutters; the cutters
  // cannot remove material from it under the document's sequential Boolean rules.
  return { nodes: [plate, ...holes, handle, pin], samples }
}

function bounded(value: number, label: string, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`)
  }
  return value
}

/** All lengths are millimeters. Clearance enlarges diameters/flat spacing, not each side. */
export function createHoleRecipe(options: HoleRecipeOptions): ModelNode[] {
  const depth = bounded(options.depth, 'Cut depth (mm)', 0.1, 1000)
  const clearance = bounded(options.clearance, 'Clearance (mm)', 0, 10)
  const x = bounded(options.x, 'Center X (mm)', -10_000, 10_000)
  const y = bounded(options.y, 'Center Y (mm)', -10_000, 10_000)
  const bottomZ = bounded(options.bottomZ, 'Bottom Z (mm)', -10_000, 10_000)
  bounded(bottomZ + depth, 'Top Z (mm)', -10_000, 10_000)
  const enlarged = (value: number, label: string) => {
    bounded(value, `${label} (mm)`, 0.1, 1000)
    return bounded(value + clearance, `${label} with clearance (mm)`, 0.1, 1000)
  }
  const cutter = (kind: ModelNode['kind'], name: string, height = depth, bottom = bottomZ) => {
    const node = createNode(kind, 'cut', vec3(x, y, bottom + height / 2))
    node.name = name
    node.parameters.height = height
    node.parameters.segments = 96
    return node
  }
  if (options.kind === 'hex-pocket') {
    const acrossFlats = enlarged(options.acrossFlats, 'Across flats')
    const radius = acrossFlats / Math.sqrt(3)
    const node = cutter('extrude', 'Hex pocket cutout')
    node.profile = Array.from({ length: 6 }, (_, index) => ({ x: radius * Math.cos(index * Math.PI / 3), y: radius * Math.sin(index * Math.PI / 3) }))
    return [node]
  }
  const diameter = enlarged(options.diameter, options.kind === 'slot' ? 'Slot width' : 'Hole diameter')
  if (options.kind === 'slot') {
    if (options.length < options.diameter) throw new Error('Slot total length must be at least its width.')
    const length = enlarged(options.length, 'Slot total length')
    const profile = createProfileRecipe({ kind: 'capsule', width: length, height: diameter })
    const node = cutter('extrude', 'Slot cutout')
    node.profile = profile.points
    node.profileSettings = profile.settings
    return [node]
  }
  const bore = cutter('cylinder', 'Hole cutout')
  bore.parameters.radius = diameter / 2
  if (options.kind === 'plain') return [bore]
  if (options.kind !== 'counterbore' && options.kind !== 'countersink') throw new Error('Choose a supported hole style.')
  const headDiameter = enlarged(options.headDiameter, 'Recess diameter')
  if (headDiameter <= diameter) throw new Error('Recess diameter must be larger than the hole diameter.')
  // Keep these as independent cut nodes: explicit Boolean groups are emitted as solids
  // by the worker. Sequential subtraction removes exactly the union of these cutters.
  let headDepth: number
  if (options.kind === 'counterbore') headDepth = bounded(options.headDepth, 'Recess depth (mm)', 0.1, depth)
  else {
    const angle = bounded(options.includedAngle, 'Included angle (degrees)', 10, 170)
    headDepth = (headDiameter - diameter) / (2 * Math.tan(angle * Math.PI / 360))
    if (headDepth > depth + 1e-9) throw new Error('Countersink is deeper than the total cut depth. Reduce its diameter or increase the cut depth.')
    if (headDepth < 0.001) throw new Error('Countersink is too shallow. Increase the recess diameter.')
  }
  const head = cutter(options.kind === 'counterbore' ? 'cylinder' : 'cone', `${options.kind === 'counterbore' ? 'Counterbore' : 'Countersink'} recess cutout`, headDepth, bottomZ + depth - headDepth)
  head.parameters.radius = options.kind === 'counterbore' ? headDiameter / 2 : diameter / 2
  head.parameters.radiusTop = headDiameter / 2
  return [bore, head]
}
