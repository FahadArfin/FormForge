import { describe, expect, it } from 'vitest'
import { vec3 } from '@formforge/model'
import { circleMeasurement, circleMeasurementGeometry } from './circleMeasurement'

describe('three-point circle measurement', () => {
  it('measures the circle, rather than a chord, in the XY plane', () => {
    const circle = circleMeasurement([vec3(5, 0, 0), vec3(0, 5, 0), vec3(-5, 0, 0)])
    expect(circle.center).toEqual(vec3())
    expect(circle.radius).toBeCloseTo(5)
    expect(circle.diameter).toBeCloseTo(10)
    expect(circle.circumference).toBeCloseTo(31.4159265359)
    expect(circle.normal).toEqual(vec3(0, 0, 1))
  })

  it('handles a translated, tilted circle in a 3D plane and either winding', () => {
    // Orthogonal radius vectors (3,4,0) and (0,0,5), centered on (100,-20,7).
    const points = [vec3(103, -16, 7), vec3(100, -20, 12), vec3(97, -24, 7)]
    for (const picks of [points, [...points].reverse()]) {
      const circle = circleMeasurement(picks)
      expect(circle.center.x).toBeCloseTo(100)
      expect(circle.center.y).toBeCloseTo(-20)
      expect(circle.center.z).toBeCloseTo(7)
      expect(circle.radius).toBeCloseTo(5)
      expect(Math.abs(circle.normal.x)).toBeCloseTo(.8)
      expect(Math.abs(circle.normal.y)).toBeCloseTo(.6)
      expect(circle.normal.z).toBeCloseTo(0)
    }
  })

  it('retains small circles and handles large translations without cancellation', () => {
    expect(circleMeasurement([vec3(1e-8, 0, 0), vec3(0, 1e-8, 0), vec3(-1e-8, 0, 0)]).radius).toBeCloseTo(1e-8, 15)
    const circle = circleMeasurement([vec3(1e6 + 2, -1e6, 1e6), vec3(1e6, -1e6 + 2, 1e6), vec3(1e6 - 2, -1e6, 1e6)])
    expect(circle.center).toEqual(vec3(1e6, -1e6, 1e6))
    expect(circle.diameter).toBeCloseTo(4)
  })

  it('rejects coincident, collinear and near-collinear picks at every scale', () => {
    for (const size of [1e-8, 1, 1e6]) {
      expect(() => circleMeasurement([vec3(), vec3(), vec3(size, size, 0)])).toThrow(/distinct/)
      expect(() => circleMeasurement([vec3(), vec3(size, 0, 0), vec3(2 * size, 0, 0)])).toThrow(/line/)
      expect(() => circleMeasurement([vec3(), vec3(size, 0, 0), vec3(2 * size, size * 1e-8, 0)])).toThrow(/line/)
    }
  })

  it('rejects incomplete, nonfinite and numerically unsafe measurements', () => {
    expect(() => circleMeasurement([vec3(), vec3(1, 1, 0)])).toThrow(/three/)
    for (const value of [NaN, Infinity, 1e300, 1e8]) {
      expect(() => circleMeasurement([vec3(value, 0, 0), vec3(0, 1, 0), vec3(-1, 0, 0)])).toThrow()
    }
    expect(() => circleMeasurement([vec3(1e6, 0, 0), vec3(1e6, 1e-10, 0), vec3(1e6 + 1, 1, 0)])).toThrow(/distinct/)
    expect(() => circleMeasurement([vec3(-1e6, 0, 0), vec3(0, 100, 0), vec3(1e6, 0, 0)])).toThrow(/range/)
  })

  it('draws the ring in the picked plane and a full diameter through the first pick', () => {
    const overlay = circleMeasurementGeometry([vec3(103, -16, 7), vec3(100, -20, 12), vec3(97, -24, 7)])
    expect(overlay.diameter).toEqual([vec3(103, -16, 7), vec3(97, -24, 7)])
    expect(overlay.ring).toHaveLength(96)
    for (const point of overlay.ring) {
      const x = point.x - 100, y = point.y + 20, z = point.z - 7
      expect(Math.hypot(x, y, z)).toBeCloseTo(5)
      expect(.8 * x - .6 * y).toBeCloseTo(0)
    }
  })
})
