import type { ModelNode } from '@formforge/model'

export type PrimitiveMesh = { positions: number[]; indices: number[] }

export function createLoftMesh(p: ModelNode['parameters']): PrimitiveMesh {
  const radial = Math.max(8, Math.min(96, Math.round(p.segments)))
  const levels = Math.max(1, Math.min(24, Math.round(p.count)))
  const positions: number[] = []
  const indices: number[] = []
  for (let level = 0; level <= levels; level += 1) {
    const t = level / levels
    const rx = (p.width + (p.topWidth - p.width) * t) / 2
    const ry = (p.depth + (p.topDepth - p.depth) * t) / 2
    const rotation = p.twist * Math.PI / 180 * t
    for (let segment = 0; segment < radial; segment += 1) {
      const angle = segment * Math.PI * 2 / radial + rotation
      positions.push(Math.cos(angle) * rx, Math.sin(angle) * ry, p.height * (t - 0.5))
    }
  }
  for (let level = 0; level < levels; level += 1) for (let segment = 0; segment < radial; segment += 1) {
    const next = (segment + 1) % radial
    const a = level * radial + segment; const b = level * radial + next; const c = (level + 1) * radial + next; const d = (level + 1) * radial + segment
    indices.push(a, b, d, b, c, d)
  }
  const bottom = positions.length / 3; positions.push(0, 0, -p.height / 2)
  const top = positions.length / 3; positions.push(0, 0, p.height / 2)
  for (let segment = 0; segment < radial; segment += 1) {
    const next = (segment + 1) % radial
    indices.push(bottom, next, segment)
    indices.push(top, levels * radial + segment, levels * radial + next)
  }
  return { positions, indices }
}

export function createSpringMesh(p: ModelNode['parameters']): PrimitiveMesh {
  const rings = Math.max(24, Math.min(768, Math.round(p.count * 28)))
  const sides = Math.max(8, Math.min(24, Math.round(p.segments / 3)))
  const wire = Math.max(0.25, p.radiusTop)
  const positions: number[] = []
  const indices: number[] = []
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings; const angle = t * Math.PI * 2 * p.count
    const center: [number, number, number] = [Math.cos(angle) * p.radius, Math.sin(angle) * p.radius, p.height * (t - 0.5)]
    const n1: [number, number, number] = [Math.cos(angle), Math.sin(angle), 0]
    const tangent: [number, number, number] = [-Math.sin(angle) * p.radius * Math.PI * 2 * p.count, Math.cos(angle) * p.radius * Math.PI * 2 * p.count, p.height]
    const length = Math.hypot(...tangent)
    tangent[0] /= length; tangent[1] /= length; tangent[2] /= length
    const n2: [number, number, number] = [-tangent[2] * n1[1], tangent[2] * n1[0], tangent[0] * n1[1] - tangent[1] * n1[0]]
    const n2Length = Math.hypot(...n2) || 1
    for (let side = 0; side < sides; side += 1) {
      const v = side * Math.PI * 2 / sides; const cos = Math.cos(v) * wire; const sin = Math.sin(v) * wire / n2Length
      positions.push(center[0] + n1[0] * cos + n2[0] * sin, center[1] + n1[1] * cos + n2[1] * sin, center[2] + n2[2] * sin)
    }
  }
  for (let ring = 0; ring < rings; ring += 1) for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides; const a = ring * sides + side; const b = ring * sides + next; const c = (ring + 1) * sides + next; const d = (ring + 1) * sides + side
    indices.push(a, b, d, b, c, d)
  }
  const startCenter = positions.length / 3; positions.push(p.radius, 0, -p.height / 2)
  const endAngle = Math.PI * 2 * p.count; const endCenter = positions.length / 3; positions.push(Math.cos(endAngle) * p.radius, Math.sin(endAngle) * p.radius, p.height / 2)
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides
    indices.push(startCenter, next, side)
    indices.push(endCenter, rings * sides + side, rings * sides + next)
  }
  return { positions, indices }
}
