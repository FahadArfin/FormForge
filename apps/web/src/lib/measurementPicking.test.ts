import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { measurementFromHit } from './measurementPicking'

describe('visible mesh measurement', () => {
  it('returns a world-space triangle vertex, including transformed and mirrored objects', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 10, 0, 0, 0, 10, 0], 3))
    const object = new THREE.Mesh(geometry)
    object.position.set(30, 20, 10); object.rotation.z = Math.PI / 2; object.scale.set(-2, 1, 1); object.updateMatrixWorld()
    const point = new THREE.Vector3(0.1, 0.1, 0).applyMatrix4(object.matrixWorld)
    const hit = { object, point, face: { a: 0, b: 1, c: 2 } } as THREE.Intersection<THREE.Mesh>
    expect(measurementFromHit(hit, 'vertex')?.toArray()).toEqual([30, 20, 10])
    expect(measurementFromHit(hit, 'surface')?.toArray()).toEqual(point.toArray())
    geometry.dispose()
  })
  it('never invents a vertex when there is no triangle', () => {
    const hit = { object: new THREE.Object3D(), point: new THREE.Vector3(1, 2, 3) } as THREE.Intersection
    expect(measurementFromHit(hit, 'vertex')).toBeNull()
  })
})
