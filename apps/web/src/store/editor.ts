import { rememberOpenedProject } from '@/lib/projectResume'
import { patternAssembly } from '@/lib/assemblyTools'
import { placeNodeOnWorkplane, planeToWorld, workplaneRotation, workplaneMatrix, value } from '@/lib/workplanes'
import { Vector3 as PlaneVector, Matrix4 as PlaneMatrix, Euler as PlaneEuler, MathUtils as PlaneMath } from 'three'
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  analyzeForPrint,
  createDemoDocument,
  createDocument,
  createNode,
  executeCommand,
  parseModelDocument,
  solveSketchConstraints,
  type MeshPayload,
  type BrushFalloff,
  type ModelCommand,
  type ModelDocument,
  type ModelNode,
  type PrintAnalysis,
  type ParameterBindingTarget,
  type ParameterDefinition,
  type PrimitiveKind,
  type ToolMode,
  type Vec3Value,
  vec3,
} from '@formforge/model'
import { geometryClient } from '@/geometry/client'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'
import { deleteProject as deleteSavedProject, loadMostRecentProject, saveProject } from '@/lib/db'
import { createProjectPersistence, type ProjectSaveState } from '@/lib/projectPersistence'
import { hasSurfaceModifiers, makeSourceGeometry, nodeWorldBounds } from '@/lib/modelGeometry'
import { modelPointToWorld } from '@/lib/modelTransforms'
import { getPlatePlacementTarget, placeDocumentFromMesh, type PlatePlacementAction, type PlatePlacementScope } from '@/lib/platePlacement'
import { repairMesh } from '@/lib/meshTools'
import { geometryToSculptMesh, subdivideMesh, type SculptMesh } from '@/lib/polygonSculpt'
import { resolveDocumentParameterBindings } from '@/lib/modelParameters'
import {
  convertSelection,
  deleteFacesSafe,
  dissolveVertexSafe,
  extrudeFaces,
  extractMeshTopology,
  growSelection,
  insetFace,
  selectBoundary,
  selectEdgeLoop,
  selectLinked,
  shortestComponentPath,
  shrinkSelection,
  splitMeshIntoConnectedComponents,
  transformSelectedVertices,
  type ComponentMode,
  type ComponentSelection,
  type SoftSelectionDistance,
  type SoftSelectionFalloff,
  type VertexTransform,
} from '@/lib/componentMesh'

type GeometryStatus = 'idle' | 'building' | 'ready' | 'error'
export type DisplayMode = 'solid' | 'wireframe' | 'vertices'
export type ProfileOperation = 'extrude' | 'revolve'
export type Measurement = { start: Vec3Value; end: Vec3Value; complete: boolean }
export type MeshComponentMode = 'object' | 'vertex' | 'edge' | 'face'
export type ProfileRecipePlacement = {
  points: NonNullable<ModelNode['profile']>
  settings: NonNullable<ModelNode['profileSettings']>
}

interface EditorState extends ProjectSaveState {
  document: ModelDocument
  selectedNodeId: string | null
  selectedNodeIds: string[]
  tool: ToolMode
  showResult: boolean
  showGrid: boolean
  showReferencePlanes: boolean
  xrayEnabled: boolean
  displayMode: DisplayMode
  placingNodeId: string | null
  profileOperation: ProfileOperation
  measurement: Measurement | null
  meshComponentMode: MeshComponentMode
  selectedMeshVertices: number[]
  selectedMeshEdges: number[]
  selectedMeshFaces: number[]
  softSelectionRadius: number
  softSelectionDistance: SoftSelectionDistance
  softSelectionFalloff: SoftSelectionFalloff
  parameterErrors: Readonly<Record<string, string>>
  translationSnap: number | null
  rotationSnap: number
  scaleSnap: number
  brushRadius: number
  brushStrength: number
  brushFalloff: BrushFalloff
  brushSpacing: number
  brushSymmetryX: boolean
  brushSymmetryY: boolean
  brushSymmetryZ: boolean
  brushFrontFacesOnly: boolean
  dynamicTopology: boolean
  sculptDetail: number
  geometryStatus: GeometryStatus
  geometryBusyVisible: boolean
  geometryError: string | null
  mesh: MeshPayload | null
  meshDocument: ModelDocument | null
  analysis: PrintAnalysis | null
  undoStack: ModelDocument[]
  redoStack: ModelDocument[]
  notice: string | null
  hydrated: boolean
  dispatch: (command: ModelCommand, remember?: boolean, rebuildGeometry?: boolean) => void
  addPrimitive: (kind: PrimitiveKind, boolean?: ModelNode['boolean'], parameters?: Partial<ModelNode['parameters']>) => void
  updateNode: (nodeId: string, patch: Partial<Omit<ModelNode, 'id' | 'createdAt'>>, remember?: boolean) => void
  selectAll: () => void
  translateSelection: (delta: Vec3Value) => void
  updateSelectionTransforms: (updates: { id: string; transform: ModelNode['transform'] }[]) => void
  dropSelectionToPlate: () => Promise<void>
  placeOnPlate: (scope: PlatePlacementScope, action: PlatePlacementAction) => Promise<void>
  selectNode: (id: string | null, additive?: boolean) => void
  combineSelected: (mode: 'union' | 'subtract' | 'intersect' | 'hull') => void
  ungroupSelected: () => void
  setTool: (tool: ToolMode) => void
  setShowResult: (show: boolean) => void
  setShowGrid: (show: boolean) => void
  setShowReferencePlanes: (show: boolean) => void
  setXrayEnabled: (show: boolean) => void
  setDisplayMode: (mode: DisplayMode) => void
  setTranslationSnap: (value: number | null) => void
  setRotationSnap: (value: number) => void
  setScaleSnap: (value: number) => void
  setBrushSetting: (patch: Partial<Pick<EditorState, 'brushRadius' | 'brushStrength' | 'brushFalloff' | 'brushSpacing' | 'brushSymmetryX' | 'brushSymmetryY' | 'brushSymmetryZ' | 'brushFrontFacesOnly' | 'dynamicTopology' | 'sculptDetail'>>) => void
  finishPlacement: (nodeId: string, transform: ModelNode['transform'], parameters: ModelNode['parameters']) => void
  cancelPlacement: () => void
  beginProfileDrawing: (operation?: ProfileOperation) => void
  finishProfileDrawing: (points: { x: number; y: number }[]) => void
  addProfileRecipe: (recipe: ProfileRecipePlacement, operation?: ProfileOperation) => void
  setMeasurement: (measurement: Measurement | null) => void
  setMeshComponentMode: (mode: MeshComponentMode) => void
  selectMeshComponent: (kind: Exclude<MeshComponentMode, 'object'>, id: number, additive?: boolean) => void
  setMeshComponentSelection: (selection: { vertices?: number[]; edges?: number[]; faces?: number[] }) => void
  clearMeshComponentSelection: () => void
  setSoftSelectionRadius: (radius: number) => void
  setComponentEditSetting: (patch: Partial<Pick<EditorState, 'softSelectionRadius' | 'softSelectionDistance' | 'softSelectionFalloff'>>) => void
  selectAllMeshComponents: () => void
  convertMeshComponentSelection: (mode: ComponentMode, strategy?: 'contained' | 'touching') => void
  growMeshComponentSelection: () => void
  shrinkMeshComponentSelection: () => void
  selectLinkedMeshComponents: () => void
  selectMeshBoundary: () => void
  selectMeshShortestPath: () => void
  selectMeshEdgeLoop: () => void
  transformMeshComponents: (transform: VertexTransform) => void
  translateMeshComponents: (delta: Vec3Value) => void
  extrudeSelectedFaces: (distance: number) => void
  insetSelectedFace: (amount: number) => void
  deleteSelectedMeshComponents: () => void
  dissolveSelectedVertex: () => void
  addNamedParameter: () => void
  updateNamedParameter: (id: string, patch: Partial<Omit<ParameterDefinition, 'id'>>) => void
  removeNamedParameter: (id: string) => void
  setNodeParameterBinding: (nodeId: string, target: ParameterBindingTarget, expression: string) => void
  importMesh: (name: string, mesh: NonNullable<ModelNode['mesh']>) => void
  mirrorSelected: (axis: 'x' | 'y' | 'z') => void
  patternSelected: (axis: 'x' | 'y' | 'z', count: number, spacing: number) => void
  polarPatternSelected: (axis: 'x' | 'y' | 'z', count: number, degrees: number, radius: number) => void
  alignSelected: (axis: 'x' | 'y' | 'z', alignment: 'min' | 'center' | 'max') => void
  distributeSelected: (axis: 'x' | 'y' | 'z') => void
  moveFeature: (nodeId: string, direction: -1 | 1) => void
  repairSelectedMesh: () => void
  makeSculptable: (subdivisionLevels?: number) => void
  commitPolygonSculpt: (nodeId: string, mesh: SculptMesh) => void
  subdivideSelectedMesh: () => void
  clearSculptMask: () => void
  invertSculptMask: () => void
  undo: () => void
  redo: () => void
  removeSelected: () => void
  duplicateSelected: () => void
  setNotice: (notice: string | null) => void
  addSculptStroke: (center: Vec3Value, mode: 'add' | 'carve' | 'smooth' | 'inflate' | 'pinch' | 'flatten', radius: number, strength: number, falloff: BrushFalloff, normal?: Vec3Value, remember?: boolean) => void
  newDocument: () => void
  loadDemo: () => void
  importDocument: (value: unknown) => void
  hydrate: () => Promise<void>
  saveNow: () => Promise<boolean>
  deleteProject: (projectId: string) => Promise<void>
  rebuild: () => Promise<void>
}

