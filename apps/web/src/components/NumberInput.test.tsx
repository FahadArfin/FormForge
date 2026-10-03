// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NumberInput } from './NumberInput'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const type = async (input: HTMLInputElement, text: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('precise numeric edits', () => {
  it('keeps a partial negative decimal as a draft and commits once on Enter', async () => {
    const commit = vi.fn()
    await act(async () => root.render(<NumberInput label="X" value={20} onChange={commit} />))
    const input = host.querySelector('input')!
    await act(async () => input.focus())
    await type(input, '-')
    expect(commit).not.toHaveBeenCalled()
    await type(input, '-12.75')
    expect(commit).not.toHaveBeenCalled()
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(commit).toHaveBeenCalledExactlyOnceWith(-12.75)
  })
  it('Escape and empty input leave the current geometry unchanged', async () => {
    const commit = vi.fn()
    await act(async () => root.render(<NumberInput label="X" value={20} onChange={commit} />))
    const input = host.querySelector('input')!
    await act(async () => input.focus())
    await type(input, '99')
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(input.value).toBe('20')
    await act(async () => input.focus())
    await type(input, '')
    await act(async () => input.blur())
    expect(input.value).toBe('20')
    expect(commit).not.toHaveBeenCalled()
  })
  it('rejects zero scales and commits a precise value on blur', async () => {
    const commit = vi.fn()
    await act(async () => root.render(<NumberInput label="Scale" value={-1} allowZero={false} onChange={commit} />))
    const input = host.querySelector('input')!
    await act(async () => input.focus()); await type(input, '0'); await act(async () => input.blur())
    expect(commit).not.toHaveBeenCalled()
    await act(async () => input.focus()); await type(input, '-1.125'); await act(async () => input.blur())
    expect(commit).toHaveBeenCalledExactlyOnceWith(-1.125)
  })
  it('shows the accepted value when rounding or clamping leaves the parent value unchanged', async () => {
    function ConstrainedInputs() {
      const [count, setCount] = useState(20)
      const [surface, setSurface] = useState(0)
      return <><NumberInput label="Teeth" value={count} onChange={value => setCount(Math.round(value))} /><NumberInput label="Hollow" value={surface} onChange={value => setSurface(Math.max(0, value))} /></>
    }
    await act(async () => root.render(<ConstrainedInputs />))
    const [count, surface] = host.querySelectorAll('input')
    await act(async () => count!.focus()); await type(count!, '20.4'); await act(async () => count!.blur())
    expect(count!.value).toBe('20')
    await act(async () => surface!.focus()); await type(surface!, '-1'); await act(async () => surface!.blur())
    expect(surface!.value).toBe('0')
  })
})
