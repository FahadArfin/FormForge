import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createNode, vec3 } from '@formforge/model'
import { axisWorkplane, faceWorkplane, planeToWorld, worldToPlane, placeNodeOnWorkplane } from './workplanes'
import { nodeToWorldGeometry } from './modelGeometry'

describe('workplanes', () => {
  it.each(['xy', 'xz', 'yz'] as const)('roundtrips %s coordinates with an offset', axis => {
    const plane = axisWorkplane(axis, 23)
    const local = new Vector3(5, 7, 11)
    expect(worldToPlane(planeToWorld(local, plane), plane).distanceTo(local)).toBeLessThan(1e-9)
    expect(planeToWorld(new Vector3(), plane).dot(new Vector3(plane.normal.x, plane.normal.y, plane.normal.z))).toBeCloseTo(23)
  })
  it('places the primitive bottom on an arbitrary right-handed face frame', () => {
    const plane = faceWorkplane(vec3(10, 20, 30), vec3(1, 2, 3))
    const node = placeNodeOnWorkplane(createNode('box'), plane, { x: 4, y: 6 })
    const geometry = nodeToWorldGeometry(node)
    const p = geometry.getAttribute('position')
    const depths = Array.from({length:p.count}, (_, i) => worldToPlane(new Vector3().fromBufferAttribute(p,i), plane).z)
    expect(Math.min(...depths)).toBeCloseTo(0, 4)
    expect(Math.max(...depths)).toBeCloseTo(node.parameters.height, 4)
    geometry.dispose()
  })
  it('rejects zero normals', () => expect(() => faceWorkplane(vec3(), vec3())).toThrow())
})
