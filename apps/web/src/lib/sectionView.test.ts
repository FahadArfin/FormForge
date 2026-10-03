import { describe, expect, it } from 'vitest'
import { sectionPlane, sectionPointVisible } from './sectionView'

describe('section inspection', () => {
  it.each(['x', 'y', 'z'] as const)('keeps the positive %s side then reverses it', axis => {
    const settings = { enabled: true, axis, offset: 5, inverted: false }
    const below = { x: 0, y: 0, z: 0, [axis]: 4 }
    const above = { x: 0, y: 0, z: 0, [axis]: 6 }
    expect(sectionPointVisible(below, settings)).toBe(false)
    expect(sectionPointVisible(above, settings)).toBe(true)
    expect(sectionPointVisible(above, { ...settings, inverted: true })).toBe(false)
    expect(sectionPointVisible(below, { ...settings, enabled: false })).toBe(true)
    expect(sectionPlane(settings).constant).toBe(-5)
  })
})
