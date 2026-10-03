// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createNode, type MeshPayload, type ModelDocument } from '@formforge/model'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'
import { downloadBlob } from '@/lib/download'
import { export3mf, exportGlb, exportMultiColor3mf, exportObj, exportStl } from '@/lib/exporters'
import { useEditor } from '@/store/editor'
import { TopBar } from './TopBar'

vi.mock('./MeshPreview',()=>({MeshPreview:()=> <div>Geometry preview</div>}))
vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(() => new Promise(() => undefined)) } }))
vi.mock('@/geometry/evaluateSnapshot', () => ({ evaluateSnapshot: vi.fn() }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(), loadMostRecentProject: vi.fn(), deleteProject: vi.fn(), saveVersion: vi.fn() }))
vi.mock('@/lib/download', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/download')>(),
  downloadBlob: vi.fn(),
}))
vi.mock('@/lib/exporters', () => ({ export3mf: vi.fn(), exportStl: vi.fn(), exportGlb: vi.fn(), exportObj: vi.fn(), exportMultiColor3mf: vi.fn() }))

function ExportHarness() {
  const [open, setOpen] = useState(true)
  const noop = () => undefined
  return <TopBar theme="dark" onToggleTheme={noop} onNewProject={noop} onOpenProjects={noop}
    onOpenCommunity={noop} onOpenGenerate={noop} onImport={noop} onCommands={noop} onHelp={noop}
    exportOpen={open} onExportChange={setOpen} />
}

function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

