import type { ModelNode, Workplane } from '@formforge/model'
import { placeNodeOnWorkplane } from './workplanes'

type Point = { x: number; y: number }

/** A placement draft: no document writes until the pointer is released. */
export function shapePlacement(node: ModelNode, start: Point, end: Point | null, workplane?: Workplane, snap: number | null = null): ModelNode {
  const round = (n: number) => snap && snap > 0 ? Math.round(n / snap) * snap : n
  const origin = { x: round(start.x), y: round(start.y) }
  const parameters = { ...node.parameters }
  let point = origin
  if (end) {
    const dx = round(end.x) - origin.x, dy = round(end.y) - origin.y
    if (node.kind === 'extrude' || node.kind === 'revolve') point = { x: round(end.x), y: round(end.y) }
    else if (['box', 'roundedBox', 'wedge', 'loft'].includes(node.kind)) {
      parameters.width = Math.max(1, Math.abs(dx))
      parameters.depth = Math.max(1, Math.abs(dy))
      parameters.topWidth *= parameters.width / node.parameters.width
      parameters.topDepth *= parameters.depth / node.parameters.depth
      parameters.fillet = Math.min(parameters.fillet, parameters.width / 2, parameters.depth / 2, parameters.height / 2)
      point = { x: origin.x + dx / 2, y: origin.y + dy / 2 }
    } else {
      parameters.radius = Math.max(1, round(Math.hypot(dx, dy)))
      // Preserve the profile of rings, tubes and cones at small as well as large sizes.
      parameters.radiusTop = Math.min(parameters.radiusTop * parameters.radius / node.parameters.radius, parameters.radius * 0.8)
    }
  }
  return placeNodeOnWorkplane({ ...node, parameters }, workplane, point)
}
