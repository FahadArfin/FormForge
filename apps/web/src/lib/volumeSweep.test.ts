import { expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Vector3 } from 'three'
import { canSweepVolume } from './volumeSweep'

it('breaks across air, clipped surface, and leaps that exceed the safe sampling budget', () => {
  const camera = new OrthographicCamera(-110, 110, 30, -30, .1, 200)
  camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const material = new MeshBasicMaterial(), geometry = new BoxGeometry(100.5, 20, 2)
  const left = new Mesh(geometry, material), right = new Mesh(geometry, material), surface = new Group()
  left.position.set(-49.75, 0, 0); right.position.set(52.25, 0, 0)
  surface.add(left, right); surface.updateMatrixWorld(true)
  const point = (x: number) => new Vector3(x, 0, 1)
  try {
    expect(canSweepVolume(point(-10), point(-1), .5, surface, camera)).toBe(true)
    expect(canSweepVolume(point(-2), point(4), .5, surface, camera)).toBe(false)
    expect(canSweepVolume(point(-99), point(99), .5, surface, camera)).toBe(false)
    expect(canSweepVolume(point(-10), point(-1), .5, surface, camera, p => p.x < -6)).toBe(false)
  } finally { geometry.dispose(); material.dispose() }
})
