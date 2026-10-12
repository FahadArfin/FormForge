import type { MeshPayload } from '@formforge/model'
import type { SectionSettings } from './sectionView'

export type Point2 = readonly [number, number]
type Segment = readonly [Point2, Point2]
export type SectionDrawing = {
  segments: readonly Segment[]
  axis: SectionSettings['axis']
  offset: number
  axes: readonly [string, string]
  bounds: { min: Point2; max: Point2; width: number; height: number } | null
}
// Fixed millimeter tolerance keeps coordinates deterministic across adjacent triangles.
const EPSILON = 0.000001
const MAX_TRIANGLES = 100_000
const MAX_SEGMENTS = 50_000
const MAX_COORDINATE = 1_000_000
const round = (value: number) => Number(value.toFixed(6)) || 0
const pointKey = (p: Point2) => `${p[0]},${p[1]}`
const comparePoint = (a: Point2, b: Point2) => a[0] - b[0] || a[1] - b[1]
function edge(a: Point2, b: Point2): { key: string; segment: Segment } | null {
  if (pointKey(a) === pointKey(b)) return null
  const segment: Segment = comparePoint(a, b) < 0 ? [a, b] : [b, a]
  return { key: `${pointKey(segment[0])}:${pointKey(segment[1])}`, segment }
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Section drawing cancelled.', 'AbortError')
}

/** Tessellated plane intersections only; segments are not certified closed contours. */
export function createSectionDrawing(mesh: MeshPayload, plane: Pick<SectionSettings, 'axis' | 'offset'>, signal?: AbortSignal): SectionDrawing {
  checkAbort(signal)
  if (!['x', 'y', 'z'].includes(plane.axis) || !Number.isFinite(plane.offset) || Math.abs(plane.offset) > MAX_COORDINATE) throw new Error('Section plane must use a valid axis and finite position within 1,000,000 mm.')
  const { positions, indices } = mesh
  if (positions.length % 3 || indices.length % 3 || mesh.triangleCount !== indices.length / 3) throw new Error('Invalid mesh coordinate or triangle count.')
  if (indices.length / 3 > MAX_TRIANGLES || positions.length / 3 > MAX_TRIANGLES * 3) throw new Error('Section drawings are limited to 100,000 triangles and 300,000 vertices. Simplify the model.')
  for (const value of positions) if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) throw new Error('Mesh coordinates must be finite and within 1,000,000 mm.')
  for (const index of indices) if (!Number.isInteger(index) || index < 0 || index >= positions.length / 3) throw new Error('Invalid mesh vertex index.')
  const normal = { x: 0, y: 1, z: 2 }[plane.axis]
  const [u, v] = plane.axis === 'x' ? [1, 2] : plane.axis === 'y' ? [0, 2] : [0, 1]
  const axes: readonly [string, string] = plane.axis === 'x' ? ['Y', 'Z'] : plane.axis === 'y' ? ['X', 'Z'] : ['X', 'Y']
  const lines = new Map<string, Segment>()
  const coplanar = new Map<string, { count: number; segment: Segment }>()
  const faces = new Set<string>()
  const project = (index: number): Point2 => [round(positions[index * 3 + u!]!), round(positions[index * 3 + v!]!)]
  for (let i = 0; i < indices.length; i += 3) {
    if (i % 3000 === 0) checkAbort(signal)
    const ids = [indices[i]!, indices[i + 1]!, indices[i + 2]!]
    const points = ids.map(project)
    const distances = ids.map(id => { const d = positions[id * 3 + normal]! - plane.offset; return Math.abs(d) <= EPSILON ? 0 : d })
    if (distances.every(d => d === 0)) {
      // Ignore collapsed triangles, duplicate faces and interior triangulation edges.
      const [a, b, c] = points as [Point2, Point2, Point2]
      if (Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])) <= EPSILON * EPSILON) continue
      const face = points.map(pointKey).sort().join(':')
      if (faces.has(face)) continue
      faces.add(face)
      for (let j = 0; j < 3; j++) {
        const item = edge(points[j]!, points[(j+1)%3]!)
        if (item) coplanar.set(item.key, { count: (coplanar.get(item.key)?.count ?? 0) + 1, segment: item.segment })
      }
      continue
    }
    const hits = new Map<string, Point2>()
    for (let j = 0; j < 3; j++) {
      const next = (j+1)%3, a = distances[j]!, b = distances[next]!
      if (a === 0) hits.set(pointKey(points[j]!), points[j]!)
      if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
        const t = a / (a-b), ia = ids[j]! * 3, ib = ids[next]! * 3
        const point: Point2 = [round(positions[ia+u!]! + t*(positions[ib+u!]!-positions[ia+u!]!)), round(positions[ia+v!]! + t*(positions[ib+v!]!-positions[ia+v!]!))]
        hits.set(pointKey(point), point)
      }
    }
    if (hits.size === 2) {
      const values = [...hits.values()], item = edge(values[0]!, values[1]!)
      if (item) lines.set(item.key, item.segment)
    }
    if (lines.size > MAX_SEGMENTS) throw new Error('Section drawing exceeds the 50,000 segment limit. Simplify the model.')
  }
  for (const [key, item] of coplanar) if (item.count === 1) lines.set(key, item.segment)
  if (lines.size > MAX_SEGMENTS) throw new Error('Section drawing exceeds the 50,000 segment limit. Simplify the model.')
  const segments = [...lines.values()].sort((a,b) => comparePoint(a[0],b[0]) || comparePoint(a[1],b[1]))
  let bounds: SectionDrawing['bounds'] = null
  if (segments.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const segment of segments) for (const [x, y] of segment) { minX = Math.min(minX,x); minY = Math.min(minY,y); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y) }
    bounds = { min: [minX,minY], max: [maxX,maxY], width: round(maxX-minX), height: round(maxY-minY) }
  }
  return { segments, axis: plane.axis, offset: plane.offset, axes, bounds }
}

function requireLinework(drawing: SectionDrawing) {
  if (!drawing.bounds || !drawing.segments.length) throw new Error('There is no section linework to download.')
  return drawing.bounds
}
export function sectionDrawingSvg(drawing: SectionDrawing, name: string): string {
  const bounds = requireLinework(drawing)
  const escape = (value: string) => value.slice(0, 512).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu, '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[char]!))
  const width = round(bounds.width + 1), height = round(bounds.height + 1)
  const path = drawing.segments.map(([a,b]) => `M ${a[0]} ${round(-a[1])} L ${b[0]} ${round(-b[1])}`).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(bounds.min[0]-.5)} ${round(-bounds.max[1]-.5)} ${width} ${height}"><title>${escape(name)} — ${drawing.axis.toUpperCase()} = ${round(drawing.offset)} mm</title><desc>Tessellated section linework in millimeters. Horizontal ${drawing.axes[0]}, vertical ${drawing.axes[1]}. Closed contours and toolpaths are not certified.</desc><path d="${path}" fill="none" stroke="black" stroke-width="0.15"/></svg>`
}
export function sectionDrawingDxf(drawing: SectionDrawing): string {
  requireLinework(drawing)
  const entities = drawing.segments.map(([a,b]) => `0\nLINE\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n${a[0]}\n20\n${a[1]}\n30\n0\n11\n${b[0]}\n21\n${b[1]}\n31\n0\n`).join('')
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`
}
