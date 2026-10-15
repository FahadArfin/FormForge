// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { ResetModelButton } from './ResetModelButton'

vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(), cancel: vi.fn() } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))
let host: HTMLDivElement, root: Root
const trigger = () => host.querySelector<HTMLButtonElement>('button')!
const dialog = () => document.querySelector('dialog')!
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.useFakeTimers()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const model = createDocument()
  useEditor.setState({ document: model, placingNodeId: null, tool: 'select', undoStack: [], redoStack: [], buildMode: 'manual' })
  useInspection.setState({ focus: { documentId: model.id, ids: [model.nodes[0]!.id], wasResult: false }, section: { enabled: true, axis: 'z', offset: 10, inverted: false } })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })

it('requires confirmation and makes cancel the safe keyboard default', async () => {
  const original = useEditor.getState().document
  await act(async () => root.render(<ResetModelButton active />))
  await act(async () => { trigger().focus(); trigger().click() })
  expect(useEditor.getState().document).toBe(original)
  expect(document.activeElement?.textContent).toBe('Keep editing')
  await act(async () => (document.activeElement as HTMLButtonElement).click())
  expect(document.querySelector('dialog')).toBeNull()
  expect(useEditor.getState().document).toBe(original)
  expect(document.activeElement).toBe(trigger())
})

it('resets on confirmation and clears inspection filters that could hide new shapes', async () => {
  await act(async () => root.render(<ResetModelButton active />))
  await act(async () => trigger().click())
  await act(async () => dialog().querySelector<HTMLButtonElement>('.studio-primary')!.click())
  expect(useEditor.getState().document.nodes).toEqual([])
  expect(useEditor.getState().undoStack).toHaveLength(1)
  expect(useInspection.getState().focus).toBeNull()
  expect(useInspection.getState().section.enabled).toBe(false)
  expect(trigger().disabled).toBe(true)
})

it('dismisses a stale confirmation on project change or navigation away', async () => {
  await act(async () => root.render(<ResetModelButton active />))
  await act(async () => trigger().click())
  await act(async () => useEditor.setState({ document: createDocument('Another project') }))
  expect(document.querySelector('dialog')).toBeNull()
  await act(async () => trigger().click())
  await act(async () => root.render(<ResetModelButton active={false} />))
  expect(document.querySelector('dialog')).toBeNull()
  expect(useEditor.getState().document.nodes).toHaveLength(1)
})

it('disables reset until placement is finished or cancelled', async () => {
  useEditor.setState({ placingNodeId: useEditor.getState().document.nodes[0]!.id, tool: 'place' })
  await act(async () => root.render(<ResetModelButton active />))
  expect(trigger().disabled).toBe(true)
})
