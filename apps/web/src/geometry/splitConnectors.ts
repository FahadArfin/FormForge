import type { CrossSection, Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d'

type CommonConnector = { count: number; spacing: number; centerU: number; clearance: number; wall: number }
export type DowelConnector = CommonConnector & { kind: 'dowel'; centerV: number; diameter: number; depth: number }
export type DovetailConnector = CommonConnector & { kind: 'dovetail'; neckWidth: number; headWidth: number; depth: number }
export type SplitConnector = DowelConnector | DovetailConnector
export const connectorDefaults: { dowel: DowelConnector; dovetail: DovetailConnector } = {
  dowel: { kind: 'dowel', count: 2, spacing: 12, centerU: 0, centerV: 0, clearance: .2, wall: 1.2, diameter: 4, depth: 6 },
  dovetail: { kind: 'dovetail', count: 1, spacing: 16, centerU: 0, clearance: .2, wall: 1.2, neckWidth: 6, headWidth: 10, depth: 4 },
}

function bounded(value: number, name: string, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max} mm.`)
}
export function validateSplitConnector(options: SplitConnector) {
  if (!options || !['dowel', 'dovetail'].includes(options.kind)) throw new Error('Choose a supported connector: dowel pins or sliding dovetail.')
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 8) throw new Error('Choose 1–8 connectors.')
  bounded(options.clearance, 'Clearance per side', .05, 1)
  bounded(options.wall, 'Surrounding wall', .8, 10)
  bounded(options.centerU, 'Connector offset', -10000, 10000)
  bounded(options.spacing, 'Connector spacing', 1, 1000)
  bounded(options.depth, options.kind === 'dowel' ? 'Socket depth' : 'Dovetail depth', 2, 100)
  let width: number
  if (options.kind === 'dowel') {
    bounded(options.centerV, 'Connector offset', -10000, 10000)
    bounded(options.diameter, 'Pin diameter', 2, 50)
    if (options.depth <= options.clearance + 1) throw new Error('Socket depth must leave enough room for the printable pin.')
    width = options.diameter
  } else {
    bounded(options.neckWidth, 'Dovetail neck width', 2, 50)
    bounded(options.headWidth, 'Dovetail head width', 3, 80)
    if (options.headWidth < options.neckWidth + 1) throw new Error('Dovetail head width must be at least 1 mm wider than its neck.')
    width = options.headWidth
  }
  if (options.count > 1 && options.spacing < width + 2 * options.clearance + 2 * options.wall) throw new Error('Increase connector spacing to leave the requested wall between neighboring connectors.')
}

export function splitPlaneAxes(axis: 'x' | 'y' | 'z') {
  const n = ['x', 'y', 'z'].indexOf(axis)
  return { n, u: (n + 1) % 3, v: (n + 2) % 3 }
}

/** Local X/Y/Z are the cut face's U/V axes and outward normal. All bases are right-handed. */
function localToWorld(n: number, u: number, v: number, offset: number): Mat4 {
  const matrix = new Array<number>(16).fill(0)
  matrix[u] = 1; matrix[v + 4] = 1; matrix[n + 8] = 1; matrix[n + 12] = offset; matrix[15] = 1
  return matrix as Mat4
}

export interface ConnectorSolids { positive: Manifold; negative: Manifold; extras: { name: string; solid: Manifold }[]; notes: string[] }

/**
 * Connector envelopes are tested against the actual evaluated solid, not its bounding box.
 * On success ownership of all returned solids passes to the caller. Input solids remain owned by the caller.
 */
export function connectSplitHalves(api: ManifoldToplevel, source: Manifold, halves: [Manifold, Manifold], plane: { axis: 'x' | 'y' | 'z'; offset: number }, options: SplitConnector): ConnectorSolids {
  validateSplitConnector(options)
  const resources: Manifold[] = [], sections: CrossSection[] = []
  const own = <T extends Manifold>(solid: T) => { resources.push(solid); return solid }
  const { n, u, v } = splitPlaneAxes(plane.axis), matrix = localToWorld(n, u, v, plane.offset)
  const bounds = source.boundingBox(), centerU = (bounds.min[u]! + bounds.max[u]!) / 2 + options.centerU
  const centerV = (bounds.min[v]! + bounds.max[v]!) / 2
  const world = (solid: Manifold) => own(solid.transform(matrix))
  const requireContained = (envelope: Manifold) => {
    const outside = own(envelope.subtract(source))
    if (outside.status() !== 'NoError' || outside.volume() > Math.max(1e-5, envelope.volume() * 1e-7)) {
      throw new Error('Not enough continuous material around this connector. Move it, reduce its size/depth, or choose a thicker cut face; the surrounding wall must fit inside the actual solid.')
    }
  }
  const requireConnected = (solid: Manifold) => {
    if (solid.status() !== 'NoError' || solid.isEmpty() || !(solid.volume() > 0)) throw new Error('This connector leaves an invalid or empty split part. Change its position or dimensions.')
    const components = solid.decompose()
    const count = components.length; components.forEach(part => part.delete())
    if (count !== 1) throw new Error('Each connector half must remain one connected solid. This split contains detached islands; choose a continuous solid and cut face.')
  }
  try {
    let positive = halves[0], negative = halves[1]
    const extras: ConnectorSolids['extras'] = []
    for (let index = 0; index < options.count; index += 1) {
      const atU = centerU + (index - (options.count - 1) / 2) * options.spacing
      if (options.kind === 'dowel') {
        const atV = centerV + options.centerV, radius = options.diameter / 2 + options.clearance
        const envelope = world(own(own(api.Manifold.cylinder(2 * (options.depth + options.wall), radius + options.wall, radius + options.wall, 96, true)).translate([atU, atV, 0])))
        requireContained(envelope)
        const cutter = world(own(own(api.Manifold.cylinder(2 * options.depth, radius, radius, 96, true)).translate([atU, atV, 0])))
        positive = own(positive.subtract(cutter)); negative = own(negative.subtract(cutter))
        const pin = own(own(api.Manifold.cylinder(2 * (options.depth - options.clearance), options.diameter / 2, options.diameter / 2, 96)).translate([bounds.max[0] + 8 + options.diameter / 2, bounds.min[1] + options.diameter / 2 + index * (options.diameter + 4), 0]))
        extras.push({ name: `Dowel pin ${index + 1} · ${options.diameter} mm × ${Number((2 * (options.depth - options.clearance)).toFixed(3))} mm`, solid: pin })
      } else {
        // Full-length open-ended channel: a rail can slide in from either end of the V axis.
        // Requiring a rectangular material envelope deliberately rejects concave/hollow or obstructed paths.
        const length = bounds.max[v]! - bounds.min[v]!, embed = Math.max(.5, options.wall / 2)
        if (length < 4 || length > 1000) throw new Error('Sliding dovetails need a continuous cut face between 4 and 1000 mm long.')
        const section = new api.CrossSection([[[-options.neckWidth / 2, -embed], [options.neckWidth / 2, -embed], [options.neckWidth / 2, 0], [options.headWidth / 2, options.depth], [-options.headWidth / 2, options.depth], [-options.neckWidth / 2, 0]]])
        sections.push(section)
        const socketSection = section.offset(options.clearance, 'Miter', 4); sections.push(socketSection)
        const railLocal = own(own(section.extrude(length, 0, 0, [1, 1], true)).rotate([90, 0, 0]))
        const socketLocal = own(own(socketSection.extrude(length + 2, 0, 0, [1, 1], true)).rotate([90, 0, 0]))
        const socketBounds = socketLocal.boundingBox(), probeBottom = -embed - options.wall, probeTop = socketBounds.max[2] + options.wall
        const probeWidth = socketBounds.max[0] - socketBounds.min[0] + 2 * options.wall
        // Mitered offset corners can extend farther than headWidth + 2*clearance.
        // Compare the actual socket envelope so adjacent channels retain their walls.
        if (options.count > 1 && options.spacing < probeWidth) throw new Error(`Increase connector spacing to at least ${Math.ceil(probeWidth * 100) / 100} mm to preserve the surrounding walls around the dovetail channels.`)
        const probe = world(own(own(api.Manifold.cube([probeWidth, length - .002, probeTop - probeBottom], true)).translate([atU, centerV, (probeTop + probeBottom) / 2])))
        requireContained(probe)
        const rail = world(own(railLocal.translate([atU, centerV, 0]))), socket = world(own(socketLocal.translate([atU, centerV, 0])))
        negative = own(negative.add(rail)); positive = own(positive.subtract(socket))
      }
    }
    requireConnected(positive); requireConnected(negative)
    const overlap = own(positive.intersect(negative))
    if (overlap.volume() > 1e-5) throw new Error('The connector parts overlap. Change the connector settings and preview again.')
    const axisName = ['X', 'Y', 'Z'][v]
    const notes = options.kind === 'dowel'
      ? [`${options.count} loose pin${options.count === 1 ? '' : 's'} placed beside the source on the bed. Socket diameter is ${Number((options.diameter + 2 * options.clearance).toFixed(3))} mm; ${options.clearance} mm radial clearance and end clearance per side.`, 'Sockets are blind and checked against the actual solid with the requested surrounding wall.']
      : [`Sliding dovetail: slide the halves together along ${axisName}. The channel intentionally opens at both ${axisName} ends; allow assembly space outside the part.`, `${options.clearance} mm nominal clearance per mating surface. Continuous material checked around the full rail.`]
    notes.push('Geometric fit only. Print a small fit test for your printer and material; strength and physical fit are unverified.')
    const retained = new Set([positive, negative, ...extras.map(part => part.solid)])
    resources.filter(solid => !retained.has(solid)).forEach(solid => solid.delete()); sections.forEach(section => section.delete())
    return { positive, negative, extras, notes }
  } catch (error) {
    resources.forEach(solid => solid.delete()); sections.forEach(section => section.delete()); throw error
  }
}
