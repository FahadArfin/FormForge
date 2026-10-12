// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ImportReview } from './ImportReview'
vi.mock('./MeshPreview', () => ({ MeshPreview: () => null }))
it.each(['ply', 'off'])('reviews %s source units before applying scaled geometry', async extension => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const received: unknown[] = []
  try {
    await act(async () => root.render(<ImportReview name={`fixture.${extension}`} mesh={{ positions: [2, 3, 4, 12, 3, 4, 2, 13, 4], indices: [0, 1, 2] }} onClose={() => {}} onConfirm={async mesh => { received.push(mesh) }}/>))
    expect(received).toHaveLength(0)
    const units = host.querySelector<HTMLSelectElement>('[aria-label="Source units"]')!
    expect(units.disabled).toBe(false)
    await act(async () => { units.value = '10'; units.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(host.textContent).toContain('100.00 × 100.00 × 0.00 mm')
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Add reviewed model')!.click())
    expect(received).toEqual([{ positions: [-50, -50, 0, 50, -50, 0, -50, 50, 0], indices: [0, 1, 2] }])
  } finally { await act(async () => root.unmount()); host.remove() }
})
