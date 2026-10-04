// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, vec3 } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { AnnotationsPanel } from './AnnotationsPanel'

vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn() } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))

let host: HTMLDivElement, root: Root
const circlePoints = [vec3(5, 0, 0), vec3(0, 5, 0), vec3(-5, 0, 0)]
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const doc = createDocument()
  useEditor.setState({ document: doc, meshDocument: doc, geometryStatus: 'ready', undoStack: [], redoStack: [], tool: 'select', showResult: true, measurement: null, placingNodeId: null })
  useInspection.setState({ circlePoints: [], anglePoints: [], measurementMode: 'vertex' })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
const render = async () => act(async () => root.render(<AnnotationsPanel />))
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!

describe('circle measurement controls', () => {
  it('starts new picks on the evaluated result and leaves existing geometry intact', async () => {
    useEditor.setState({ showResult: false }); useInspection.setState({ circlePoints })
    const doc = useEditor.getState().document
    await render()
    expect(button('Measure circle')).toBeTruthy()
    await act(async () => button('Measure circle').click())
    expect(useEditor.getState().tool).toBe('measure-circle')
    expect(useEditor.getState().showResult).toBe(true)
    expect(useEditor.getState().document).toBe(doc)
    expect(useInspection.getState().circlePoints).toEqual([])
    expect(host.textContent).toContain('0/3')
  })

  it('explains invalid picks and never enables an ambiguous diameter pin', async () => {
    useEditor.setState({ tool: 'measure-circle' })
    useInspection.setState({ circlePoints: [vec3(), vec3(1, 0, 0), vec3(2, 0, 0)] })
    await render()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/line/)
    expect(button('Pin diameter')?.disabled).toBe(true)
    await act(async () => button('Clear circle points').click())
    expect(useInspection.getState().circlePoints).toEqual([])
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows all circle dimensions and pins a diameter as one undoable change', async () => {
    useEditor.setState({ tool: 'measure-circle' }); useInspection.setState({ circlePoints })
    await render()
    expect(host.textContent).toContain('Radius 5.00 mm')
    expect(host.textContent).toContain('Diameter 10.00 mm')
    expect(host.textContent).toContain('Circumference 31.42 mm')
    expect(host.textContent).toMatch(/mesh estimate/i)
    expect(button('Pin diameter')?.disabled).toBe(false)
    await act(async () => button('Pin diameter').click())
    expect(useEditor.getState().document.annotations?.[0]?.kind).toBe('diameter')
    expect(useEditor.getState().document.annotations?.[0]?.points).toEqual(circlePoints)
    expect(useEditor.getState().undoStack).toHaveLength(1)
  })

  it('does not expose a current diameter when the evaluated result is stale', async () => {
    useEditor.setState({ tool: 'measure-circle', meshDocument: createDocument() }); useInspection.setState({ circlePoints })
    await render()
    expect(button('Pin diameter')?.disabled).toBe(true)
    expect(host.textContent).toMatch(/rebuild/i)
    expect(host.textContent).not.toContain('Diameter 10.00 mm')
  })

  it('clears picks when switching between mesh vertices and surface points', async () => {
    useEditor.setState({ tool: 'measure-circle' }); useInspection.setState({ circlePoints })
    await render()
    const select = host.querySelector<HTMLSelectElement>('[aria-label="Circle measurement picking"]')
    expect(select).toBeTruthy()
    await act(async () => { select!.value = 'surface'; select!.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(useInspection.getState().measurementMode).toBe('surface')
    expect(useInspection.getState().circlePoints).toEqual([])
  })
})