describe('selected-part export dialog', () => {
  let host: HTMLDivElement
  let root: Root
  let model: ModelDocument
  let wholeMesh: MeshPayload
  let selectedMesh: MeshPayload
  let exportedBlob: Blob
  const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')

  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  })

  afterAll(() => {
    if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  })

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.resetAllMocks()
    const base = { ...createNode('box'), id: 'base', groupId: 'bracket', combined: true }
    const hole = { ...createNode('cylinder', 'cut'), id: 'hole', groupId: 'bracket', combined: true }
    const unrelated = { ...createNode('sphere'), id: 'unrelated' }
    model = { ...createDocument('Export fixture'), nodes: [base, hole, unrelated] }
    wholeMesh = { positions: new Float32Array([99, 0, 0]), indices: new Uint32Array([0, 0, 0]), triangleCount: 10, volume: 900 }
    selectedMesh = { positions: new Float32Array([12, 0, 0]), indices: new Uint32Array([0, 0, 0]), triangleCount: 4, volume: 120 }
    exportedBlob = new Blob(['selected geometry'], { type: 'application/octet-stream' })
    vi.mocked(evaluateSnapshot).mockResolvedValue(selectedMesh)
    vi.mocked(export3mf).mockReturnValue(exportedBlob)
    vi.mocked(exportStl).mockReturnValue(exportedBlob)
    vi.mocked(exportObj).mockReturnValue(exportedBlob)
    vi.mocked(exportGlb).mockResolvedValue(exportedBlob)
    vi.mocked(exportMultiColor3mf).mockReturnValue(exportedBlob)
    useEditor.setState({
      document: model, selectedNodeId: 'hole', selectedNodeIds: ['hole'],
      mesh: wholeMesh, meshDocument: model, geometryStatus: 'ready', geometryError: null,
      analysis: { status: 'ready', dimensions: { x: 30, y: 20, z: 10 }, volume: 900, triangleCount: 10, issues: [] },
      undoStack: [], redoStack: [], placingNodeId: null, saveStatus: 'saved', saveError: null,
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(<ExportHarness />))
    vi.mocked(evaluateSnapshot).mockClear()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  const downloadButton = () => host.querySelector<HTMLButtonElement>('.export-dialog .dialog-footer button')!
  const scopeSelect = () => host.querySelector<HTMLSelectElement>('[aria-label="Export scope"]')!

  async function chooseSelection() {
    await act(async () => {
      scopeSelect().value = 'selection'
      scopeSelect().dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  async function chooseFormat(title: string) {
    const select=host.querySelector<HTMLSelectElement>('[aria-label="File format"]')!
    const value=title==='Editable backup'?'project':title.toLowerCase()
    await act(async()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))})
  }

  it('evaluates the complete selected group in isolation and downloads its returned mesh', async () => {
    await chooseSelection()
    await act(async () => downloadButton().click())

    expect(evaluateSnapshot).toHaveBeenCalledTimes(1)
    const [snapshot, signal] = vi.mocked(evaluateSnapshot).mock.calls[0]!
    expect(snapshot).not.toBe(model)
    expect(snapshot.nodes.map(node => node.id)).toEqual(['base', 'hole'])
    expect(snapshot.nodes[1]!.boolean).toBe('cut')
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(export3mf).toHaveBeenCalledExactlyOnceWith(selectedMesh, model.name)
    expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(exportedBlob, 'export-fixture-selection.3mf')
    expect(useEditor.getState().document).toBe(model)
    expect(useEditor.getState().mesh).toBe(wholeMesh)
    expect(model.nodes.map(node => node.id)).toEqual(['base', 'hole', 'unrelated'])
    expect(host.querySelector('.export-dialog')?.textContent).toContain('Download requested')
  })

  it('does not download a pending selection after the document changes', async () => {
    const job = pending<MeshPayload>()
    // Resolve even after cancellation to verify the UI also rejects a late result.
    vi.mocked(evaluateSnapshot).mockReturnValueOnce(job.promise)
    await chooseSelection()
    await act(async () => downloadButton().click())
    expect(downloadButton().disabled).toBe(true)
    const signal = vi.mocked(evaluateSnapshot).mock.calls[0]![1]!

    await act(async () => { useEditor.setState({ document: { ...model, revision: model.revision + 1 } }) })
    expect(signal.aborted).toBe(true)
    await act(async () => job.resolve(selectedMesh))

    expect(export3mf).not.toHaveBeenCalled()
    expect(downloadBlob).not.toHaveBeenCalled()
    expect(host.querySelector('.export-dialog')).not.toBeNull()
  })

  it('does not download a pending selection after closing and reopening the dialog', async () => {
    const job = pending<MeshPayload>()
    vi.mocked(evaluateSnapshot).mockReturnValueOnce(job.promise)
    await chooseSelection()
    await act(async () => downloadButton().click())
    const signal = vi.mocked(evaluateSnapshot).mock.calls[0]![1]!

    await act(async () => host.querySelector<HTMLButtonElement>('.export-dialog [aria-label="Close dialog"]')!.click())
    expect(host.querySelector('.export-dialog')).toBeNull()
    expect(signal.aborted).toBe(true)
    await act(async () => host.querySelector<HTMLButtonElement>('.studio-header .studio-primary')!.click())
    expect(host.querySelector('.export-dialog')).not.toBeNull()
    await act(async () => job.resolve(selectedMesh))

    expect(export3mf).not.toHaveBeenCalled()
    expect(downloadBlob).not.toHaveBeenCalled()
    expect(host.querySelector('.download-confirmation')).toBeNull()
    expect(downloadButton().disabled).toBe(false)
  })

  it('does not download a pending evaluation after the selection changes', async () => {
    const job = pending<MeshPayload>()
    vi.mocked(evaluateSnapshot).mockReturnValueOnce(job.promise)
    await chooseSelection()
    await act(async () => downloadButton().click())

    await act(async () => { useEditor.setState({ selectedNodeId: 'unrelated', selectedNodeIds: ['unrelated'] }) })
    await act(async () => job.resolve(selectedMesh))

    expect(export3mf).not.toHaveBeenCalled()
    expect(downloadBlob).not.toHaveBeenCalled()
    expect(host.querySelector('.export-dialog')).not.toBeNull()
  })

  it('does not download when the project changes while asynchronous GLB serialization is pending', async () => {
    const job = pending<Blob>()
    vi.mocked(exportGlb).mockReturnValueOnce(job.promise)
    await chooseSelection()
    await chooseFormat('GLB')
    await act(async () => downloadButton().click())
    expect(exportGlb).toHaveBeenCalledExactlyOnceWith(selectedMesh)

    await act(async () => { useEditor.setState({ document: { ...model, revision: model.revision + 1 } }) })
    await act(async () => job.resolve(exportedBlob))

    expect(downloadBlob).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('changed. Review the new preview')
  })

  it('disables mesh download for a standalone cut selection', async () => {
    const cutter = { ...createNode('cylinder', 'cut'), id: 'standalone-cut' }
    await act(async () => { useEditor.setState({ document: { ...model, nodes: [...model.nodes, cutter] }, selectedNodeId: cutter.id, selectedNodeIds: [cutter.id] }) })
    vi.mocked(evaluateSnapshot).mockClear()
    await chooseSelection()

    expect(downloadButton().disabled).toBe(true)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Holes alone cannot be exported')
    await act(async () => downloadButton().click())
    expect(evaluateSnapshot).not.toHaveBeenCalled()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('backs up the complete editable project even after choosing selected scope', async () => {
    await chooseSelection()
    vi.mocked(evaluateSnapshot).mockClear()
    await chooseFormat('Editable backup')
    expect(scopeSelect().disabled).toBe(true)
    expect(host.querySelector('.export-dialog')?.textContent).toContain('includes the complete project')
    await act(async () => downloadButton().click())

    expect(evaluateSnapshot).not.toHaveBeenCalled()
    expect(export3mf).not.toHaveBeenCalled()
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [backup, filename] = vi.mocked(downloadBlob).mock.calls[0]!
    expect(filename).toBe('export-fixture.forge.json')
    expect(backup.type).toBe('application/json')
    expect(JSON.parse(await readBlob(backup))).toEqual(model)
    expect(useEditor.getState().document).toBe(model)
  })
})
