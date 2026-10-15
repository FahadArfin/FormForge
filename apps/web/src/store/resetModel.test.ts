import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createNode, parseModelDocument, vec3 } from '@formforge/model'
import { useEditor } from './editor'
import { saveProject } from '@/lib/db'

vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(), cancel: vi.fn() } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  const document = createDocument('My enclosure')
  document.nodes[0]!.locked = true
  document.nodes.push({ ...createNode('sphere'), visible: false })
  document.sculptStrokes = [{ id: 'stroke', nodeId: document.nodes[0]!.id, mode: 'add', center: vec3(), radius: 2, strength: .4, createdAt: document.createdAt }]
  document.selectionSets = [{ id: 'set', name: 'Parts', nodeIds: document.nodes.map(n => n.id) }]
  document.namedParameters = [{ id: 'width', name: 'width', expression: '20', value: 20, unit: 'mm' }]
  document.printer = { ...document.printer, name: 'Custom printer' }
  document.printMaterial = { name: 'PETG', density: 1.27, pricePerKg: 25, currency: 'USD', slicerMinutes: 100, slicerGrams: 20, slicerGeometryKey: 'old' }
  useEditor.setState({ document, placingNodeId: null, selectedNodeId: document.nodes[0]!.id, selectedNodeIds: document.nodes.map(n => n.id), undoStack: [], redoStack: [], tool: 'move', buildMode: 'manual', mesh: null, meshDocument: null, parameterErrors: {}, measurement: { start: vec3(), end: vec3(5), complete: true } })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

it('clears all model content including locked shapes as one recoverable edit', () => {
  const original = useEditor.getState().document
  expect(useEditor.getState().resetModel(original)).toBe(true)
  const reset = useEditor.getState()
  expect(reset.document.nodes).toEqual([])
  expect(reset.document.sculptStrokes).toEqual([])
  expect(reset.document.namedParameters).toEqual([])
  expect(reset.document.selectionSets).toBeUndefined()
  expect(reset.document).toMatchObject({ id: original.id, name: original.name, createdAt: original.createdAt, printer: original.printer, revision: original.revision + 1 })
  expect(reset.document.printMaterial).toEqual({ name: 'PETG', density: 1.27, pricePerKg: 25, currency: 'USD' })
  expect(() => parseModelDocument(reset.document)).not.toThrow()
  expect(reset.selectedNodeIds).toEqual([])
  expect(reset.measurement).toBeNull()
  expect(reset.showResult).toBe(false)
  expect(reset.undoStack).toEqual([original])
  useEditor.getState().undo()
  expect(useEditor.getState().document).toBe(original)
  expect(useEditor.getState().showResult).toBe(false)
  useEditor.getState().redo()
  expect(useEditor.getState().document).toBe(reset.document)
})

it('does not clear a changed or switched project using an old confirmation', () => {
  const original = useEditor.getState().document
  const changed = { ...original, name: 'Changed after opening reset' }
  useEditor.setState({ document: changed })
  expect(useEditor.getState().resetModel(original)).toBe(false)
  expect(useEditor.getState().document).toBe(changed)
  expect(useEditor.getState().undoStack).toEqual([])
})

it('does not interrupt unfinished placement', () => {
  const original = useEditor.getState().document
  useEditor.setState({ placingNodeId: original.nodes[0]!.id, tool: 'place' })
  expect(useEditor.getState().resetModel(original)).toBe(false)
  expect(useEditor.getState().document).toBe(original)
})

it('keeps earlier history, clears the redo branch, and persists the empty plate', async () => {
  const original = useEditor.getState().document
  const older = { ...original, name: 'Earlier' }
  useEditor.setState({ undoStack: [older], redoStack: [{ ...original, name: 'Future' }] })
  useEditor.getState().resetModel(original)
  expect(useEditor.getState().undoStack).toEqual([older, original])
  expect(useEditor.getState().redoStack).toEqual([])
  await useEditor.getState().saveNow()
  expect(saveProject).toHaveBeenLastCalledWith(useEditor.getState().document)
})
