// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createNode } from '@formforge/model'
import { ProfileEditor } from './ProfileEditor'
let host: HTMLDivElement, root: Root
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const profile = () => ({ ...createNode('extrude'), profile: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }] })
const click = async (element: Element) => act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const button = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent === name)!
async function length(value: string) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="Selected edge length (millimeters)"]')!
  await act(async () => { input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => input.blur())
}
it('keeps visual edge edits as drafts, resets without writing, and applies one constrained change', async () => {
  const node = profile(), update = vi.fn()
  await act(async () => root.render(<ProfileEditor node={node} unit="mm" onUpdate={update} />))
  await click(host.querySelector('[aria-label^="Edge 1,"]')!); await length('25')
  expect(update).not.toHaveBeenCalled()
  await click(button('Reset')); expect(update).not.toHaveBeenCalled()
  await click(host.querySelector('[aria-label^="Edge 1,"]')!); await length('25'); await click(button('Apply profile'))
  expect(update).toHaveBeenCalledTimes(1)
  const patch = update.mock.calls[0]![0]
  expect(Math.hypot(patch.profile[1].x - patch.profile[0].x, patch.profile[1].y - patch.profile[0].y)).toBeCloseTo(25)
  expect(patch.profileConstraints).toHaveLength(1)
})
it('supports keyboard picking, clears stale selection on project change, and respects locked shapes', async () => {
  const node = profile(), update = vi.fn()
  await act(async () => root.render(<ProfileEditor node={node} unit="mm" onUpdate={update} />))
  await act(async () => host.querySelector('[aria-label^="Point 1,"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(host.querySelector('[aria-label="Selected point X (millimeters)"]')).not.toBeNull()
  await act(async () => root.render(<ProfileEditor node={{ ...profile(), locked: true }} unit="mm" onUpdate={update} />))
  await click(host.querySelector('[aria-label^="Point 1,"]')!)
  expect(host.querySelector('[aria-label="Selected point X (millimeters)"]')).toBeNull()
  expect(host.querySelector('[aria-label^="Point 1,"]')?.getAttribute('tabindex')).toBe('-1')
  expect(update).not.toHaveBeenCalled()
})
