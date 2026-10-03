// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { createDocument, createNode } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { ParameterVariants } from './ParameterVariants'
import { captureParameterVariant } from '@/lib/parameterVariants'

vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(() => new Promise(() => undefined)) } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))

it('restoring a valid variant clears stale diagnostics and keeps one undo step', async () => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const node = createNode('box'); node.parameterBindings = { width: 'Width' }
  const valid = { ...createDocument(), nodes: [node], namedParameters: [{ id: 'w', name: 'Width', expression: '', unit: 'mm' as const, value: 20 }] }
  const variant = captureParameterVariant(valid, 'Working')
  const broken = { ...valid, parameterVariants: [variant], namedParameters: valid.namedParameters.map(p => ({ ...p, expression: 'Unknown + 1' })) }
  useEditor.setState({ document: broken, parameterErrors: { parameters: 'Unknown parameter', [`${node.id}:width`]: 'Stale error' }, undoStack: [], redoStack: [], placingNodeId: null })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(<ParameterVariants />))
    const apply = [...host.querySelectorAll('button')].find(button => button.textContent === 'Apply')!
    await act(async () => apply.click())
    expect(useEditor.getState().document.nodes[0]!.parameters.width).toBe(20)
    expect(useEditor.getState().parameterErrors).toEqual({})
    expect(useEditor.getState().undoStack).toEqual([broken])
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Applied')
  } finally { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() }
})
