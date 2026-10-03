import * as THREE from 'three'

export function measurementFromHit(hit: THREE.Intersection, mode: 'surface' | 'vertex'): THREE.Vector3 | null {
  if (mode === 'surface') return hit.point.clone()
  const mesh = hit.object as THREE.Mesh
  const positions = mesh.geometry?.getAttribute('position')
  if (!hit.face || !positions) return null
  const vertices = [hit.face.a, hit.face.b, hit.face.c].map(index => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld))
  return vertices.sort((a, b) => a.distanceToSquared(hit.point) - b.distanceToSquared(hit.point))[0] ?? null
}