let rebuildTimer: ReturnType<typeof setTimeout> | null = null
let busyTimer: ReturnType<typeof setTimeout> | null = null
let rebuildGeneration = 0
let placementController: AbortController | null = null

function splitDisconnectedMeshNode(node: ModelNode): ModelNode[] {
  if (node.kind !== 'mesh' || !node.mesh || node.text || node.combined || node.groupId) return [node]
  const components = splitMeshIntoConnectedComponents(node.mesh)
  if (components.length <= 1) return [node]
  return components.map((component, index) => {
    return {
      ...structuredClone(node),
      id: index === 0 ? node.id : nanoid(),
      name: `${node.name} part ${index + 1}`,
      mesh: component.mesh,
      transform: {
        ...structuredClone(node.transform),
        position: modelPointToWorld(component.center, node.transform),
      },
      combined: false,
      groupId: undefined,
      groupOperation: undefined,
      createdAt: index === 0 ? node.createdAt : new Date().toISOString(),
    }
  })
}

function separateDisconnectedMeshNodes(document: ModelDocument) {
  let separatedParts = 0
  const nodes = document.nodes.flatMap((node) => {
    const parts = splitDisconnectedMeshNode(node)
    if (parts.length > 1) separatedParts += parts.length
    return parts
  })
  if (!separatedParts) return { document, separatedParts }
  const updatedAt = new Date().toISOString()
  return {
    document: { ...document, nodes, revision: document.revision + 1, updatedAt },
    separatedParts,
  }
}

