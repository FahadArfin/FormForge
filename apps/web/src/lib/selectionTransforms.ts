import { Euler, MathUtils, Quaternion, Vector3 } from 'three'
import type { ModelNode, TransformValue, Vec3Value } from '@formforge/model'

const vector = (value: Vec3Value) => new Vector3(value.x, value.y, value.z)
const value = (vector: Vector3): Vec3Value => ({ x: vector.x, y: vector.y, z: vector.z })
const quaternion = (rotation: Vec3Value) => new Quaternion().setFromEuler(new Euler(...[rotation.x, rotation.y, rotation.z].map(MathUtils.degToRad) as [number, number, number]))
export const nonzeroScale = (scale: number, previous: number) => Math.abs(scale) < 0.0001 ? Math.sign(scale || previous || 1) * 0.0001 : scale

export function selectionNeedsUniformScale(nodes: ModelNode[]) {
  const editable = nodes.filter(node => !node.locked)
  if (editable.length < 2) return false
  const first = quaternion(editable[0]!.transform.rotation)
  return editable.slice(1).some(node => Math.abs(first.dot(quaternion(node.transform.rotation))) < 1 - 1e-8)
}

/** The active shape is the shared pivot; every result derives from the same drag-start snapshot. */
export function transformSelectionFromPrimary(nodes: ModelNode[], primaryId: string, next: TransformValue) {
  const primary = nodes.find(node => node.id === primaryId)
  if (!primary || primary.locked) return []
  const previous = primary.transform
  const startRotation = quaternion(previous.rotation)
  const rotationDelta = quaternion(next.rotation).multiply(startRotation.clone().invert())
  const scaleRatio = vector(next.scale).divide(vector(previous.scale))
  let effectiveNext = next
  if (selectionNeedsUniformScale(nodes)) {
    // A nonuniform scale in the pivot's axes would shear differently rotated
    // parts. The document stores rotation/scale, so keep the group uniform.
    const factor = scaleRatio.toArray().reduce((largest, candidate) => Math.abs(candidate - 1) > Math.abs(largest - 1) ? candidate : largest, 1)
    scaleRatio.setScalar(factor)
    effectiveNext = { ...next, scale: value(vector(previous.scale).multiplyScalar(factor)) }
  }
  return nodes.filter(node => !node.locked).map(node => {
    if (node.id === primaryId) return { id: node.id, transform: effectiveNext }
    const position = vector(node.transform.position).sub(vector(previous.position))
      .applyQuaternion(startRotation.clone().invert()).multiply(scaleRatio).applyQuaternion(startRotation)
      .applyQuaternion(rotationDelta).add(vector(next.position))
    const rotation = new Euler().setFromQuaternion(rotationDelta.clone().multiply(quaternion(node.transform.rotation)))
    return { id: node.id, transform: {
      position: value(position),
      rotation: { x: MathUtils.radToDeg(rotation.x), y: MathUtils.radToDeg(rotation.y), z: MathUtils.radToDeg(rotation.z) },
      scale: value(vector(node.transform.scale).multiply(scaleRatio)),
    } }
  })
}
