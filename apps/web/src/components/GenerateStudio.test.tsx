// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import { GenerateStudio } from './GenerateStudio'

const boundary = vi.hoisted(() => ({ state: {} as Record<string, unknown>, listeners: new Set<(state: Record<string, unknown>) => void>(), relief: vi.fn() }))
vi.mock('@/store/editor', () => ({ useEditor: Object.assign((selector: (state: Record<string, unknown>) => unknown) => selector(boundary.state), { getState: () => boundary.state, subscribe: (listener: (state: Record<string, unknown>) => void) => { boundary.listeners.add(listener); return () => boundary.listeners.delete(listener) } }) }))
vi.mock('@/lib/generative', async (load) => ({ ...await load<typeof import('@/lib/generative')>(), imageFileToReliefMesh: boundary.relief }))

let host: HTMLDivElement
let root: Root
let mounted: boolean
const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  boundary.state = { document: createDocument(), importMesh: vi.fn(), dispatch: vi.fn(), selectNode: vi.fn(), setTool: vi.fn(), setNotice: vi.fn() }
  boundary.listeners.clear(); boundary.relief.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Static site</html>', { headers: { 'content-type': 'text/html' } })))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test-image'), revokeObjectURL: vi.fn() }))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); mounted = true
})
afterEach(async () => { if (mounted) await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const click = async (text: string) => {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)
  expect(button, `button ${text}`).toBeDefined()
  await act(async () => button!.click())
}
async function startRelief(onClose = vi.fn()) {
  let finish!: (value: typeof mesh) => void
  boundary.relief.mockImplementationOnce(() => new Promise<typeof mesh>((resolve) => { finish = resolve }))
  await act(async () => root.render(<GenerateStudio onClose={onClose} />))
  await click('Image')
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: [new File(['png'], 'reference.png', { type: 'image/png' })], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await click('Create local relief')
  return finish
}

describe('generation workflow', () => {
  it('keeps cloud generation unavailable on a static site and opens with native modal focus', async () => {
    await act(async () => root.render(<GenerateStudio onClose={vi.fn()} />))
    expect(host.querySelector('dialog')?.open).toBe(true)
    expect(document.activeElement?.textContent?.trim()).toBe('Recipes')
    await click('Image')
    const cloud = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Cloud 3D'))!
    expect(cloud.disabled).toBe(true)
    expect(cloud.textContent).toContain('Unavailable on this site')
    expect(host.textContent).toContain('local image relief work in your browser')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('adds a completed local relief to the unchanged project', async () => {
    const finish = await startRelief()
    await act(async () => finish(mesh))
    expect(boundary.state.importMesh).toHaveBeenCalledExactlyOnceWith('reference relief', mesh)
    expect(host.textContent).toContain('Relief added as a polygon mesh')
  })

  it('discards a delayed result after switching away and back to the original project', async () => {
    const original = boundary.state.document
    const finish = await startRelief()
    await act(async () => {
      boundary.state.document = createDocument()
      boundary.listeners.forEach((listener) => listener(boundary.state))
      boundary.state.document = original
      boundary.listeners.forEach((listener) => listener(boundary.state))
    })
    await act(async () => finish(mesh))
    expect(boundary.state.importMesh).not.toHaveBeenCalled()
    expect(host.textContent).toContain('active project changed')
  })

  it('discards a pending result immediately when the dialog is closed', async () => {
    const onClose = vi.fn()
    const finish = await startRelief(onClose)
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]')!.click())
    expect(onClose).toHaveBeenCalledOnce()
    await act(async () => finish(mesh))
    expect(boundary.state.importMesh).not.toHaveBeenCalled()
  })

  it('discards a pending result when navigation unmounts the generator', async () => {
    const finish = await startRelief()
    await act(async () => root.unmount()); mounted = false
    await act(async () => finish(mesh))
    expect(boundary.state.importMesh).not.toHaveBeenCalled()
  })
})
