// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { CadToolsPanel } from './CadToolsPanel'
import { nodeWorldBounds } from '@/lib/modelGeometry'

vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn() } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  useEditor.setState({ document: createDocument(), undoStack: [], redoStack: [], selectedNodeId: null, selectedNodeIds: [], placingNodeId: null, tool: 'select' })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
const render = async () => act(async () => root.render(<CadToolsPanel />))
async function change(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  expect(input, label).toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function style(value: string) {
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Hole style"]')!
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
}
async function submit() {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Create cutout')!
  expect(button).toBeTruthy()
  await act(async () => button.click())
}
async function submitCoupon() {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Create fit-test coupon')!
  expect(button).toBeTruthy()
  await act(async () => button.click())
}

describe('hole builder workflow', () => {
  it('keeps drafts out of the document and inserts both counterbore cutters as one undoable change', async () => {
    await render()
    const before = useEditor.getState().document
    await style('counterbore')
    await change('Hole diameter (mm)', '1/4 in')
    await change('Diametral clearance (mm)', '0.2')
    expect(useEditor.getState().document).toBe(before)
    await submit()
    const after = useEditor.getState()
    expect(after.document.nodes).toHaveLength(before.nodes.length + 2)
    expect(after.document.nodes.at(-2)!.parameters.radius).toBeCloseTo(3.275)
    expect(after.document.nodes.slice(-2).every(node => node.boolean === 'cut')).toBe(true)
    expect(after.selectedNodeIds).toEqual(after.document.nodes.slice(-2).map(node => node.id))
    expect(after.undoStack).toHaveLength(1)
    await act(async () => useEditor.getState().undo())
    expect(useEditor.getState().document).toEqual(before)
  })

  it('rejects an invalid draft without falling back to its old dimension or adding geometry', async () => {
    await render()
    const before = useEditor.getState().document
    await change('Hole diameter (mm)', '1/0')
    await submit()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/division by zero/i)
    expect(useEditor.getState().document).toBe(before)
    expect(useEditor.getState().undoStack).toHaveLength(0)
  })

  it('explains incompatible recess depths without inserting a partial bore', async () => {
    await render()
    const before = useEditor.getState().document
    await style('counterbore')
    await change('Recess depth (mm)', '50')
    await submit()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/recess depth/i)
    expect(useEditor.getState().document).toBe(before)
  })

  it('blocks global cutouts while an active part is locked', async () => {
    const document = useEditor.getState().document
    document.nodes[0]!.locked = true
    useEditor.setState({ document })
    await render()
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Create cutout')!
    expect(button.disabled).toBe(true)
    expect(host.textContent).toContain('Unlock')
  })

  it('disables hole creation and explains the evaluated-mesh workflow for volume-sculpted models', async () => {
    const document = useEditor.getState().document
    useEditor.setState({ document: { ...document, sculptStrokes: [{ id: 'retained', nodeId: document.nodes[0]!.id, mode: 'add', center: { x: 0, y: 0, z: 5 }, radius: 5, strength: 1, createdAt: document.createdAt }] } })
    await render()
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Create cutout')!
    expect(button.disabled).toBe(true)
    expect(host.textContent).toMatch(/export.*evaluated mesh.*reimport/i)
  })

  it('rechecks retained sculpting on submit even when the form rendered before the stroke was added', async () => {
    await render()
    const form = host.querySelector('form')!
    const document = useEditor.getState().document
    const sculpted = { ...document, sculptStrokes: [{ id: 'retained', nodeId: document.nodes[0]!.id, mode: 'add' as const, center: { x: 0, y: 0, z: 5 }, radius: 5, strength: 1, createdAt: document.createdAt }] }
    await act(async () => {
      useEditor.setState({ document: sculpted })
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(useEditor.getState().document).toBe(sculpted)
    expect(useEditor.getState().undoStack).toHaveLength(0)
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/volume sculpt/i)
  })
})

describe('fit-test coupon workflow', () => {
  it('adds the strip and separate gauge beside existing geometry in one undo step and explains sample order', async () => {
    await render()
    const before = useEditor.getState().document
    await change('Nominal pin diameter (mm)', '5')
    expect(useEditor.getState().document).toBe(before)
    await submitCoupon()
    const state = useEditor.getState()
    const added = state.document.nodes.slice(before.nodes.length)
    expect(added).toHaveLength(8)
    expect(state.selectedNodeIds).toEqual(added.map(node => node.id))
    const oldBack = Math.max(...before.nodes.map(node => nodeWorldBounds(node).max.y))
    expect(Math.min(...added.map(node => nodeWorldBounds(node).min.y))).toBeGreaterThan(oldBack + 7)
    expect(added.filter(node => node.boolean === 'cut').map(node => node.parameters.radius)).toEqual([2.55, 2.6, 2.65, 2.7, 2.75])
    expect(host.textContent).toContain('Left to right')
    expect(host.textContent).toContain('No text is printed')
    expect(state.undoStack).toHaveLength(1)
    await act(async () => useEditor.getState().undo())
    expect(useEditor.getState().document).toEqual(before)
  })

  it('rejects a noninteger sample count without adding the strip', async () => {
    await render()
    const before = useEditor.getState().document
    await change('Sample count', '3.5')
    await submitCoupon()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/whole number/i)
    expect(useEditor.getState().document).toBe(before)
  })

  it('places new coupon geometry clear of existing global volume sculpt strokes', async () => {
    const document = useEditor.getState().document
    document.sculptStrokes = [{ id: 'test-stroke', nodeId: document.nodes[0]!.id, mode: 'add', center: { x: 0, y: 80, z: 0 }, radius: 20, strength: 1, createdAt: document.createdAt }]
    useEditor.setState({ document })
    await render()
    await submitCoupon()
    const added = useEditor.getState().document.nodes.slice(document.nodes.length)
    expect(added.length).toBeGreaterThan(0)
    expect(Math.min(...added.map(node => nodeWorldBounds(node).min.y))).toBeGreaterThan(107)
  })
})
