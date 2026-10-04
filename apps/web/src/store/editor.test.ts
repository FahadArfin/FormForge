import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createNode, vec3, type MeshPayload } from '@formforge/model'
import { useEditor } from './editor'
import { nodeWorldBounds } from '@/lib/modelGeometry'
import { saveProject } from '@/lib/db'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'

vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn() } }))
vi.mock('@/geometry/evaluateSnapshot', () => ({ evaluateSnapshot: vi.fn() }))
vi.mock('@/lib/db', () => ({ saveProject: vi.fn(async () => undefined), loadMostRecentProject: vi.fn(), deleteProject: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(evaluateSnapshot).mockReset()
  const first = createNode('box', 'add', vec3(10, 0, 10))
  const second = createNode('box', 'add', vec3(40, 0, 10))
  useEditor.setState({ document: { ...createDocument(), nodes: [first, second] }, selectedNodeId: first.id, selectedNodeIds: [first.id, second.id], tool: 'rotate', placingNodeId: null, undoStack: [], redoStack: [], mesh: null, meshDocument: null, geometryStatus: 'idle' })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

const evaluatedMesh = (min: number[], max: number[]): MeshPayload => ({ positions: new Float32Array([...min, ...max]), indices: new Uint32Array([0, 1, 0]), triangleCount: 1, volume: 1 })

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
  it('drops a rotated shape using its actual lowest point', async () => {
    const node = useEditor.getState().document.nodes[0]!
    useEditor.getState().updateNode(node.id, { transform: { ...node.transform, rotation: vec3(45, 0, 0), scale: vec3(-1, 2, 1) } })
    useEditor.setState({ selectedNodeIds: [node.id] })
    vi.mocked(evaluateSnapshot).mockResolvedValue(evaluatedMesh([-14, -27, -16.1629509], [14, 27, 36.1629509]))
    await useEditor.getState().dropSelectionToPlate()
    expect(nodeWorldBounds(useEditor.getState().document.nodes[0]!).min.z).toBeCloseTo(0, 5)
  })
  it('starts a capsule on the plate even when its radius exceeds half its height', () => {
    useEditor.getState().addPrimitive('capsule', 'add', { radius: 12, height: 18 })
    expect(nodeWorldBounds(useEditor.getState().document.nodes.at(-1)!).min.z).toBeCloseTo(0, 5)
  })
  it('drops an imported mesh with an off-center origin onto the plate', async () => {
    const node = createNode('mesh', 'add', vec3(0, 0, 45))
    node.mesh = { positions: [0, 0, -15, 10, 0, -15, 0, 10, 5], indices: [0, 1, 2] }
    useEditor.setState({ document: { ...useEditor.getState().document, nodes: [node] }, selectedNodeIds: [node.id] })
    vi.mocked(evaluateSnapshot).mockResolvedValue(evaluatedMesh([0, 0, 30], [10, 10, 50]))
    await useEditor.getState().dropSelectionToPlate()
    expect(nodeWorldBounds(useEditor.getState().document.nodes[0]!).min.z).toBeCloseTo(0, 5)
  })
  it('preserves rotated and mirrored world placement when restoring disconnected mesh parts', () => {
    const node = createNode('mesh', 'add', vec3(4, -6, 8))
    const tetrahedron = [1, 2, 3, 11, 2, 3, 1, 22, 3, 1, 2, 33]
    const faces = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]
    node.mesh = {
      positions: [...tetrahedron, ...tetrahedron.map((value, index) => value + (index % 3 === 0 ? 20 : 0))],
      indices: [...faces, ...faces.map(index => index + 4)],
    }
    node.transform.rotation = vec3(90, 90, 0)
    node.transform.scale = vec3(-2, 1, 0.5)
    useEditor.getState().importDocument({ ...createDocument(), nodes: [node] })
    const parts = useEditor.getState().document.nodes
    expect(parts).toHaveLength(2)
    const bounds = parts.map(nodeWorldBounds).sort((a, b) => a.min.y - b.min.y)
    expect(bounds[0]!.min.toArray()).toEqual([5.5, -68, 10])
    expect(bounds[0]!.max.toArray()).toEqual([20.5, -48, 30])
    expect(bounds[1]!.min.toArray()).toEqual([5.5, -28, 10])
    expect(bounds[1]!.max.toArray()).toEqual([20.5, -8, 30])
  })
  it('keeps volume strokes and geometry intact when object transforms cannot carry the strokes', () => {
    useEditor.getState().addSculptStroke(vec3(10, 0, 10), 'carve', 3, 0.5, 'smooth')
    const before = useEditor.getState().document
    const undoCount = useEditor.getState().undoStack.length
    useEditor.getState().translateSelection(vec3(5, 0, 0))
    expect(useEditor.getState().document).toBe(before)
    const node = before.nodes[0]!
    useEditor.getState().updateNode(node.id, { transform: { ...node.transform, rotation: vec3(30, 45, 60) } })
    expect(useEditor.getState().document).toBe(before)
    expect(useEditor.getState().undoStack).toHaveLength(undoCount)
    expect(useEditor.getState().notice).toMatch(/volume sculpt/i)
  })
  it('does not discard volume sculpting when converting a source shape to a polygon mesh', () => {
    useEditor.getState().addSculptStroke(vec3(10, 0, 10), 'carve', 3, 0.5, 'smooth')
    const before = useEditor.getState().document
    useEditor.getState().makeSculptable(0)
    expect(useEditor.getState().document).toBe(before)
    expect(useEditor.getState().notice).toMatch(/volume sculpt/i)
  })
  it('does not discard hollowing when converting a source shape to a polygon mesh', () => {
    const node = useEditor.getState().document.nodes[0]!
    useEditor.getState().updateNode(node.id, { surface: { smoothAngle: 0, refineLength: 0, simplifyTolerance: 0, hollowThickness: 2 } })
    const before = useEditor.getState().document
    useEditor.getState().makeSculptable(0)
    expect(useEditor.getState().document).toBe(before)
    expect(useEditor.getState().notice).toMatch(/surface modifier/i)
  })
  it('places a surface-modified assembly using evaluated bounds and one rigid translation', async () => {
    const node = useEditor.getState().document.nodes[0]!
    useEditor.getState().updateNode(node.id, { surface: { smoothAngle: 60, refineLength: 2, simplifyTolerance: 0, hollowThickness: 0 }, transform: { ...node.transform, position: vec3(10, 0, 40) } })
    vi.mocked(evaluateSnapshot).mockResolvedValue(evaluatedMesh([-4, -14, 6], [54, 14, 49]))
    await useEditor.getState().dropSelectionToPlate()
    expect(useEditor.getState().document.nodes.map(node => node.transform.position.z)).toEqual([34, 4])
  })
  it('places a selection as an assembly in one reversible undo step', async () => {
    const second = useEditor.getState().document.nodes[1]!
    useEditor.getState().updateNode(second.id, { transform: { ...second.transform, position: vec3(40, 0, 30) } })
    const before = useEditor.getState().document
    const undoCount = useEditor.getState().undoStack.length
    vi.mocked(evaluateSnapshot).mockResolvedValue(evaluatedMesh([-4, -14, 1], [54, 14, 39]))
    await useEditor.getState().placeOnPlate('selection', 'center-and-drop')
    expect(useEditor.getState().document.nodes.map(node => node.transform.position)).toEqual([vec3(-15, 0, 9), vec3(15, 0, 29)])
    expect(useEditor.getState().undoStack).toHaveLength(undoCount + 1)
    const placed = useEditor.getState().document
    useEditor.getState().undo()
    expect(useEditor.getState().document).toBe(before)
    useEditor.getState().redo()
    expect(useEditor.getState().document).toBe(placed)
  })
  it('uses the current evaluated model to place existing volume sculpting together with its shapes', async () => {
    useEditor.getState().addSculptStroke(vec3(10, 0, 10), 'carve', 3, 0.5, 'smooth')
    const before = useEditor.getState().document
    useEditor.setState({ meshDocument: before, mesh: evaluatedMesh([-4, -14, 1], [54, 14, 19]), geometryStatus: 'ready' })
    await useEditor.getState().placeOnPlate('document', 'center-and-drop')
    expect(useEditor.getState().document.nodes.map(node => node.transform.position)).toEqual([vec3(-15, 0, 9), vec3(15, 0, 9)])
    expect(useEditor.getState().document.sculptStrokes[0]!.center).toEqual(vec3(-15, 0, 9))
  })
  it('does not apply an asynchronous placement result after the document changes', async () => {
    let finish!: (mesh: MeshPayload) => void
    vi.mocked(evaluateSnapshot).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const job = useEditor.getState().placeOnPlate('document', 'drop')
    useEditor.getState().updateNode(useEditor.getState().document.nodes[0]!.id, { name: 'Edited while building' })
    const edited = useEditor.getState().document
    finish(evaluatedMesh([-4, -14, 1], [54, 14, 19]))
    await job
    expect(useEditor.getState().document).toBe(edited)
    expect(useEditor.getState().notice).toMatch(/changed/i)
  })
  it('does not move the previous selection after the selection changes during evaluation', async () => {
    let finish!: (mesh: MeshPayload) => void
    vi.mocked(evaluateSnapshot).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const before = useEditor.getState().document
    const job = useEditor.getState().placeOnPlate('selection', 'drop')
    useEditor.getState().selectNode(before.nodes[1]!.id)
    finish(evaluatedMesh([-4, -14, 1], [54, 14, 19]))
    await job
    expect(useEditor.getState().document).toBe(before)
    expect(useEditor.getState().notice).toMatch(/selection changed/i)
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


describe('new CAD workflow recovery',()=>{
 it('keeps an offset workplane placement above the physical bed',async()=>{
  const {axisWorkplane}=await import('@/lib/workplanes')
  useEditor.setState({document:{...createDocument(),nodes:[],workplane:axisWorkplane('xy',37)}})
  useEditor.getState().addPrimitive('box')
  const n=useEditor.getState().document.nodes[0]!
  useEditor.setState({placingNodeId:n.id})
  useEditor.getState().finishPlacement(n.id,n.transform,n.parameters)
  expect(nodeWorldBounds(useEditor.getState().document.nodes[0]!).min.z).toBeCloseTo(37,5)
 })
 it('keeps the proven mesh when only annotations change',()=>{
  const state=useEditor.getState(),mesh=evaluatedMesh([0,0,0],[1,1,1])
  useEditor.setState({mesh,meshDocument:state.document,geometryStatus:'ready'})
  const next={...state.document,annotations:[],revision:state.document.revision+1}
  state.dispatch({type:'replace-document',document:next})
  expect(useEditor.getState().mesh).toBe(mesh);expect(useEditor.getState().meshDocument).toBe(next)
 })
 it('patterns an entire Boolean group and assigns fresh group scope',()=>{
  const state=useEditor.getState(),nodes=state.document.nodes.map((n,i)=>({...n,combined:true,groupId:'g',boolean:i?'cut' as const:'add' as const}))
  useEditor.setState({document:{...state.document,nodes},selectedNodeIds:[nodes[0]!.id]})
  useEditor.getState().patternSelected('x',2,100)
  const copies=useEditor.getState().document.nodes.slice(2)
  expect(copies).toHaveLength(2);expect(copies[1]!.boolean).toBe('cut');expect(copies[0]!.groupId).not.toBe('g');expect(copies[0]!.groupId).toBe(copies[1]!.groupId)
 })
})

it('keeps a direct template dimension edit after reopening and pauses semantic customization',async()=>{
 const {createStarter}=await import('@/lib/starters'),{templateLinkIssue}=await import('@/lib/templateRecipes'),{resolveDocumentParameterBindings}=await import('@/lib/modelParameters'),{parseModelDocument}=await import('@formforge/model')
 const doc=createStarter('washer'),node=doc.nodes[0]!
 useEditor.setState({document:doc,selectedNodeIds:[node.id],selectedNodeId:node.id})
 useEditor.getState().updateNode(node.id,{parameters:{...node.parameters,radius:20}})
 const edited=useEditor.getState().document;expect(templateLinkIssue(edited)).toMatch(/paused/)
 expect(resolveDocumentParameterBindings(parseModelDocument(edited)).document.nodes[0]!.parameters.radius).toBe(20)
 useEditor.getState().undo();expect(useEditor.getState().document.nodes[0]!.parameters.radius).toBe(15)
})
it('preserves attached cut roles on ungroup and guards recombine and polygon conversion',async()=>{
 const {createAttachedHole}=await import('@/lib/attachedHoles'),{evaluate}=await import('@/geometry/geometry.worker')
 const box=createNode('box');box.combined=true;box.groupId='group';const hole=createAttachedHole(box,'z+',4,0,0,'through',5),doc={...createDocument(),nodes:[box,hole]}
 useEditor.setState({document:doc,selectedNodeIds:[box.id],selectedNodeId:box.id});useEditor.getState().ungroupSelected()
 const ungrouped=useEditor.getState().document;expect(ungrouped.nodes[1]!.boolean).toBe('cut');expect((await evaluate(ungrouped)).volume).toBeGreaterThan(0)
 useEditor.setState({selectedNodeIds:[box.id,hole.id]});useEditor.getState().combineSelected('union');expect(useEditor.getState().document).toBe(ungrouped)
 useEditor.getState().makeSculptable();expect(useEditor.getState().document).toBe(ungrouped)
})

it('renames parameter dependencies in one undoable edit and protects used dimensions from deletion',()=>{
 const s=useEditor.getState(),node=s.document.nodes[0]!,doc={...s.document,nodes:[{...node,parameterBindings:{width:'Width'}}],namedParameters:[{id:'w',name:'Width',expression:'20',value:20,unit:'mm' as const},{id:'h',name:'Half',expression:'Width/2',value:10,unit:'mm' as const}]}
 useEditor.setState({document:doc,undoStack:[],redoStack:[]});useEditor.getState().updateNamedParameter('w',{name:'Outside width',expression:'20',value:20,unit:'mm'})
 expect(useEditor.getState().document.nodes[0]!.parameterBindings!.width).toBe('[Outside width]')
 expect(useEditor.getState().document.namedParameters[1]!.expression).toBe('[Outside width]/2')
 expect(useEditor.getState().undoStack).toEqual([doc]);useEditor.getState().removeNamedParameter('w');expect(useEditor.getState().document.namedParameters).toHaveLength(2)
 useEditor.getState().undo();expect(useEditor.getState().document).toEqual(doc)
})
