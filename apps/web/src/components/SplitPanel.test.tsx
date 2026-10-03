// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, type MeshPayload } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { SplitPanel } from './SplitPanel'

const boundary = vi.hoisted(() => ({ compute: vi.fn() }))
vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(() => new Promise(() => undefined)) } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))
vi.mock('@/lib/planeSplit', async original => {
  const actual = await original<typeof import('@/lib/planeSplit')>()
  return { ...actual, splitDocumentSafely: (...args: Parameters<typeof actual.splitDocumentSafely>) => actual.splitDocumentSafely(args[0], args[1], args[2], { ...args[3], compute: boundary.compute }) }
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
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
const splitButton = () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Split model'))!

describe('split panel', () => {
  it('replaces the evaluated model with both parts in one undo step and reveals the full result', async () => {
    const before = useEditor.getState().document
    useInspection.getState().setSection({ enabled: true })
    boundary.compute.mockResolvedValue(parts)
    await act(async () => root.render(<SplitPanel />))
    await act(async () => splitButton().click())
    expect(useEditor.getState().document.nodes).toHaveLength(2)
    expect(useEditor.getState().document.nodes.every(node => node.kind === 'mesh')).toBe(true)
    expect(useEditor.getState().undoStack).toEqual([before])
    expect(useInspection.getState().section.enabled).toBe(false)
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
})
