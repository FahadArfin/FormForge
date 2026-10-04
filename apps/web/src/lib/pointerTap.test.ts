import { expect, it } from 'vitest'
import { PointerTap } from './pointerTap'
const point = { pointerId: 1, clientX: 10, clientY: 20, isPrimary: true, button: 0 }
it('accepts a tap but rejects dragging, a drag returning to its origin, multiple fingers and cancellation', () => {
  const tap = new PointerTap()
  tap.down(point); expect(tap.up({ ...point, clientX: 13 })).toBe(true)
  tap.down(point); tap.move({ ...point, clientX: 50 }); expect(tap.up(point)).toBe(false)
  tap.down(point); tap.down({ ...point, isPrimary: false, pointerId: 2 }); expect(tap.up(point)).toBe(false)
  tap.down(point); expect(tap.up({ ...point, type: 'pointercancel' })).toBe(false)
  expect(tap.up(point)).toBe(false)
})
