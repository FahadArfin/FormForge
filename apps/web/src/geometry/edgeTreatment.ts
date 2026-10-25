import type { Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d'
import type { BoxEdge, EdgeTreatment, ModelNode } from '@formforge/model'

export const boxEdges: BoxEdge[] = (['x', 'y', 'z'] as const).flatMap(axis => ([-1, 1] as const).flatMap(sideU => ([-1, 1] as const).map(sideV => ({ axis, sideU, sideV }))))
export const edgeKey = (edge: BoxEdge) => `${edge.axis},${edge.sideU},${edge.sideV}`
export const selectedBoxEdges = (treatment: EdgeTreatment): BoxEdge[] => treatment.edges ?? [{ axis: treatment.axis, sideU: treatment.sideU, sideV: treatment.sideV }]

/** Bounded box features, not arbitrary topology-aware fillets. */
export function validateEdgeTreatment(node: ModelNode) {
  const treatment = node.edgeTreatment
  if (!treatment) return
  if (node.kind !== 'box' || Object.values(node.transform.scale).some(v => Math.abs(v - 1) > 1e-6) || node.deformation?.kind && node.deformation.kind !== 'none' || Object.values(node.surface ?? {}).some(v => v > 0)) throw new Error('Edge finishing needs an unscaled box without deformation or surface modifiers.')
  const sizes = { x: node.parameters.width, y: node.parameters.depth, z: node.parameters.height }
  const edges = selectedBoxEdges(treatment)
  if (treatment.version !== 1 || !['chamfer', 'fillet'].includes(treatment.mode) || !edges.length || edges.length > 12 || edges.some(edge => !['x', 'y', 'z'].includes(edge.axis) || ![1, -1].includes(edge.sideU) || ![1, -1].includes(edge.sideV)) || new Set(edges.map(edgeKey)).size !== edges.length) throw new Error('Choose 1–12 distinct box edges.')
  if (!Number.isFinite(treatment.amount) || treatment.amount < .01 || treatment.amount > 1000 || edges.some(edge => treatment.amount >= Math.min(...(['x', 'y', 'z'] as const).filter(axis => axis !== edge.axis).map(axis => sizes[axis])) / 2)) throw new Error('Edge radius or setback must be 0.01–1,000 mm and smaller than half either adjacent face.')
  if (treatment.mode === 'fillet' && edges.length !== 12 && new Set(edges.map(edge => edge.axis)).size !== 1) throw new Error('Fillets support parallel edges or All 12 edges with blended corners. Choose one direction, use All edges, or use chamfers for a mixed selection.')
}

/** Consumes shape, including on failure, and returns the sole retained result. */
export function treatBoxEdge(api: ManifoldToplevel, shape: Manifold, node: ModelNode): Manifold {
  const treatment = node.edgeTreatment
  if (!treatment) return shape
  const owned: Manifold[] = [shape], keep = (solid: Manifold) => { owned.push(solid); return solid }
  let result: Manifold | undefined
  try {
    validateEdgeTreatment(node)
    const edges = selectedBoxEdges(treatment), size = [node.parameters.width, node.parameters.depth, node.parameters.height], r = treatment.amount
    if (treatment.mode === 'fillet' && edges.length === 12) {
      // Minkowski sum gives tangent cylinders and spherical corner blends, preserving box extents.
      const core = keep(api.Manifold.cube(size.map(value => value - 2 * r) as Vec3, true))
      const sphere = keep(api.Manifold.sphere(r, 96))
      // Minkowski triangulation can retain nearly collinear slivers that collapse
      // when the renderer/export converts vertices to Float32. Simplify at that
      // precision before conversion, preserving closed topology and dimensions.
      return result = keep(core.minkowskiSum(sphere)).simplify(Math.max(...size) * 1e-7)
    }
    let current = shape
    for (const edge of edges) {
      const axis = ['x', 'y', 'z'].indexOf(edge.axis), cross = [0, 1, 2].filter(value => value !== axis), a = cross[0]!, b = cross[1]!
      if (treatment.mode === 'chamfer') {
        const normal: Vec3 = [0, 0, 0]; normal[a] = -edge.sideU * Math.SQRT1_2; normal[b] = -edge.sideV * Math.SQRT1_2
        current = keep(current.trimByPlane(normal, -(size[a]! / 2 + size[b]! / 2 - r) * Math.SQRT1_2))
      } else {
        const dimensions: Vec3 = [0, 0, 0], center: Vec3 = [0, 0, 0], cylinderCenter: Vec3 = [0, 0, 0]
        dimensions[axis] = size[axis]! + .2; dimensions[a] = r; dimensions[b] = r
        center[a] = edge.sideU * (size[a]! / 2 - r / 2); center[b] = edge.sideV * (size[b]! / 2 - r / 2)
        cylinderCenter[a] = edge.sideU * (size[a]! / 2 - r); cylinderCenter[b] = edge.sideV * (size[b]! / 2 - r)
        const prism = keep(keep(api.Manifold.cube(dimensions, true)).translate(center))
        const baseCylinder = keep(api.Manifold.cylinder(size[axis]! + .4, r, r, 96, true)), rotated = axis === 0 ? keep(baseCylinder.rotate([0, 90, 0])) : axis === 1 ? keep(baseCylinder.rotate([90, 0, 0])) : baseCylinder, cylinder = keep(rotated.translate(cylinderCenter))
        current = keep(current.subtract(keep(prism.subtract(cylinder))))
      }
    }
    return result = current
  } finally { owned.forEach(solid => { if (solid !== result) solid.delete() }) }
}
