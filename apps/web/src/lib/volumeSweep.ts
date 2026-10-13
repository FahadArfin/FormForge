import { Raycaster, Vector2, type Camera, type Object3D, type Vector3 } from 'three'

/** Bound raycast work without silently lowering the gap-detection resolution. */
export function canSweepVolume(from: Vector3, to: Vector3, radius: number, surface: Object3D, camera: Camera, visible: (point: Vector3) => boolean = () => true): boolean {
  const samples = Math.max(1, Math.ceil(from.distanceTo(to) / Math.max(.25, radius * .5)))
  if (samples > 64) return false
  const raycaster = new Raycaster()
  for (let i = 1; i < samples; i++) {
    const expected = from.clone().lerp(to, i / samples), projected = expected.clone().project(camera)
    raycaster.setFromCamera(new Vector2(projected.x, projected.y), camera)
    const hit = raycaster.intersectObject(surface, true).find(hit => visible(hit.point))
    if (!hit || hit.point.distanceTo(expected) > radius * .5) return false
  }
  return true
}
