import { Euler, Matrix4, Quaternion, Vector3, MathUtils } from 'three'
import type { ModelNode, Vec3Value, Workplane } from '@formforge/model'
import { makeSourceGeometry } from './modelGeometry'

export const vector = (v: Vec3Value) => new Vector3(v.x, v.y, v.z)
export const value = (v: Vector3): Vec3Value => ({ x:v.x, y:v.y, z:v.z })
export function axisWorkplane(axis: 'xy'|'xz'|'yz', offset = 0): Workplane {
  if (!Number.isFinite(offset) || Math.abs(offset) > 100000) throw new Error('Plane offset must be within ±100,000 mm.')
  const normal = axis === 'xy' ? new Vector3(0,0,1) : axis === 'xz' ? new Vector3(0,-1,0) : new Vector3(1,0,0)
  return { name:axis.toUpperCase(), origin:value(normal.clone().multiplyScalar(offset)), normal:value(normal), xAxis:axis === 'yz' ? {x:0,y:1,z:0} : {x:1,y:0,z:0} }
}
export function faceWorkplane(origin: Vec3Value, normalValue: Vec3Value): Workplane {
  const normal = vector(normalValue)
  if (!Object.values(origin).every(Number.isFinite) || !Object.values(normalValue).every(Number.isFinite) || normal.length() < 1e-8) throw new Error('Pick a valid planar face.')
  normal.normalize()
  const hint = Math.abs(normal.x) < 0.9 ? new Vector3(1,0,0) : new Vector3(0,1,0)
  const xAxis = hint.addScaledVector(normal,-hint.dot(normal)).normalize()
  return { name:'Picked face', origin:{...origin}, normal:value(normal), xAxis:value(xAxis) }
}
export function workplaneMatrix(plane: Workplane = axisWorkplane('xy')) {
  const x=vector(plane.xAxis), z=vector(plane.normal), y=new Vector3().crossVectors(z,x)
  return new Matrix4().makeBasis(x,y,z).setPosition(vector(plane.origin))
}
export function planeToWorld(point: Vector3, plane?: Workplane) { return point.clone().applyMatrix4(workplaneMatrix(plane)) }
export function worldToPlane(point: Vector3, plane?: Workplane) { return point.clone().applyMatrix4(workplaneMatrix(plane).invert()) }
export function workplaneRotation(plane?: Workplane) {
  const e = new Euler().setFromRotationMatrix(workplaneMatrix(plane),'XYZ')
  return {x:MathUtils.radToDeg(e.x),y:MathUtils.radToDeg(e.y),z:MathUtils.radToDeg(e.z)}
}
export function placeNodeOnWorkplane(node: ModelNode, plane: Workplane|undefined, point: {x:number;y:number}): ModelNode {
  const geometry=makeSourceGeometry(node); geometry.computeBoundingBox()
  const bottom=geometry.boundingBox?.min.z ?? 0; geometry.dispose()
  return {...node, transform:{...node.transform, rotation:workplaneRotation(plane), position:value(planeToWorld(new Vector3(point.x,point.y,-bottom),plane))}}
}
export function rotateTransform(node: ModelNode, rotation: Quaternion, pivot: Vector3): ModelNode {
  const r=node.transform.rotation
  const q=new Quaternion().setFromEuler(new Euler(...[r.x,r.y,r.z].map(MathUtils.degToRad) as [number,number,number],'XYZ')).premultiply(rotation)
  const e=new Euler().setFromQuaternion(q,'XYZ')
  return {...node, transform:{...node.transform, position:value(vector(node.transform.position).sub(pivot).applyQuaternion(rotation).add(pivot)), rotation:{x:MathUtils.radToDeg(e.x),y:MathUtils.radToDeg(e.y),z:MathUtils.radToDeg(e.z)}}}
}
