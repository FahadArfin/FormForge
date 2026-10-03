import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createNode, vec3 } from '@formforge/model'
import { useEditor } from './editor'
import { nodeWorldBounds } from '@/lib/modelGeometry'
import { saveProject } from '@/lib/db'

vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn() } }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  const first = createNode('box', 'add', vec3(10, 0, 10))
  const second = createNode('box', 'add', vec3(40, 0, 10))
  useEditor.setState({ document: { ...createDocument(), nodes: [first, second] }, selectedNodeId: first.id, selectedNodeIds: [first.id, second.id], tool: 'rotate', placingNodeId: null, undoStack: [], redoStack: [] })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('CAD selection editing', () => {
  it('keeps Rotate active when selecting a different shape', () => {
    useEditor.getState().selectNode(useEditor.getState().document.nodes[1]!.id)
    expect(useEditor.getState().tool).toBe('rotate')
  })
  it('moves every unlocked selected shape in one undo step', () => {
    const before = useEditor.getState().document
    useEditor.getState().translateSelection(vec3(2, -3, 4))
    expect(useEditor.getState().document.nodes.map(node => node.transform.position)).toEqual([vec3(12, -3, 14), vec3(42, -3, 14)])
    expect(useEditor.getState().undoStack).toHaveLength(1)
    useEditor.getState().undo()
    expect(useEditor.getState().document).toEqual(before)
  })
  it('protects locked shapes from numeric edits, sculpting and deletion', () => {
    const node = useEditor.getState().document.nodes[0]!
    useEditor.getState().updateNode(node.id, { locked: true })
    const locked = useEditor.getState().document.nodes[0]!
    useEditor.getState().updateNode(node.id, { transform: { ...node.transform, position: vec3(99, 99, 99) } })
    useEditor.getState().addSculptStroke(vec3(), 'add', 3, 0.5, 'smooth')
    useEditor.getState().removeSelected()
    expect(useEditor.getState().document.nodes).toContainEqual(locked)
    expect(useEditor.getState().document.sculptStrokes).toHaveLength(0)
  })
  it('blocks volume sculpting when a different shape in the evaluated union is locked', () => {
    const [locked, selected] = useEditor.getState().document.nodes
    useEditor.getState().updateNode(locked!.id, { locked: true })
    useEditor.getState().selectNode(selected!.id)
    const before = useEditor.getState().document
    useEditor.getState().addSculptStroke(locked!.transform.position, 'carve', 10, 1, 'smooth')
    expect(useEditor.getState().document).toEqual(before)
    expect(useEditor.getState().notice).toContain('Unlock all shapes')
  })
  it('preserves existing volume strokes when converting a different shape while a shape is locked', () => {
    const [locked, selected] = useEditor.getState().document.nodes
    useEditor.getState().addSculptStroke(vec3(), 'carve', 5, 0.5, 'smooth')
    useEditor.getState().updateNode(locked!.id, { locked: true })
    useEditor.getState().selectNode(selected!.id)
    const before = useEditor.getState().document
    useEditor.getState().makeSculptable(0)
    expect(useEditor.getState().document).toEqual(before)
    expect(useEditor.getState().notice).toContain('Unlock all shapes')
    useEditor.getState().dispatch({ type: 'replace-document', document: { ...before, sculptStrokes: [] } })
    expect(useEditor.getState().document).toEqual(before)
  })
  it('uses selection order to name and preserve the subtraction base', () => {
    const [first, second] = useEditor.getState().document.nodes
    useEditor.setState({ selectedNodeIds: [second!.id, first!.id] })
    useEditor.getState().combineSelected('subtract')
    expect(useEditor.getState().document.nodes.find(node => node.id === second!.id)?.boolean).toBe('add')
    expect(useEditor.getState().document.nodes.find(node => node.id === first!.id)?.boolean).toBe('cut')
    expect(useEditor.getState().document.nodes[0]!.id).toBe(second!.id)
  })
  it('drops a rotated shape using its actual lowest point', () => {
    const node = useEditor.getState().document.nodes[0]!
    useEditor.getState().updateNode(node.id, { transform: { ...node.transform, rotation: vec3(45, 0, 0), scale: vec3(-1, 2, 1) } })
    useEditor.setState({ selectedNodeIds: [node.id] })
    useEditor.getState().dropSelectionToPlate()
    expect(nodeWorldBounds(useEditor.getState().document.nodes[0]!).min.z).toBeCloseTo(0, 5)
  })
  it('starts a capsule on the plate even when its radius exceeds half its height', () => {
    useEditor.getState().addPrimitive('capsule', 'add', { radius: 12, height: 18 })
    expect(nodeWorldBounds(useEditor.getState().document.nodes.at(-1)!).min.z).toBeCloseTo(0, 5)
  })
  it('drops an imported mesh with an off-center origin onto the plate', () => {
    const node = createNode('mesh', 'add', vec3(0, 0, 45))
    node.mesh = { positions: [0, 0, -15, 10, 0, -15, 0, 10, 5], indices: [0, 1, 2] }
    useEditor.setState({ document: { ...useEditor.getState().document, nodes: [node] }, selectedNodeIds: [node.id] })
    useEditor.getState().dropSelectionToPlate()
    expect(nodeWorldBounds(useEditor.getState().document.nodes[0]!).min.z).toBeCloseTo(0, 5)
  })
  it('switching tools finishes the pending shape and Escape cannot delete it later', () => {
    useEditor.getState().addPrimitive('sphere')
    const pending = useEditor.getState().placingNodeId
    useEditor.getState().setTool('rotate')
    useEditor.getState().cancelPlacement()
    expect(useEditor.getState().placingNodeId).toBeNull()
    expect(useEditor.getState().document.nodes.some(node => node.id === pending)).toBe(true)
    expect(useEditor.getState().tool).toBe('rotate')
  })
  it('cancelling placement does not leave a ghost shape in undo history', () => {
    const before = useEditor.getState().document
    useEditor.getState().addPrimitive('sphere')
    useEditor.getState().cancelPlacement()
    expect(useEditor.getState().document).toEqual(before)
    expect(useEditor.getState().undoStack).toHaveLength(0)
  })
  it('sizing a pending shape stays inside its single creation undo step', () => {
    const before = useEditor.getState().document
    useEditor.getState().addPrimitive('box')
    const node = useEditor.getState().document.nodes.at(-1)!
    useEditor.getState().updateNode(node.id, { parameters: { ...node.parameters, width: 55 } })
    useEditor.getState().finishPlacement(node.id, { ...node.transform, position: vec3(25, 10, 9) }, { ...node.parameters, width: 55 })
    expect(useEditor.getState().undoStack).toHaveLength(1)
    useEditor.getState().undo()
    expect(useEditor.getState().document).toEqual(before)
  })
  it('skips locked members while moving the rest of a selection', () => {
    const node = useEditor.getState().document.nodes[0]!
    useEditor.getState().updateNode(node.id, { locked: true })
    useEditor.getState().translateSelection(vec3(5, 0, 0))
    expect(useEditor.getState().document.nodes.map(node => node.transform.position.x)).toEqual([10, 45])
  })
  it('preserves locks when ungrouping or aligning a selection', () => {
    const node = useEditor.getState().document.nodes[1]!
    useEditor.getState().updateNode(node.id, { locked: true })
    const before = useEditor.getState().document
    useEditor.getState().alignSelected('x', 'center')
    expect(useEditor.getState().document).toEqual(before)
  })
  it('returns false for failed persistence and true after a successful retry', async () => {
    vi.mocked(saveProject).mockRejectedValueOnce(new Error('Device is full'))
    expect(await useEditor.getState().saveNow()).toBe(false)
    expect(await useEditor.getState().saveNow()).toBe(true)
  })
})
