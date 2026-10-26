// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, type MeshPayload } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { SplitPanel } from './SplitPanel'

const boundary = vi.hoisted(() => ({ compute: vi.fn(), saveVersion: vi.fn() }))
vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(() => new Promise(() => undefined)) } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn(), saveVersion: boundary.saveVersion }))
vi.mock('./MeshPreview', () => ({ MeshPreview: ({ label }: { label: string }) => <div role="img" aria-label={label} /> }))
vi.mock('@/lib/planeSplit', async original => {
  const actual = await original<typeof import('@/lib/planeSplit')>()
  return { ...actual, previewSplitDocument: (...args: Parameters<typeof actual.previewSplitDocument>) => actual.previewSplitDocument(args[0], args[1], { ...args[2], compute: boundary.compute }) }
})
const mesh: MeshPayload = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]), triangleCount: 4, volume: 1 / 6 }
const parts = { positive: mesh, negative: mesh }
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  useEditor.setState({ document: createDocument(), selectedNodeId: null, selectedNodeIds: [], placingNodeId: null, undoStack: [], redoStack: [], tool: 'select' })
  useInspection.getState().resetSection()
  boundary.compute.mockReset()
  boundary.saveVersion.mockReset().mockResolvedValue(undefined)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
const splitButton = () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Preview split'))!
const applyButton = () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Apply split')

describe('split panel', () => {
  it('replaces the evaluated model with both parts in one undo step and reveals the full result', async () => {
    const before = useEditor.getState().document
    useInspection.getState().setSection({ enabled: true })
    boundary.compute.mockResolvedValue(parts)
    await act(async () => root.render(<SplitPanel />))
    await act(async () => splitButton().click())
    expect(useEditor.getState().document).toBe(before)
    expect(boundary.saveVersion).not.toHaveBeenCalled()
    await act(async () => applyButton()!.click())
    expect(boundary.saveVersion).toHaveBeenCalledWith(before, 'Before plane split')
    expect(useEditor.getState().document.nodes).toHaveLength(2)
    expect(useEditor.getState().document.nodes.every(node => node.kind === 'mesh')).toBe(true)
    expect(useEditor.getState().undoStack).toEqual([before])
    expect(useInspection.getState().section.enabled).toBe(false)
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/checkpoint saved/i)
    await act(async () => useEditor.getState().undo())
    expect(useEditor.getState().document).toBe(before)
  })
  it('keeps newer work intact when the document changes during processing', async () => {
    let finish!: (value: typeof parts) => void
    boundary.compute.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await act(async () => root.render(<SplitPanel />))
    await act(async () => splitButton().click())
    await act(async () => useEditor.getState().dispatch({ type: 'rename-document', name: 'Newer model' }))
    const newer = useEditor.getState().document
    await act(async () => finish(parts))
    expect(useEditor.getState().document).toBe(newer)
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/changed|not replaced/i)
  })
  it('rejects a result when the shared section plane moves during processing', async () => {
    let finish!: (value: typeof parts) => void
    boundary.compute.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const before = useEditor.getState().document
    await act(async () => root.render(<SplitPanel />))
    await act(async () => splitButton().click())
    await act(async () => useInspection.getState().setSection({ offset: 12 }))
    await act(async () => finish(parts))
    expect(useEditor.getState().document).toBe(before)
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/plane changed/i)
  })
  it('never applies a pending result after leaving the panel', async () => {
    let finish!: (value: typeof parts) => void
    boundary.compute.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const before = useEditor.getState().document
    await act(async () => root.render(<SplitPanel />))
    await act(async () => splitButton().click())
    await act(async () => root.render(null))
    await act(async () => finish(parts))
    expect(useEditor.getState().document).toBe(before)
    expect(useEditor.getState().undoStack).toHaveLength(0)
  })
  it('disables destructive replacement for locked shapes and explains baking', async () => {
    useEditor.getState().document.nodes[0]!.locked = true
    await act(async () => root.render(<SplitPanel />))
    expect(splitButton().disabled).toBe(true)
    expect(host.textContent).toMatch(/unlock/i)
    expect(host.textContent).toMatch(/material/i)
    expect(host.textContent).toMatch(/undo/i)
  })
  it('invalidates a displayed preview after an edit and never checkpoints it', async () => {
    boundary.compute.mockResolvedValue(parts)
    await act(async () => root.render(<SplitPanel />))
    await act(async () => splitButton().click())
    expect(applyButton()).toBeDefined()
    await act(async () => useEditor.getState().dispatch({ type: 'rename-document', name: 'Changed after preview' }))
    expect(applyButton()).toBeUndefined()
    expect(boundary.saveVersion).not.toHaveBeenCalled()
  })
  it('does not replace the model if saving recovery fails or is cancelled', async () => {
    const before = useEditor.getState().document
    boundary.compute.mockResolvedValue(parts)
    boundary.saveVersion.mockRejectedValueOnce(new Error('Storage full'))
    await act(async () => root.render(<SplitPanel />))
    await act(async () => splitButton().click())
    await act(async () => applyButton()!.click())
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Storage full')
    expect(useEditor.getState().document).toBe(before)
    let finish!: () => void
    boundary.saveVersion.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    await act(async () => applyButton()!.click())
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Cancel split')!.click())
    await act(async () => finish())
    expect(useEditor.getState().document).toBe(before)
    expect(useEditor.getState().undoStack).toHaveLength(0)
  })
  it('cancels pending recovery if profile drawing begins without changing the document', async () => {
    const before = useEditor.getState().document
    let finish!: () => void
    boundary.compute.mockResolvedValue(parts)
    boundary.saveVersion.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    await act(async () => root.render(<SplitPanel />))
    await act(async () => splitButton().click())
    await act(async () => applyButton()!.click())
    await act(async () => useEditor.getState().beginProfileDrawing())
    await act(async () => finish())
    expect(useEditor.getState().document).toBe(before)
    expect(useEditor.getState().undoStack).toHaveLength(0)
    expect(splitButton().disabled).toBe(true)
    expect(host.textContent).toMatch(/cancel drawing/i)
  })
})
