import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import type { TransformValue, Vec3Value } from '@formforge/model'

/** Document rotations use the viewport's intrinsic XYZ convention, in degrees. */
export function modelTransformMatrix(transform: TransformValue) {
  const { position, rotation, scale } = transform
  return new Matrix4().compose(
    new Vector3(position.x, position.y, position.z),
    new Quaternion().setFromEuler(new Euler(
      MathUtils.degToRad(rotation.x),
      MathUtils.degToRad(rotation.y),
      MathUtils.degToRad(rotation.z),
      'XYZ',
    )),
    new Vector3(scale.x, scale.y, scale.z),
  )
}

export function modelPointToWorld(point: Vec3Value, transform: TransformValue): Vec3Value {
  const world = new Vector3(point.x, point.y, point.z).applyMatrix4(modelTransformMatrix(transform))
  return { x: world.x, y: world.y, z: world.z }
}