export const useEditor = create<EditorState>((set, get) => {
  let hydrationPromise: Promise<void> | null = null
  const persistence = createProjectPersistence(saveProject, (document, state) => {
    if (get().document === document) set(state)
    else if (state.saveStatus === 'error' && get().document.id !== document.id) {
      set({ notice: `Could not save “${document.name || 'Untitled project'}” on this device: ${state.saveError}` })
    }
  })
  const resetDocumentTransientState = {
    tool: 'select' as const, placingNodeId: null, measurement: null, profileOperation: 'extrude' as const,
    mesh: null, meshDocument: null, analysis: null, geometryStatus: 'idle' as const,
    geometryBusyVisible: false, geometryError: null, showResult: true,
  }

  const scheduleSideEffects = (rebuildGeometry = true) => {
    if (rebuildGeometry) {
      if (rebuildTimer) clearTimeout(rebuildTimer)
      rebuildTimer = setTimeout(() => void get().rebuild(), 90)
    }
    persistence.schedule(get().document)
  }

  const commitParameterizedDocument = (draft: ModelDocument, notice?: string) => {
    const previous = get().document
    const touched = {
      ...draft,
      revision: previous.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    const resolved = resolveDocumentParameterBindings(touched)
    get().dispatch({ type: 'replace-document', document: resolved.document }, true, true)
    if (get().document !== resolved.document) return
    set({ parameterErrors: resolved.errors, ...(notice ? { notice } : {}) })
  }

  const activeComponentSelection = (): ComponentSelection | null => {
    const state = get()
    if (state.meshComponentMode === 'object') return null
    const indices = state.meshComponentMode === 'vertex'
      ? state.selectedMeshVertices
      : state.meshComponentMode === 'edge' ? state.selectedMeshEdges : state.selectedMeshFaces
    return { mode: state.meshComponentMode, indices: new Set(indices) }
  }

  const setComponentSelection = (selection: ComponentSelection) => {
    set({
      meshComponentMode: selection.mode,
      selectedMeshVertices: selection.mode === 'vertex' ? [...selection.indices] : [],
      selectedMeshEdges: selection.mode === 'edge' ? [...selection.indices] : [],
      selectedMeshFaces: selection.mode === 'face' ? [...selection.indices] : [],
    })
  }

  return {
    document: createDocument(),
    selectedNodeId: null,
    selectedNodeIds: [],
    tool: 'select',
    showResult: true,
    showGrid: true,
    showReferencePlanes: false,
    xrayEnabled: false,
    displayMode: 'solid',
    placingNodeId: null,
    profileOperation: 'extrude',
    measurement: null,
    meshComponentMode: 'object',
    selectedMeshVertices: [],
    selectedMeshEdges: [],
    selectedMeshFaces: [],
    softSelectionRadius: 0,
    softSelectionDistance: 'surface',
    softSelectionFalloff: 'smooth',
    parameterErrors: {},
    translationSnap: 1,
    rotationSnap: 15,
    scaleSnap: 0.1,
    brushRadius: 4,
    brushStrength: 0.35,
    brushFalloff: 'smooth',
    brushSpacing: 0.35,
    brushSymmetryX: false,
    brushSymmetryY: false,
    brushSymmetryZ: false,
    brushFrontFacesOnly: true,
    dynamicTopology: true,
    sculptDetail: 0.45,
    geometryStatus: 'idle',
    geometryBusyVisible: false,
    geometryError: null,
    mesh: null,
    meshDocument: null,
    analysis: null,
    undoStack: [],
    redoStack: [],
    notice: null,
    hydrated: false,
    saveStatus: 'saving',
    saveError: null,
    lastSavedAt: null,

    dispatch(command, remember = true, rebuildGeometry = true) {
      if (command.type === 'add-sculpt-stroke' && get().document.nodes.some(node => node.locked && !node.suppressed)) { set({ notice: 'Unlock all shapes before volume sculpting. Volume brushes affect the combined model.' }); return }
      if (get().placingNodeId) {
        if (command.type === 'update-node' && command.nodeId === get().placingNodeId) remember = false
        else set({ placingNodeId: null, ...(get().tool === 'place' ? { tool: 'move' as const } : {}) })
      }
      const previous = get().document
      if(command.type==='update-node'&&command.patch.mesh&&!Object.hasOwn(command.patch,'text')) {
        const nodeId=command.nodeId;const original=previous.nodes.find(n=>n.id===nodeId)
        if(original?.text&&(command.patch.mesh.positions!==original.mesh?.positions||command.patch.mesh.indices!==original.mesh?.indices)) command={...command,patch:{...command.patch,text:undefined}}
      }
      const next = executeCommand(previous, command)
      const retainsWorldStrokes = previous.sculptStrokes.length > 0 && JSON.stringify(previous.sculptStrokes) === JSON.stringify(next.sculptStrokes)
      if (retainsWorldStrokes && previous.nodes.some(node => {
        const changed = next.nodes.find(candidate => candidate.id === node.id)
        return changed && JSON.stringify(changed.transform) !== JSON.stringify(node.transform)
      })) {
        set({ notice: 'Object transforms cannot carry existing volume sculpting. Export and reimport the evaluated model to bake it before moving, rotating, or scaling parts.' })
        return
      }
      if (previous.sculptStrokes !== next.sculptStrokes && JSON.stringify(previous.sculptStrokes) !== JSON.stringify(next.sculptStrokes) && previous.nodes.some(node => node.locked && !node.suppressed)) {
        set({ notice: 'Unlock all shapes before changing volume sculpting. These changes affect the combined model.' })
        return
      }
      const unlockOrVisibility = command.type === 'update-node' && Object.keys(command.patch).every(key => key === 'locked' || key === 'visible')
      const changedLocked = previous.nodes.some(node => node.locked && (
        (!unlockOrVisibility && next.nodes.find(candidate => candidate.id === node.id) !== node && JSON.stringify(next.nodes.find(candidate => candidate.id === node.id)) !== JSON.stringify(node))
        || (command.type === 'add-sculpt-stroke' && command.stroke.nodeId === node.id)
      ))
      if (changedLocked) { set({ notice: 'Unlock the selected shape before editing it.' }); return }
      if (command.type === 'replace-nodes' && next.nodes.length === previous.nodes.length && next.nodes.every((node, index) => node === previous.nodes[index])) return
      if (command.type === 'update-node') {
        const before = previous.nodes.find(node => node.id === command.nodeId)
        if (!before || Object.entries(command.patch).every(([key, value]) => JSON.stringify(before[key as keyof ModelNode]) === JSON.stringify(value))) return
      }
      // Preserve a proven mesh for metadata and sculpt-mask changes that skip evaluation.
      const previousNode = command.type === 'update-node' ? previous.nodes.find((node) => node.id === command.nodeId) : undefined
      const visualKeys = new Set(['name', 'color', 'materialId', 'materialSlot', 'locked', 'visible'])
      const metadataOnly = command.type==='replace-document' && next.id===previous.id && next.nodes===previous.nodes && next.sculptStrokes===previous.sculptStrokes && next.printer===previous.printer && next.namedParameters===previous.namedParameters
      if(metadataOnly) rebuildGeometry=false
      const geometryNeutral = metadataOnly || command.type === 'update-node' && Object.keys(command.patch).every((key) => visualKeys.has(key)
        || (key === 'mesh' && command.patch.mesh?.positions === previousNode?.mesh?.positions && command.patch.mesh?.indices === previousNode?.mesh?.indices))
      const canReuseMesh = !rebuildGeometry && geometryNeutral && get().meshDocument === previous
      set((state) => ({
        document: next,
        ...(canReuseMesh ? { meshDocument: next, geometryStatus: 'ready' as const, geometryBusyVisible: false } : {}),
        undoStack: remember ? [...state.undoStack.slice(-49), previous] : state.undoStack,
        redoStack: remember ? [] : state.redoStack,
      }))
      // A metadata edit during an unfinished build still needs a new snapshot evaluated.
      scheduleSideEffects(rebuildGeometry || (geometryNeutral && !canReuseMesh))
    },

    addPrimitive(kind, boolean = 'add', parameters) {
      if (get().placingNodeId) get().cancelPlacement()
      const node = createNode(kind, boolean, vec3())
      node.parameters = { ...node.parameters, ...parameters }
      node.transform.position.z -= nodeWorldBounds(node).min.z
      Object.assign(node.transform, placeNodeOnWorkplane(node, get().document.workplane, {x:0,y:0}).transform)
      get().dispatch({ type: 'add-node', node }, true, false)
      set({ selectedNodeId: node.id, selectedNodeIds: [node.id], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], placingNodeId: node.id, tool: 'place', showResult: false, notice: `Click to place or drag to resize the ${node.name.toLowerCase()}.` })
    },

    updateNode(nodeId, patch, remember = true) {
      const visualOnlyKeys = new Set(['name', 'color', 'materialId', 'materialSlot', 'locked', 'visible'])
      const needsGeometry = Object.keys(patch).some((key) => !visualOnlyKeys.has(key))
      get().dispatch({ type: 'update-node', nodeId, patch }, remember, needsGeometry)
    },
    selectAll() {
      const ids = get().document.nodes.filter(node => node.visible && !node.suppressed).map(node => node.id)
      set({ selectedNodeIds: ids, selectedNodeId: ids.at(-1) ?? null, showResult: false, placingNodeId: null, ...(get().tool === 'place' ? { tool: 'move' as const } : {}) })
    },
    updateSelectionTransforms(updates) {
      const patches = new Map(updates.filter(({ transform }) => Object.values(transform).every(vector => Object.values(vector).every(Number.isFinite)) && Object.values(transform.scale).every(value => Math.abs(value) >= 0.0001)).map(update => [update.id, update.transform]))
      const nodes = get().document.nodes.map(node => !node.locked && patches.has(node.id) && JSON.stringify(patches.get(node.id)) !== JSON.stringify(node.transform) ? { ...node, transform: patches.get(node.id)! } : node)
      get().dispatch({ type: 'replace-nodes', nodes })
    },
    translateSelection(delta) {
      get().updateSelectionTransforms(get().document.nodes.filter(node => get().selectedNodeIds.includes(node.id) && !node.locked).map(node => ({ id: node.id, transform: { ...node.transform, position: { x: node.transform.position.x + delta.x, y: node.transform.position.y + delta.y, z: node.transform.position.z + delta.z } } })))
    },
    dropSelectionToPlate() {
      return get().placeOnPlate('selection', 'drop')
    },
    async placeOnPlate(scope, action) {
      placementController?.abort()
      const controller = new AbortController()
      placementController = controller
      const state = get()
      const document = state.document
      const selectedIds = [...state.selectedNodeIds]
      try {
        if (state.placingNodeId) throw new Error('Finish placing the current shape before moving the model to the plate.')
        const target = getPlatePlacementTarget(document, selectedIds, scope)
        set({ notice: 'Checking the evaluated solid for plate placement…' })
        const mesh = target.movesWholeDocument && state.geometryStatus === 'ready' && state.meshDocument === document && state.mesh
          ? state.mesh
          : await evaluateSnapshot(target.evaluationDocument, controller.signal)
        if (controller.signal.aborted) return
        if (get().document !== document) { set({ notice: 'The model changed during placement. Try again with the current model.' }); return }
        if (scope === 'selection' && JSON.stringify(get().selectedNodeIds) !== JSON.stringify(selectedIds)) { set({ notice: 'The selection changed during placement. Try again with the current selection.' }); return }
        const next = placeDocumentFromMesh(document, target, mesh, action)
        if (!next) { set({ notice: 'The model is already in that plate position.' }); return }
        get().dispatch({ type: 'replace-document', document: next })
        if (get().document !== next) return
        set({ notice: `${scope === 'document' ? 'Whole model' : 'Selection and its grouped parts'} ${action === 'center' ? 'centered on the plate' : action === 'drop' ? 'dropped to the plate' : 'centered and dropped to the plate'}. Relative part positions were preserved.` })
      } catch (error) {
        if (!controller.signal.aborted) set({ notice: error instanceof Error ? error.message : 'The model could not be placed on the plate.' })
      } finally {
        if (placementController === controller) placementController = null
      }
    },
    selectNode(id, additive = false) {
      if (get().placingNodeId) set({ placingNodeId: null, ...(get().tool === 'place' ? { tool: 'move' as const } : {}) })
      if (!id) { set({ selectedNodeId: null, selectedNodeIds: [], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [] }); return }
      if (!additive) {
        const changed = get().selectedNodeId !== id
        set({
          selectedNodeId: id,
          selectedNodeIds: [id],
          tool: get().tool === 'place' ? 'move' : get().tool,
          placingNodeId: null,
          showResult: false,
          ...(changed ? { meshComponentMode: 'object' as const, selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [] } : {}),
        })
        return
      }
      const current = get().selectedNodeIds
      const selectedNodeIds = current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]
      set({ selectedNodeIds, selectedNodeId: selectedNodeIds.includes(id) ? id : selectedNodeIds.at(-1) ?? null })
    },
    combineSelected(mode) {
      const selectedIds = get().selectedNodeIds
      if (selectedIds.length < 2) { set({ notice: 'Select at least two shapes to combine.' }); return }
      const selected = selectedIds.map(id => get().document.nodes.find(node => node.id === id)).filter((node): node is ModelNode => Boolean(node))
      if (selected.some(node => node.locked)) { set({ notice: 'Unlock selected shapes before combining them.' }); return }
      if (new Set(selected.map(node => JSON.stringify(node.assemblyPath ?? []))).size > 1) { set({ notice: 'Combine shapes within the same inserted assembly. Convert assemblies to meshes before combining across their boundaries.' }); return }
      const groupId = nanoid()
      const nodes = get().document.nodes.map((node) => {
        const index = selected.findIndex((candidate) => candidate.id === node.id)
        if (index < 0) return node
        const boolean: ModelNode['boolean'] = index === 0 || mode === 'union' || mode === 'hull' ? 'add' : mode === 'subtract' ? 'cut' : 'intersect'
        return { ...node, boolean, combined: true, groupId, groupOperation: mode === 'hull' ? 'hull' as const : 'boolean' as const }
      })
      const groupNodes = selected.map(node => nodes.find(candidate => candidate.id === node.id)!)
      const firstIndex = nodes.findIndex(node => selectedIds.includes(node.id))
      const orderedNodes = nodes.filter(node => !selectedIds.includes(node.id))
      orderedNodes.splice(firstIndex, 0, ...groupNodes)
      get().dispatch({ type: 'replace-nodes', nodes: orderedNodes })
      set({ selectedNodeId: selected[0]?.id ?? null, selectedNodeIds: selected.map((node) => node.id), showResult: true, notice: `${mode === 'union' ? 'Union' : mode === 'subtract' ? 'Subtract' : mode === 'hull' ? 'Convex hull' : 'Intersection'} created. Ungroup to edit the parts separately.` })
    },
    ungroupSelected() {
      const selectedGroups = new Set(get().document.nodes.filter((node) => get().selectedNodeIds.includes(node.id)).map((node) => node.groupId).filter(Boolean))
      if (!selectedGroups.size) { set({ notice: 'The selection is not a combined group.' }); return }
      const nodes = get().document.nodes.map((node) => selectedGroups.has(node.groupId) ? { ...node, boolean: 'add' as const, combined: false, groupId: undefined, groupOperation: undefined } : node)
      get().dispatch({ type: 'replace-nodes', nodes })
      set({ showResult: false, notice: 'Group separated into editable shapes.' })
    },
    setTool(tool) {
      if ((tool === 'sculpt-add' || tool === 'sculpt-carve') && get().document.nodes.some(node => node.locked && !node.suppressed)) { set({ notice: 'Unlock all shapes before volume sculpting. Volume brushes affect the combined model.' }); return }
      if (tool !== 'place' && get().placingNodeId) set({ placingNodeId: null })
      const polygonTools: ToolMode[] = ['sculpt-draw', 'sculpt-clay', 'sculpt-smooth', 'sculpt-inflate', 'sculpt-pinch', 'sculpt-flatten', 'sculpt-crease', 'sculpt-grab', 'sculpt-snake', 'sculpt-relax', 'sculpt-mask']
      const selected = get().document.nodes.find((node) => node.id === get().selectedNodeId)
      if (tool.startsWith('sculpt') && selected?.locked) { set({ notice: 'Unlock the selected shape before sculpting.' }); return }
      if (polygonTools.includes(tool) && selected?.kind !== 'mesh') {
        set({ notice: 'Start Polygon Sculpt first to turn the visible model into an editable mesh.' })
        return
      }
      set({ tool, showResult: polygonTools.includes(tool) ? false : tool === 'sculpt-add' || tool === 'sculpt-carve' ? true : get().showResult })
    },
    setShowResult(showResult) { set({ showResult }) },
    setShowGrid(showGrid) { set({ showGrid }) },
    setShowReferencePlanes(showReferencePlanes) { set({ showReferencePlanes }) },
    setXrayEnabled(xrayEnabled) { set({ xrayEnabled }) },
    setDisplayMode(displayMode) { set({ displayMode }) },
    setTranslationSnap(translationSnap) { set({ translationSnap }) },
    setRotationSnap(rotationSnap) { set({ rotationSnap: Math.max(0, rotationSnap) }) },
    setScaleSnap(scaleSnap) { set({ scaleSnap: Math.max(0, scaleSnap) }) },
    setBrushSetting(patch) { set(patch) },

    finishPlacement(nodeId, transform, parameters) {
      if (get().placingNodeId !== nodeId) return
      const node = get().document.nodes.find(candidate => candidate.id === nodeId)
      if (!node) return
      const placed = { ...node, transform, parameters }
      const grounded = { ...transform, position: { ...transform.position, z: transform.position.z - nodeWorldBounds(placed).min.z } }
      get().updateNode(nodeId, { transform: get().document.workplane ? transform : grounded, parameters }, false)
      set({ placingNodeId: null, tool: 'move', notice: 'Shape placed. Drag the handles or enter exact values.' })
    },

    cancelPlacement() {
      const nodeId = get().placingNodeId
      if (!nodeId) return
      const beforePlacement = get().undoStack.at(-1)
      if (beforePlacement && !beforePlacement.nodes.some(node => node.id === nodeId)) {
        set({ document: beforePlacement, undoStack: get().undoStack.slice(0, -1) })
        scheduleSideEffects()
      } else get().dispatch({ type: 'remove-node', nodeId }, false)
      set({ placingNodeId: null, selectedNodeId: null, selectedNodeIds: [], tool: 'select', notice: 'Placement cancelled.' })
    },

    beginProfileDrawing(profileOperation = 'extrude') {
      if (get().placingNodeId) get().cancelPlacement()
      set({ tool: 'draw-profile', profileOperation, showResult: false, selectedNodeId: null, selectedNodeIds: [], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], placingNodeId: null, notice: `Click points on the plane. Hold Shift for horizontal/vertical edges, then click the first point or press Enter to ${profileOperation}.` })
    },

    finishProfileDrawing(points) {
      if (points.length < 3) { set({ notice: 'A profile needs at least three points.' }); return }
      const operation = get().profileOperation
      const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 })
      const minX = Math.min(...points.map((point) => point.x))
      const node = createNode(operation, 'add', operation === 'revolve' ? vec3(minX, center.y, 0) : vec3(center.x, center.y, 5))
      node.name = operation === 'revolve' ? 'Revolved profile' : 'Extruded profile'
      node.parameters.height = 10
      node.profile = operation === 'revolve'
        ? points.map((point) => ({ x: point.x - minX, y: point.y - center.y }))
        : points.map((point) => ({ x: point.x - center.x, y: point.y - center.y }))
      node.profileSettings = { curveMode: 'polyline', cornerRadius: 0, offset: 0, tension: 0.5, resolution: 8 }
      const constraints: NonNullable<ModelNode['profileConstraints']> = []
      points.forEach((point, index) => {
        const next = points[(index + 1) % points.length]!
        if (Math.abs(point.y - next.y) < 0.0001) constraints.push({ type: 'horizontal', a: index, b: (index + 1) % points.length })
        else if (Math.abs(point.x - next.x) < 0.0001) constraints.push({ type: 'vertical', a: index, b: (index + 1) % points.length })
      })
      node.profileConstraints = constraints
      node.profile = solveSketchConstraints(node.profile, constraints).points
      const wp=get().document.workplane
      node.transform.position=value(planeToWorld(new PlaneVector(operation==='revolve'?minX:center.x,center.y,operation==='revolve'?0:5),wp))
      if(operation==='revolve') {
        const e=new PlaneEuler().setFromRotationMatrix(workplaneMatrix(wp).multiply(new PlaneMatrix().makeRotationX(-Math.PI/2)))
        node.transform.rotation={x:PlaneMath.radToDeg(e.x),y:PlaneMath.radToDeg(e.y),z:PlaneMath.radToDeg(e.z)}
      } else node.transform.rotation=workplaneRotation(wp)
      get().dispatch({ type: 'add-node', node })
      set({ selectedNodeId: node.id, selectedNodeIds: [node.id], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], tool: 'move', notice: operation === 'revolve' ? 'Profile revolved around its left edge. Adjust its segment quality in Properties.' : 'Profile extruded. Change its height in Properties.' })
    },

    addProfileRecipe(recipe, operation = 'extrude') {
      if (get().placingNodeId) get().cancelPlacement()
      if (recipe.points.length < 3) { set({ notice: 'A recipe needs at least three outline points.' }); return }
      const minX = Math.min(...recipe.points.map((point) => point.x))
      const maxX = Math.max(...recipe.points.map((point) => point.x))
      const minY = Math.min(...recipe.points.map((point) => point.y))
      const maxY = Math.max(...recipe.points.map((point) => point.y))
      const outlineHeight = Math.max(0.1, maxY - minY)
      const node = createNode(operation, 'add', vec3(0, 0, operation === 'extrude' ? 5 : outlineHeight / 2))
      node.name = operation === 'revolve' ? 'Revolved profile recipe' : 'Profile recipe'
      node.parameters.height = operation === 'extrude' ? 10 : outlineHeight
      node.profile = operation === 'revolve'
        ? recipe.points.map((point) => ({ x: point.x - minX, y: point.y - (minY + maxY) / 2 }))
        : recipe.points.map((point) => ({ x: point.x - (minX + maxX) / 2, y: point.y - (minY + maxY) / 2 }))
      node.profileSettings = { ...recipe.settings }
      node.profileConstraints = []
      get().dispatch({ type: 'add-node', node }, true, false)
      set({
        selectedNodeId: node.id,
        selectedNodeIds: [node.id],
        meshComponentMode: 'object',
        selectedMeshVertices: [],
        selectedMeshEdges: [],
        selectedMeshFaces: [],
        placingNodeId: node.id,
        tool: 'place',
        showResult: false,
        notice: `Recipe ready at exact dimensions. Click or drag to place the ${operation === 'revolve' ? 'revolved form' : 'solid'}.`,
      })
    },

    setMeasurement(measurement) { set({ measurement }) },
    setMeshComponentMode(meshComponentMode) {
      if (meshComponentMode === 'object') {
        set({ meshComponentMode, selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [] })
        return
      }
      const state = get()
      const selected = state.document.nodes.find((node) => node.id === state.selectedNodeId)
      if (!selected?.mesh) { set({ notice: 'Start Polygon Sculpt or select an imported mesh before editing components.' }); return }
      const topology = extractMeshTopology(selected.mesh)
      const needsCanonicalMesh = topology.mesh.positions.length !== selected.mesh.positions.length
        || topology.mesh.indices.length !== selected.mesh.indices.length
        || topology.sourceVertexToVertex.some((vertex, index) => vertex !== index)
      if (needsCanonicalMesh) get().dispatch({ type: 'update-node', nodeId: selected.id, patch: { mesh: topology.mesh } }, true, true)
      const current = activeComponentSelection()
      const next = current ? convertSelection(topology, current, meshComponentMode, 'touching') : { mode: meshComponentMode, indices: new Set<number>() }
      setComponentSelection(next)
      set({ showResult: false, tool: 'select', ...(needsCanonicalMesh ? { notice: 'Mesh topology normalized for precise component editing.' } : {}) })
    },
    selectMeshComponent(kind, id, additive = false) {
      const key = kind === 'vertex' ? 'selectedMeshVertices' : kind === 'edge' ? 'selectedMeshEdges' : 'selectedMeshFaces'
      const current = get()[key] as number[]
      const exists = current.includes(id)
      const next = additive ? exists ? current.filter((value) => value !== id) : [...current, id] : [id]
      if (kind === 'vertex') set({ selectedMeshVertices: next as number[], selectedMeshEdges: [], selectedMeshFaces: [] })
      else if (kind === 'edge') set({ selectedMeshVertices: [], selectedMeshEdges: next, selectedMeshFaces: [] })
      else set({ selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: next as number[] })
    },
    setMeshComponentSelection(selection) {
      set({ selectedMeshVertices: selection.vertices ?? [], selectedMeshEdges: selection.edges ?? [], selectedMeshFaces: selection.faces ?? [] })
    },
    clearMeshComponentSelection() { set({ selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [] }) },
    setSoftSelectionRadius(softSelectionRadius) { set({ softSelectionRadius: Math.max(0, Math.min(100, softSelectionRadius)) }) },
    setComponentEditSetting(patch) {
      set({ ...patch, ...(patch.softSelectionRadius !== undefined ? { softSelectionRadius: Math.max(0, Math.min(100, patch.softSelectionRadius)) } : {}) })
    },
    selectAllMeshComponents() {
      const state = get()
      if (state.meshComponentMode === 'object') return
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      if (!node?.mesh) return
      const topology = extractMeshTopology(node.mesh)
      const count = state.meshComponentMode === 'vertex' ? topology.vertices.length : state.meshComponentMode === 'edge' ? topology.edges.length : topology.faces.length
      setComponentSelection({ mode: state.meshComponentMode, indices: new Set(Array.from({ length: count }, (_, index) => index)) })
    },
    convertMeshComponentSelection(mode, strategy = 'contained') {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection) { get().setMeshComponentMode(mode); return }
      setComponentSelection(convertSelection(extractMeshTopology(node.mesh), selection, mode, strategy))
      set({ showResult: false, tool: 'select' })
    },
    growMeshComponentSelection() {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection) return
      setComponentSelection(growSelection(extractMeshTopology(node.mesh), selection))
    },
    shrinkMeshComponentSelection() {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection) return
      setComponentSelection(shrinkSelection(extractMeshTopology(node.mesh), selection))
    },
    selectLinkedMeshComponents() {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection?.indices.size) { set({ notice: 'Select part of a connected mesh island first.' }); return }
      const linked = selectLinked(extractMeshTopology(node.mesh), selection)
      setComponentSelection(linked)
      set({ notice: `Selected ${linked.indices.size} linked ${linked.mode === 'vertex' ? 'vertices' : `${linked.mode}s`}.` })
    },
    selectMeshBoundary() {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection) return
      const boundary = selectBoundary(extractMeshTopology(node.mesh), selection.indices.size ? selection : undefined)
      setComponentSelection(boundary)
      set({ notice: boundary.indices.size ? `Selected ${boundary.indices.size} open-boundary components.` : 'This mesh has no open boundary in the current island.' })
    },
    selectMeshShortestPath() {
      const state = get()
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      if (!node?.mesh || (state.meshComponentMode !== 'vertex' && state.meshComponentMode !== 'edge')) {
        set({ notice: 'Shortest path works between two selected vertices or two selected edges.' })
        return
      }
      const seeds = state.meshComponentMode === 'vertex' ? state.selectedMeshVertices : state.selectedMeshEdges
      if (seeds.length !== 2) {
        set({ notice: `Select exactly two ${state.meshComponentMode === 'vertex' ? 'vertices' : 'edges'} to find the shortest connected path.` })
        return
      }
      const path = shortestComponentPath(extractMeshTopology(node.mesh), state.meshComponentMode, seeds[0]!, seeds[1]!)
      if (!path.ok) { set({ notice: path.reason }); return }
      setComponentSelection(path.selection)
      set({ notice: `Selected a ${path.path.length}-component path (${path.cost.toFixed(2)} mm along the mesh).` })
    },
    selectMeshEdgeLoop() {
      const state = get()
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      if (!node?.mesh || state.meshComponentMode !== 'edge' || state.selectedMeshEdges.length !== 1) {
        set({ notice: 'Select exactly one edge, then use Loop to follow its quad ring.' })
        return
      }
      const loop = selectEdgeLoop(extractMeshTopology(node.mesh), state.selectedMeshEdges[0]!)
      if (!loop.ok) { set({ notice: loop.reason }); return }
      setComponentSelection(loop.selection)
      const ending = loop.closed ? 'closed loop' : loop.termination === 'boundary' ? 'loop ending at a boundary' : 'safe partial loop'
      set({ notice: `Selected ${loop.orderedEdges.length} edges in a ${ending}${loop.reconstructedQuads ? ` across ${loop.reconstructedQuads} reconstructed quads` : ''}.` })
    },
    transformMeshComponents(transform) {
      const state = get()
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection?.indices.size) { set({ notice: 'Select vertices, edges, or faces to transform.' }); return }
      const topology = extractMeshTopology(node.mesh)
      const vertices = convertSelection(topology, selection, 'vertex', 'touching')
      const result = transformSelectedVertices(topology.mesh, vertices.indices, transform, {
        radius: state.softSelectionRadius,
        distance: state.softSelectionDistance,
        falloff: state.softSelectionFalloff,
      })
      get().dispatch({ type: 'update-node', nodeId: node.id, patch: { mesh: result.mesh } }, true, true)
      const affected = result.weights.filter((weight) => weight > 0.0001).length
      set({ showResult: false, notice: `Transformed ${vertices.indices.size} selected vertices${affected > vertices.indices.size ? ` with ${affected - vertices.indices.size} softly affected neighbors` : ''}.` })
    },
    translateMeshComponents(delta) { get().transformMeshComponents({ translation: delta }) },
    extrudeSelectedFaces(distance) {
      const state = get()
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection) return
      const topology = extractMeshTopology(node.mesh)
      const faces = convertSelection(topology, selection, 'face', 'contained')
      const edit = extrudeFaces(topology.mesh, faces.indices, { distance })
      if (!edit.ok) { set({ notice: edit.reason }); return }
      get().dispatch({ type: 'update-node', nodeId: node.id, patch: { mesh: edit.result.mesh } }, true, true)
      setComponentSelection(edit.result.selection ?? { mode: 'face', indices: new Set<number>() })
      set({ showResult: false, notice: `Extruded ${faces.indices.size} face${faces.indices.size === 1 ? '' : 's'} by ${distance} mm.` })
    },
    insetSelectedFace(amount) {
      const state = get()
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection) return
      const faceSelection = convertSelection(extractMeshTopology(node.mesh), selection, 'face', 'contained')
      if (faceSelection.indices.size !== 1) { set({ notice: 'Select exactly one face to inset.' }); return }
      const edit = insetFace(node.mesh, [...faceSelection.indices][0]!, amount)
      if (!edit.ok) { set({ notice: edit.reason }); return }
      get().dispatch({ type: 'update-node', nodeId: node.id, patch: { mesh: edit.result.mesh } }, true, true)
      setComponentSelection(edit.result.selection ?? { mode: 'face', indices: new Set<number>() })
      set({ showResult: false, notice: `Inset face by ${Math.round(amount * 100)}%.` })
    },
    deleteSelectedMeshComponents() {
      const state = get()
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      const selection = activeComponentSelection()
      if (!node?.mesh || !selection) return
      const faces = convertSelection(extractMeshTopology(node.mesh), selection, 'face', 'contained')
      const edit = deleteFacesSafe(node.mesh, faces.indices)
      if (!edit.ok) { set({ notice: edit.reason }); return }
      get().dispatch({ type: 'update-node', nodeId: node.id, patch: { mesh: edit.result.mesh } }, true, true)
      set({ selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], showResult: false, notice: `Deleted ${faces.indices.size} face${faces.indices.size === 1 ? '' : 's'}; the remaining mesh is manifold.` })
    },
    dissolveSelectedVertex() {
      const state = get()
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      if (!node?.mesh || state.meshComponentMode !== 'vertex' || state.selectedMeshVertices.length !== 1) { set({ notice: 'Select one valence-three vertex to dissolve.' }); return }
      const edit = dissolveVertexSafe(node.mesh, state.selectedMeshVertices[0]!)
      if (!edit.ok) { set({ notice: edit.reason }); return }
      get().dispatch({ type: 'update-node', nodeId: node.id, patch: { mesh: edit.result.mesh } }, true, true)
      set({ selectedMeshVertices: [], showResult: false, notice: 'Vertex dissolved while preserving a closed manifold.' })
    },

    addNamedParameter() {
      const document = get().document
      const used = new Set(document.namedParameters.map((parameter) => parameter.name.toLowerCase()))
      let index = document.namedParameters.length + 1
      while (used.has(`dimension ${index}`)) index += 1
      const parameter: ParameterDefinition = {
        id: nanoid(), name: `Dimension ${index}`, expression: '', unit: 'mm', value: 10,
      }
      commitParameterizedDocument({ ...document, namedParameters: [...document.namedParameters, parameter] }, 'Named parameter added. Bind it to any dimension below.')
    },

    updateNamedParameter(id, patch) {
      const document = get().document
      const namedParameters = document.namedParameters.map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter)
      commitParameterizedDocument({ ...document, namedParameters })
    },

    removeNamedParameter(id) {
      const document = get().document
      const removed = document.namedParameters.find((parameter) => parameter.id === id)
      if (!removed) return
      commitParameterizedDocument({ ...document, namedParameters: document.namedParameters.filter((parameter) => parameter.id !== id) }, `${removed.name} removed. Existing bindings that reference it are flagged.`)
    },

    setNodeParameterBinding(nodeId, target, expression) {
      const document = get().document
      const nodes = document.nodes.map((node) => {
        if (node.id !== nodeId) return node
        const bindings = { ...node.parameterBindings }
        const clean = expression.trim()
        if (clean) bindings[target] = expression
        else delete bindings[target]
        return { ...node, parameterBindings: Object.keys(bindings).length ? bindings : undefined }
      })
      commitParameterizedDocument({ ...document, nodes }, expression.trim() ? 'Dimension binding applied.' : 'Dimension binding removed.')
    },

    importMesh(name, mesh) {
      const node = createNode('mesh', 'add', vec3())
      node.name = name || 'Imported mesh'
      node.mesh = mesh
      const parts = splitDisconnectedMeshNode(node)
      get().dispatch(parts.length === 1 ? { type: 'add-node', node: parts[0]! } : { type: 'add-nodes', nodes: parts })
      set({ selectedNodeId: parts[0]!.id, selectedNodeIds: [parts[0]!.id], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], tool: 'move', showResult: false, notice: parts.length === 1 ? `${node.name} imported.` : `${node.name} imported as ${parts.length} independent parts.` })
    },

    mirrorSelected(axis) {
      const selection = get().document.nodes.filter(n => get().selectedNodeIds.includes(n.id))
      if (selection.length > 1 || selection.some(n => n.combined || n.assemblyPath?.length)) {
        set({ notice: 'Convert the complete assembly to a mesh before mirroring, so its holes stay with it.' })
        return
      }
      const source = get().document.nodes.find((node) => node.id === get().selectedNodeId)
      if (!source) return
      const mirrored = structuredClone(source)
      mirrored.id = nanoid()
      mirrored.name = `${source.name} mirror ${axis.toUpperCase()}`
      mirrored.createdAt = new Date().toISOString()
      mirrored.transform.position[axis] *= -1
      mirrored.transform.scale[axis] *= -1
      get().dispatch({ type: 'add-node', node: mirrored })
      set({ selectedNodeId: mirrored.id, selectedNodeIds: [mirrored.id], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], notice: `Mirrored across the ${axis.toUpperCase()} origin plane.` })
    },

    patternSelected(axis, count, spacing) {
      const state = get()
      try {
        const next = patternAssembly(state.document, state.selectedNodeIds, { mode: 'linear', axis, count, spacing, degrees: 360, origin: vec3() })
        state.dispatch({ type: 'replace-document', document: next })
        const ids = next.nodes.slice(state.document.nodes.length).map(n => n.id)
        set({ selectedNodeId: ids[0] ?? null, selectedNodeIds: ids, notice: `${count} independent assembly instances created.` })
      } catch (error) { set({ notice: (error as Error).message }) }
    },

    polarPatternSelected(axis, count, degrees, radius) {
      const selection = get().document.nodes.filter(n => get().selectedNodeIds.includes(n.id))
      if (selection.length > 1 || selection.some(n => n.combined || n.assemblyPath?.length)) {
        set({ notice: 'Use Prepare → Assembly arrangement for a complete assembly pattern with an explicit rotation origin.' })
        return
      }
      const source = get().document.nodes.find((node) => node.id === get().selectedNodeId)
      if (!source) return
      const safeCount = Math.max(2, Math.min(36, Math.round(count)))
      const step = degrees / safeCount
      const base = structuredClone(source)
      const safeRadius = Math.max(0.1, radius)
      if (axis === 'z') {
        const length = Math.hypot(base.transform.position.x, base.transform.position.y)
        base.transform.position = length < 0.01 ? { ...base.transform.position, x: safeRadius } : { ...base.transform.position, x: base.transform.position.x * safeRadius / length, y: base.transform.position.y * safeRadius / length }
      } else if (axis === 'x') {
        const length = Math.hypot(base.transform.position.y, base.transform.position.z)
        base.transform.position = length < 0.01 ? { ...base.transform.position, y: safeRadius } : { ...base.transform.position, y: base.transform.position.y * safeRadius / length, z: base.transform.position.z * safeRadius / length }
      } else {
        const length = Math.hypot(base.transform.position.x, base.transform.position.z)
        base.transform.position = length < 0.01 ? { ...base.transform.position, x: safeRadius } : { ...base.transform.position, x: base.transform.position.x * safeRadius / length, z: base.transform.position.z * safeRadius / length }
      }
      const nodes = Array.from({ length: safeCount - 1 }, (_, index) => {
        const copy = structuredClone(base)
        const angle = step * (index + 1) * Math.PI / 180
        const cos = Math.cos(angle); const sin = Math.sin(angle)
        const { x, y, z } = base.transform.position
        copy.id = nanoid()
        copy.name = `${source.name} polar ${index + 2}`
        copy.createdAt = new Date().toISOString()
        if (axis === 'z') copy.transform.position = { x: x * cos - y * sin, y: x * sin + y * cos, z }
        else if (axis === 'x') copy.transform.position = { x, y: y * cos - z * sin, z: y * sin + z * cos }
        else copy.transform.position = { x: x * cos + z * sin, y, z: -x * sin + z * cos }
        copy.transform.rotation[axis] += step * (index + 1)
        return copy
      })
      const documentNodes = get().document.nodes.map((node) => node.id === source.id ? base : node)
      const updatedNodes = [...documentNodes, ...nodes]
      get().dispatch({ type: 'replace-nodes', nodes: updatedNodes })
      if (get().document.nodes !== updatedNodes) return
      set({ selectedNodeId: nodes.at(-1)?.id ?? source.id, selectedNodeIds: [source.id, ...nodes.map((node) => node.id)], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], notice: `${safeCount}-part polar pattern created around the ${axis.toUpperCase()} axis.` })
    },

    alignSelected(axis, alignment) {
      const selectedIds = get().selectedNodeIds
      const selected = selectedIds.map((id) => get().document.nodes.find((node) => node.id === id)).filter((node): node is ModelNode => Boolean(node))
      if (selected.length < 2) { set({ notice: 'Select at least two shapes to align.' }); return }
      const bounds = selected.map((node) => ({ node, bounds: nodeWorldBounds(node) }))
      const anchor = bounds[0]!.bounds
      const target = alignment === 'min' ? anchor.min[axis] : alignment === 'max' ? anchor.max[axis] : (anchor.min[axis] + anchor.max[axis]) / 2
      const updates = new Map(bounds.map(({ node, bounds: candidate }) => {
        const value = alignment === 'min' ? candidate.min[axis] : alignment === 'max' ? candidate.max[axis] : (candidate.min[axis] + candidate.max[axis]) / 2
        return [node.id, { ...node.transform.position, [axis]: node.transform.position[axis] + target - value }]
      }))
      const nodes = get().document.nodes.map((node) => updates.has(node.id) ? { ...node, transform: { ...node.transform, position: updates.get(node.id)! } } : node)
      get().dispatch({ type: 'replace-nodes', nodes })
      if (get().document.nodes !== nodes) return
      set({ notice: `Aligned ${selected.length} shapes on ${axis.toUpperCase()} (${alignment}).` })
    },

    distributeSelected(axis) {
      const selectedIds = get().selectedNodeIds
      const selected = selectedIds.map((id) => get().document.nodes.find((node) => node.id === id)).filter((node): node is ModelNode => Boolean(node))
      if (selected.length < 3) { set({ notice: 'Select at least three shapes to distribute.' }); return }
      const sorted = selected.map((node) => {
        const bounds = nodeWorldBounds(node)
        return { node, center: (bounds.min[axis] + bounds.max[axis]) / 2 }
      }).sort((a, b) => a.center - b.center)
      const first = sorted[0]!.center; const last = sorted.at(-1)!.center
      const updates = new Map(sorted.map(({ node, center }, index) => [node.id, { ...node.transform.position, [axis]: node.transform.position[axis] + first + (last - first) * index / (sorted.length - 1) - center }]))
      const nodes = get().document.nodes.map((node) => updates.has(node.id) ? { ...node, transform: { ...node.transform, position: updates.get(node.id)! } } : node)
      get().dispatch({ type: 'replace-nodes', nodes })
      if (get().document.nodes !== nodes) return
      set({ notice: `Distributed ${selected.length} shapes evenly along ${axis.toUpperCase()}.` })
    },

    moveFeature(nodeId, direction) {
      const nodes = [...get().document.nodes]
      const from = nodes.findIndex((node) => node.id === nodeId)
      const to = Math.max(0, Math.min(nodes.length - 1, from + direction))
      if (from < 0 || from === to) return
      const [node] = nodes.splice(from, 1)
      nodes.splice(to, 0, node!)
      get().dispatch({ type: 'replace-nodes', nodes })
      set({ notice: `Moved ${node!.name} to modeling step ${to + 1}.` })
    },

    repairSelectedMesh() {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      if (!node?.mesh) { set({ notice: 'Select an imported mesh to repair.' }); return }
      const result = repairMesh(node.mesh)
      get().updateNode(node.id, { mesh: result.mesh })
      const removed = result.before.degenerateTriangles + result.before.duplicateTriangles
      set({ notice: `Mesh cleaned: welded vertices and removed ${removed} invalid triangle${removed === 1 ? '' : 's'}. ${result.after.watertight ? 'The mesh is watertight.' : `${result.after.boundaryEdges} boundary edges remain.`}` })
    },

    makeSculptable(subdivisionLevels = 2) {
      const selected = get().document.nodes.find((node) => node.id === get().selectedNodeId)
      if (selected?.locked) { set({ notice: 'Unlock the selected shape before sculpting.' }); return }
      if (get().document.sculptStrokes.length && get().document.nodes.some(node => node.locked && !node.suppressed)) {
        set({ notice: 'Unlock all shapes before converting a model with volume strokes. Conversion resets those strokes on the combined model.' })
        return
      }
      if (!selected) {
        set({ notice: 'Select one shape first, then start Polygon Sculpt.' })
        return
      }
      if (get().document.sculptStrokes.length) {
        set({ notice: 'Polygon conversion would discard volume sculpting. Export and reimport the evaluated model to bake it first.' })
        return
      }
      if (hasSurfaceModifiers(selected)) {
        set({ notice: 'Polygon conversion would discard surface modifiers. Export and reimport the evaluated model to bake them first.' })
        return
      }
      const geometry = makeSourceGeometry(selected)
      const source = geometryToSculptMesh(geometry, selected.mesh?.mask ? Float32Array.from(selected.mesh.mask) : undefined)
      geometry.dispose()
      if (!source.positions.length || !source.indices.length) {
        set({ notice: 'That selected shape could not be converted to a sculpt mesh.' })
        return
      }
      const baseFaces = source.indices.length / 3
      const safeLevels = baseFaces >= 10_000 ? 0 : baseFaces >= 1_000 ? Math.min(1, subdivisionLevels) : subdivisionLevels
      const sculptMesh = subdivideMesh(source, safeLevels)
      const node: ModelNode = {
        ...structuredClone(selected),
        kind: 'mesh',
        name: selected.kind === 'mesh' ? selected.name : `${selected.name} sculpt`,
        mesh: sculptMesh,
        deformation: undefined,
        surface: undefined,
      }
      const previous = get().document
      const document: ModelDocument = {
        ...previous,
        nodes: previous.nodes.map((candidate) => candidate.id === selected.id ? node : candidate),
        sculptStrokes: [],
        revision: previous.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      get().dispatch({ type: 'replace-document', document }, true, true)
      set({
        selectedNodeId: node.id,
        selectedNodeIds: [node.id],
        meshComponentMode: 'object',
        selectedMeshVertices: [],
        selectedMeshEdges: [],
        selectedMeshFaces: [],
        tool: 'sculpt-grab',
        showResult: false,
        notice: `Polygon Sculpt ready for ${selected.name} · ${sculptMesh.indices.length / 3} faces. Other shapes remain separate; Undo restores the parametric shape.`,
      })
    },

    commitPolygonSculpt(nodeId, mesh) {
      get().dispatch({ type: 'update-node', nodeId, patch: { mesh } }, true, true)
    },

    subdivideSelectedMesh() {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      if (!node?.mesh) { set({ notice: 'Start Polygon Sculpt before subdividing.' }); return }
      if (node.mesh.indices.length / 3 >= 62_500) { set({ notice: 'This mesh is already dense. Use Adaptive detail to refine only where you paint.' }); return }
      const mesh = subdivideMesh(node.mesh, 1)
      get().dispatch({ type: 'update-node', nodeId: node.id, patch: { mesh } }, true, true)
      set({ showResult: false, notice: `Subdivided to ${mesh.indices.length / 3} faces for finer brush detail.` })
    },

    clearSculptMask() {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      if (!node?.mesh) return
      get().dispatch({ type: 'update-node', nodeId: node.id, patch: { mesh: { ...node.mesh, mask: new Array(node.mesh.positions.length / 3).fill(0) } } }, true, false)
      set({ notice: 'Sculpt mask cleared.' })
    },

    invertSculptMask() {
      const node = get().document.nodes.find((candidate) => candidate.id === get().selectedNodeId)
      if (!node?.mesh) return
      const mask = Array.from({ length: node.mesh.positions.length / 3 }, (_, index) => 1 - (node.mesh?.mask?.[index] ?? 0))
      get().dispatch({ type: 'update-node', nodeId: node.id, patch: { mesh: { ...node.mesh, mask } } }, true, false)
      set({ notice: 'Sculpt mask inverted.' })
    },

    undo() {
      const stack = get().undoStack
      const previous = stack.at(-1)
      if (!previous) return
      const parameterErrors = resolveDocumentParameterBindings(previous).errors
      set((state) => ({
        document: previous,
        placingNodeId: null,
        tool: state.tool === 'place' ? 'move' : state.tool,
        selectedNodeId: previous.nodes.some((node) => node.id === state.selectedNodeId) ? state.selectedNodeId : null,
        selectedNodeIds: state.selectedNodeIds.filter((id) => previous.nodes.some((node) => node.id === id)),
        undoStack: stack.slice(0, -1),
        redoStack: [state.document, ...state.redoStack].slice(0, 50),
        selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [],
        parameterErrors,
      }))
      scheduleSideEffects()
    },

    redo() {
      const [next, ...rest] = get().redoStack
      if (!next) return
      const parameterErrors = resolveDocumentParameterBindings(next).errors
      set((state) => ({
        document: next,
        placingNodeId: null,
        tool: state.tool === 'place' ? 'move' : state.tool,
        selectedNodeId: next.nodes.some((node) => node.id === state.selectedNodeId) ? state.selectedNodeId : null,
        selectedNodeIds: state.selectedNodeIds.filter((id) => next.nodes.some((node) => node.id === id)),
        undoStack: [...state.undoStack, state.document].slice(-50),
        redoStack: rest,
        selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [],
        parameterErrors,
      }))
      scheduleSideEffects()
    },

    removeSelected() {
      const ids = get().selectedNodeIds.length ? get().selectedNodeIds : get().selectedNodeId ? [get().selectedNodeId!] : []
      if (!ids.length) return
      const editableIds = ids.filter(id => !get().document.nodes.find(node => node.id === id)?.locked)
      if (!editableIds.length) { set({ notice: 'Unlock selected shapes before deleting them.' }); return }
      get().dispatch({ type: 'remove-nodes', nodeIds: editableIds })
      set({ selectedNodeId: null, selectedNodeIds: [], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], notice: `${editableIds.length} shape${editableIds.length === 1 ? '' : 's'} removed.${editableIds.length < ids.length ? ' Locked shapes were kept.' : ''}` })
    },

    duplicateSelected() {
      const ids = get().selectedNodeIds.length ? get().selectedNodeIds : get().selectedNodeId ? [get().selectedNodeId!] : []
      if(get().document.nodes.some(n=>ids.includes(n.id)&&(n.assemblyPath?.length||n.combined))){
        try{const previous=get().document,next=patternAssembly(previous,ids,{mode:'linear',axis:'x',count:2,spacing:8,degrees:360,origin:vec3()});const copies=next.nodes.slice(previous.nodes.length);for(const n of copies)n.transform.position.y+=8;get().dispatch({type:'replace-document',document:next});set({selectedNodeIds:copies.map(n=>n.id),selectedNodeId:copies.at(-1)!.id,notice:'Independent assembly duplicated.'})}catch(e){set({notice:(e as Error).message})}return
      }
      const copies = get().document.nodes.filter((node) => ids.includes(node.id)).map((node) => ({
        ...structuredClone(node), id: nanoid(), name: `${node.name} copy`, createdAt: new Date().toISOString(), groupId: undefined, combined: false,
        transform: { ...structuredClone(node.transform), position: { ...node.transform.position, x: node.transform.position.x + 8, y: node.transform.position.y + 8 } },
      }))
      if (!copies.length) return
      get().dispatch({ type: 'add-nodes', nodes: copies })
      set({ selectedNodeId: copies.at(-1)!.id, selectedNodeIds: copies.map((node) => node.id), meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], showResult: false, notice: `${copies.length} shape${copies.length === 1 ? '' : 's'} duplicated.` })
    },

    setNotice(notice) { set({ notice }) },

    addSculptStroke(center, mode, radius, strength, falloff, normal, remember = true) {
      const nodeId = get().selectedNodeId ?? get().document.nodes.find((node) => node.boolean === 'add')?.id
      if (!nodeId) return
      get().dispatch({ type: 'add-sculpt-stroke', stroke: { id: nanoid(), nodeId, mode, center, normal, radius, strength, falloff, createdAt: new Date().toISOString() } }, remember)
    },

    newDocument() {
      const document = createDocument()
      rememberOpenedProject(document.id)
      document.nodes = []
      const selectedNodeId = null
      set({ ...resetDocumentTransientState, document, selectedNodeId, selectedNodeIds: selectedNodeId ? [selectedNodeId] : [], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], parameterErrors: {}, undoStack: [], redoStack: [], notice: 'New project created.' })
      scheduleSideEffects()
    },

    loadDemo() {
      const document = createDemoDocument()
      rememberOpenedProject(document.id)
      set({ ...resetDocumentTransientState, document, selectedNodeId: null, selectedNodeIds: [], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], parameterErrors: {}, undoStack: [], redoStack: [], notice: 'Demo project loaded.' })
      scheduleSideEffects()
    },

    importDocument(value) {
      const resolved = resolveDocumentParameterBindings(parseModelDocument(value))
      const separated = separateDisconnectedMeshNodes(resolved.document)
      rememberOpenedProject(separated.document.id)
      set({ ...resetDocumentTransientState, document: separated.document, selectedNodeId: null, selectedNodeIds: [], meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], parameterErrors: resolved.errors, undoStack: [], redoStack: [], notice: separated.separatedParts ? `Project opened · separated ${separated.separatedParts} disconnected mesh parts.` : 'Project imported.' })
      scheduleSideEffects()
    },

    hydrate() {
      if (get().hydrated) return Promise.resolve()
      if (hydrationPromise) return hydrationPromise
      const initialDocument = get().document
      hydrationPromise = (async () => {
        try {
          const saved = await loadMostRecentProject()
          // An import or new project started during startup takes precedence over restored data.
          if (get().document !== initialDocument) return
          if (saved) {
            const resolved = resolveDocumentParameterBindings(parseModelDocument(saved.document))
            const separated = separateDisconnectedMeshNodes(resolved.document)
            rememberOpenedProject(separated.document.id)
            set({ document: separated.document, meshComponentMode: 'object', selectedMeshVertices: [], selectedMeshEdges: [], selectedMeshFaces: [], parameterErrors: resolved.errors, notice: separated.separatedParts ? `Project restored · separated ${separated.separatedParts} disconnected mesh parts.` : 'Local project restored.' })
            if (separated.separatedParts) persistence.schedule(separated.document)
            else persistence.restored(separated.document)
          } else persistence.schedule(get().document)
        } catch (error) {
          if (get().document === initialDocument) set({ saveStatus: 'error', saveError: error instanceof Error ? error.message : 'Could not open projects stored on this device.', lastSavedAt: null })
        } finally {
          set({ hydrated: true })
          await get().rebuild()
        }
      })()
      return hydrationPromise
    },

    async saveNow() {
      const document = get().document
      try {
        await persistence.saveNow(document)
        if (get().document === document && get().saveStatus === 'saved') set({ notice: `“${document.name || 'Untitled project'}” saved on this device.` })
        return true
      } catch {
        if (get().document === document && get().saveStatus === 'error') set({ notice: 'Save failed. Retry saving or download an editable project backup.' })
        return false
      }
    },

    async deleteProject(projectId) {
      await persistence.remove(projectId, () => deleteSavedProject(projectId))
      if (get().document.id === projectId) get().newDocument()
    },

    async rebuild() {
      const document = get().document
      const generation = ++rebuildGeneration
      set({ geometryStatus: 'building', geometryError: null })
      if (busyTimer) clearTimeout(busyTimer)
      busyTimer = setTimeout(() => {
        if (rebuildGeneration === generation && get().geometryStatus === 'building') set({ geometryBusyVisible: true })
      }, 450)
      try {
        const mesh = await geometryClient.evaluate(document)
        if (rebuildGeneration !== generation || get().document !== document) return
        let dimensions = vec3()
        if (mesh.positions.length) {
          let minX = Infinity; let minY = Infinity; let minZ = Infinity
          let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity
          for (let i = 0; i < mesh.positions.length; i += 3) {
            const x = mesh.positions[i] ?? 0; const y = mesh.positions[i + 1] ?? 0; const z = mesh.positions[i + 2] ?? 0
            minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z)
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z)
          }
          dimensions = vec3(maxX - minX, maxY - minY, maxZ - minZ)
        }
        if (busyTimer) clearTimeout(busyTimer)
        set({ mesh, meshDocument: document, geometryStatus: 'ready', geometryBusyVisible: false, analysis: analyzeForPrint(document, mesh, dimensions) })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (rebuildGeneration !== generation || get().document !== document) return
        if (busyTimer) clearTimeout(busyTimer)
        set({ geometryStatus: 'error', geometryBusyVisible: false, geometryError: error instanceof Error ? error.message : 'Could not rebuild model' })
      }
    },
  }
})
