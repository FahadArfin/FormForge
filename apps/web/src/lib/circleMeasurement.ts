import { circlePointsSchema, type Vec3Value } from '@formforge/model'
import { Vector3 } from 'three'

export interface CircleMeasurement {
  center: Vec3Value
  normal: Vec3Value
  radius: number
  diameter: number
  circumference: number
}

/** Circumcircle of three sampled mesh points, not analytic surface recognition. */
export function circleMeasurement(points: Vec3Value[]): CircleMeasurement {
  const parsed = circlePointsSchema.safeParse(points)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Pick three valid circle points.')
  const [a, b, c] = parsed.data
  const scale = Math.max(
    Math.hypot(b!.x - a!.x, b!.y - a!.y, b!.z - a!.z),
    Math.hypot(c!.x - a!.x, c!.y - a!.y, c!.z - a!.z),
    Math.hypot(c!.x - b!.x, c!.y - b!.y, c!.z - b!.z),
  )
  // Subtract the local origin first; scaling avoids overflowing cross products
  // and keeps very small, well-conditioned circles measurable.
  const u = new Vector3((b!.x - a!.x) / scale, (b!.y - a!.y) / scale, (b!.z - a!.z) / scale)
  const v = new Vector3((c!.x - a!.x) / scale, (c!.y - a!.y) / scale, (c!.z - a!.z) / scale)
  const normal = new Vector3().crossVectors(u, v)
  const offset = new Vector3().crossVectors(v, normal).multiplyScalar(u.lengthSq())
    .add(new Vector3().crossVectors(normal, u).multiplyScalar(v.lengthSq()))
    .multiplyScalar(scale / (2 * normal.lengthSq()))
  const radius = Math.hypot(offset.x, offset.y, offset.z)
  const center = offset.clone().add(new Vector3(a!.x, a!.y, a!.z))
  normal.normalize()
  const diameter = radius * 2, circumference = radius * 2 * Math.PI
  if (![center.x, center.y, center.z, radius, diameter, circumference].every(Number.isFinite) || radius <= 0 || radius > 1e7) {
    throw new Error('The estimated circle is outside the supported measurement range.')
  }
  return { center: { x: center.x, y: center.y, z: center.z }, normal: { x: normal.x, y: normal.y, z: normal.z }, radius, diameter, circumference }
}

export function circleMeasurementGeometry(points: Vec3Value[]) {
  const circle = circleMeasurement(points), center = circle.center
  const u = new Vector3((points[0]!.x - center.x) / circle.radius, (points[0]!.y - center.y) / circle.radius, (points[0]!.z - center.z) / circle.radius).normalize()
  const v = new Vector3().crossVectors(new Vector3(circle.normal.x, circle.normal.y, circle.normal.z), u).normalize()
  const ring: Vec3Value[] = []
  for (let index = 0; index < 96; index++) {
    const angle = index * 2 * Math.PI / 96, x = Math.cos(angle) * circle.radius, y = Math.sin(angle) * circle.radius
    ring.push({ x: center.x + u.x * x + v.x * y, y: center.y + u.y * x + v.y * y, z: center.z + u.z * x + v.z * y })
  }
  const diameter: [Vec3Value, Vec3Value] = [{ ...points[0]! }, { x: 2 * center.x - points[0]!.x, y: 2 * center.y - points[0]!.y, z: 2 * center.z - points[0]!.z }]
  return { circle, ring, diameter }
}
