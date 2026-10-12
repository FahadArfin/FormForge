// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createNode, parseModelDocument } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { ParameterPresetExchange } from './ParameterPresetExchange'

vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(() => new Promise(() => undefined)) } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))
const content = JSON.stringify({ format: 'printlab-parameter-presets', version: 1, variants: [{ name: 'Portable large', parameters: [{ name: 'Width', unit: 'mm', value: 30, expression: '15 * 2' }] }] })
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(async () => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  const node = createNode('box'); node.parameterBindings = { width: 'Width' }
  useEditor.setState({ document: { ...createDocument(), nodes: [node], namedParameters: [{ id: 'local-width', name: 'Width', expression: '', unit: 'mm', value: 10 }] }, undoStack: [], redoStack: [], placingNodeId: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<ParameterPresetExchange onClose={() => undefined} />))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent === label)!
async function choose(text: () => Promise<string> = async () => content, size = content.length) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'presets.json', size, text }] })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}
it('requires a preview then atomically adds persisted presets with undo and redo', async () => {
  const before = useEditor.getState().document
  expect(button('Download saved presets').disabled).toBe(true)
  await choose()
  expect(document.body.textContent).toContain('Portable large')
  expect(document.body.textContent).toContain('15 * 2')
  expect(useEditor.getState().document).toBe(before)
  await act(async () => button('Add presets').click())
  const after = useEditor.getState().document
  expect(after.parameterVariants).toHaveLength(1)
  expect(after.parameterVariants![0]!.parameters[0]!.id).toBe('local-width')
  expect(after.nodes).toBe(before.nodes)
  expect(after.namedParameters).toBe(before.namedParameters)
  expect(parseModelDocument(after).parameterVariants).toEqual(after.parameterVariants)
  expect(useEditor.getState().undoStack).toEqual([before])
  await act(async () => useEditor.getState().undo())
  expect(useEditor.getState().document.parameterVariants).toBeUndefined()
  await act(async () => useEditor.getState().redo())
  expect(useEditor.getState().document.parameterVariants).toEqual(after.parameterVariants)
})
it('invalidates a reviewed file after a document edit even when undo restores the same snapshot', async () => {
  const before = useEditor.getState().document
  await choose()
  await act(async () => {
    useEditor.getState().dispatch({ type: 'replace-document', document: { ...before, name: 'Changed', revision: before.revision + 1 } })
    useEditor.getState().undo()
  })
  expect(useEditor.getState().document).toBe(before)
  expect(button('Add presets').disabled).toBe(true)
  expect(document.body.textContent).toMatch(/changed/i)
})
it('captures the project before asynchronous file reading and rejects edits during the read', async () => {
  let finish!: (value: string) => void
  const read = new Promise<string>(resolve => { finish = resolve })
  await choose(() => read)
  const before = useEditor.getState().document
  await act(async () => useEditor.setState({ document: { ...before, id: 'different-project' } }))
  await act(async () => finish(content))
  expect(button('Add presets').disabled).toBe(true)
  expect(useEditor.getState().document.parameterVariants).toBeUndefined()
  expect(document.body.textContent).toMatch(/changed/i)
})
it('retains review on selection-only changes and discards it explicitly on Cancel preview', async () => {
  await choose()
  await act(async () => useEditor.setState({ selectedNodeId: useEditor.getState().document.nodes[0]!.id }))
  expect(button('Add presets').disabled).toBe(false)
  await act(async () => button('Cancel preview').click())
  expect(button('Add presets').disabled).toBe(true)
  expect(useEditor.getState().undoStack).toHaveLength(0)
})
it('rejects an oversized file before reading it and rejects malformed contents without mutation', async () => {
  await choose(async () => { throw new Error('Must not read this file') }, 1024 * 1024 + 1)
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/1 MiB/)
  await choose(async () => '{"bad":true}')
  expect(button('Add presets').disabled).toBe(true)
  expect(useEditor.getState().undoStack).toHaveLength(0)
})

it('ignores a superseded asynchronous read so only the latest file reaches preview', async () => {
  let finish!: (value: string) => void
  await choose(() => new Promise<string>(resolve => { finish = resolve }))
  await choose(async () => content.replace('Portable large', 'Latest preset'))
  await act(async () => finish(content))
  expect(document.querySelector('[aria-label="Preset import preview"]')?.textContent).toContain('Latest preset')
  expect(document.querySelector('[aria-label="Preset import preview"]')?.textContent).not.toContain('Portable large')
})

it('rejects finite formulas that overflow geometry before offering Add presets', async () => {
  await choose(async () => content.replace('15 * 2', '1e100'))
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/range|limit|10 km/)
  expect(button('Add presets').disabled).toBe(true)
  expect(useEditor.getState().document.parameterVariants).toBeUndefined()
  expect(useEditor.getState().undoStack).toHaveLength(0)
})
