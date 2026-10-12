// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoxGeometry } from 'three'
import { createDocument, type MeshPayload } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { SectionDrawingPanel } from './SectionDrawingPanel'
const boundary = vi.hoisted(() => ({ evaluate: vi.fn(), download: vi.fn() }))
vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(() => new Promise(() => undefined)) } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))
vi.mock('@/geometry/evaluateSnapshot', () => ({ evaluateSnapshot: boundary.evaluate }))
vi.mock('@/lib/download', async original => ({ ...await original<typeof import('@/lib/download')>(), downloadBlob: boundary.download }))
function cube(): MeshPayload { const g = new BoxGeometry(20,30,40); const result = { positions: new Float32Array(g.getAttribute('position').array), indices: new Uint32Array(g.index!.array), triangleCount: 12, volume: 24000 }; g.dispose(); return result }
let host: HTMLDivElement, root: Root
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent === label)!
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function() { this.open = true }
  HTMLDialogElement.prototype.close = function() { this.open = false }
  useEditor.setState({ document: createDocument(), placingNodeId: null, undoStack: [], redoStack: [] })
  useInspection.getState().resetSection(); useInspection.getState().setSection({ offset:0 })
  boundary.evaluate.mockReset().mockResolvedValue(cube()); boundary.download.mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
async function render() { await act(async () => root.render(<SectionDrawingPanel onClose={() => undefined} />)) }
async function generate() { await act(async () => button('Generate preview').click()) }
describe('section drawing preview', () => {
  it('evaluates only on demand and previews actual geometry before enabling either download', async () => {
    await render()
    expect(button('Download SVG')?.disabled).toBe(true)
    expect(button('Download DXF')?.disabled).toBe(true)
    expect(boundary.evaluate).not.toHaveBeenCalled()
    await generate()
    expect(host.querySelector('svg[aria-label="Section linework preview"] path')?.getAttribute('d')).toContain('M -10 15')
    expect(host.textContent).toMatch(/20 × 30 mm/)
    expect(host.textContent).toMatch(/tessellated/i)
    expect(button('Download SVG').disabled).toBe(false)
    await act(async () => button('Download SVG').click())
    await act(async () => button('Download DXF').click())
    expect(boundary.download.mock.calls.map(call => [call[0].type, call[1].split('.').at(-1)])).toEqual([['image/svg+xml','svg'], ['application/dxf','dxf']])
    expect(useEditor.getState().undoStack).toHaveLength(0)
  })
  it.each(['document','section'] as const)('disables reviewed exports immediately after the %s changes', async kind => {
    await render(); await generate()
    await act(async () => { if (kind === 'document') useEditor.setState({ document: { ...useEditor.getState().document, name:'new project' } }); else useInspection.getState().setSection({ offset:3 }) })
    expect(button('Download SVG').disabled).toBe(true)
    expect(host.querySelector('svg[aria-label="Section linework preview"]')).toBeNull()
    expect(host.textContent).toMatch(/changed|new preview/i)
  })
  it.each(['document','section','cancel','unmount'] as const)('aborts pending evaluation and ignores a late result after %s', async kind => {
    let finish!: (mesh:MeshPayload) => void
    boundary.evaluate.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await render(); await generate()
    const signal = boundary.evaluate.mock.calls[0]![1] as AbortSignal
    await act(async () => {
      if (kind === 'document') useEditor.setState({ document:createDocument() })
      else if (kind === 'section') useInspection.getState().setSection({ axis:'x' })
      else if (kind === 'cancel') button('Cancel preview').click()
      else root.render(null)
    })
    expect(signal.aborted).toBe(true)
    await act(async () => finish(cube()))
    expect(host.querySelector('svg[aria-label="Section linework preview"]')).toBeNull()
    if (kind !== 'unmount') expect(button('Download SVG').disabled).toBe(true)
    expect(boundary.download).not.toHaveBeenCalled()
  })
  it('reports empty linework without enabling exports', async () => {
    useInspection.getState().setSection({ offset:100 })
    await render(); await generate()
    expect(host.textContent).toMatch(/no section linework/i)
    expect(button('Download DXF').disabled).toBe(true)
  })
  it('reports evaluation failure and allows retry', async () => {
    boundary.evaluate.mockRejectedValueOnce(new Error('Geometry failed'))
    await render(); await generate()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Geometry failed')
    await generate()
    expect(button('Download SVG').disabled).toBe(false)
  })
  it('requires placement to finish and blocks an existing preview when placement begins', async () => {
    await render(); await generate()
    await act(async () => useEditor.setState({ placingNodeId:'placing' }))
    expect(button('Generate preview').disabled).toBe(true)
    expect(button('Download SVG').disabled).toBe(true)
    expect(host.textContent).toMatch(/finish placing/i)
  })
})

it('opens the drawing dialog from the visible section inspection entry', async () => {
  const { SectionPanel } = await import('./SectionPanel')
  await act(async () => root.render(<SectionPanel />))
  expect(host.querySelector('[data-cad-tool="section-drawing"] button')?.textContent).toBe('Preview section drawing')
  await act(async () => button('Preview section drawing').click())
  expect(host.querySelector('dialog[open] h2')?.textContent).toBe('Section drawing')
  expect(button('Download SVG').disabled).toBe(true)
})
