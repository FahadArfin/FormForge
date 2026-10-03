import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { ModelNode, ToolMode } from '@formforge/model'
import { meshPayloadToGeometry } from '@/lib/exporters'
import { makeSourceGeometry, nodeGeometrySignature, nodeWorldBounds } from '@/lib/modelGeometry'
import {
  adaptiveSubdivideMesh,
  applyPolygonBrush,
  buildAdjacency,
  connectedVertexSet,
  createGrabWeights,
  geometryToSculptMesh,
  sculptMeshToGeometry,
  symmetryPoints,
  type PolygonBrushMode,
} from '@/lib/polygonSculpt'
import { useEditor } from '@/store/editor'
import { nonzeroScale, transformSelectionFromPrimary } from '@/lib/selectionTransforms'
import { extractMeshTopology } from '@/lib/componentMesh'
import { measurementFromHit } from '@/lib/measurementPicking'
import { useInspection } from '@/store/inspection'
import { sectionPlane, sectionPointVisible } from '@/lib/sectionView'

const polygonToolModes: Partial<Record<ToolMode, PolygonBrushMode>> = {
  'sculpt-draw': 'draw',
  'sculpt-clay': 'clay',
  'sculpt-smooth': 'smooth',
  'sculpt-inflate': 'inflate',
  'sculpt-pinch': 'pinch',
  'sculpt-flatten': 'flatten',
  'sculpt-crease': 'crease',
  'sculpt-grab': 'grab',
  'sculpt-snake': 'snake',
  'sculpt-relax': 'relax',
  'sculpt-mask': 'mask',
}
const polygonToolMode = (tool: ToolMode): PolygonBrushMode | null => polygonToolModes[tool] ?? null

function updateMaskColors(object: THREE.Mesh, color: string, mask: Float32Array | number[] | undefined) {
  const material = object.material as THREE.MeshStandardMaterial
  const positions = object.geometry.getAttribute('position')
  if (!mask?.some((value) => value > 0.001) || mask.length !== positions.count) {
    object.geometry.deleteAttribute('color')
    material.vertexColors = false
    return
  }
  const base = new THREE.Color(color)
  const masked = new THREE.Color('#211229')
  const colors = new Float32Array(positions.count * 3)
  for (let index = 0; index < positions.count; index += 1) {
    const shade = base.clone().lerp(masked, Math.min(0.88, (mask[index] ?? 0) * 0.88))
    colors[index * 3] = shade.r; colors[index * 3 + 1] = shade.g; colors[index * 3 + 2] = shade.b
  }
  object.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  material.vertexColors = true
  material.color.set('#ffffff')
}

function applyNodeTransform(object: THREE.Object3D, node: ModelNode) {
  object.position.set(node.transform.position.x, node.transform.position.y, node.transform.position.z)
  object.rotation.set(
    THREE.MathUtils.degToRad(node.transform.rotation.x),
    THREE.MathUtils.degToRad(node.transform.rotation.y),
    THREE.MathUtils.degToRad(node.transform.rotation.z),
  )
  object.scale.set(node.transform.scale.x, node.transform.scale.y, node.transform.scale.z)
}

function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    child.traverse((object) => {
      const candidate = object as THREE.Mesh
      candidate.geometry?.dispose()
      const materials = Array.isArray(candidate.material) ? candidate.material : candidate.material ? [candidate.material] : []
      materials.forEach((material) => material.dispose())
    })
    group.remove(child)
  }
}

function makeBrushCircle(color: string) {
  const points: THREE.Vector3[] = []
  for (let i = 0; i < 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0))
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92, depthTest: false }),
  )
}

const transformModeFor = (tool: ToolMode) => tool === 'rotate' ? 'rotate' : tool === 'scale' ? 'scale' : 'translate'

interface PlacementPreview {
  transform: ModelNode['transform']
  parameters: ModelNode['parameters']
}

export function Viewport({ theme }: { theme: 'dark' | 'light' }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtime = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    orbit: OrbitControls
    transform: TransformControls
    sourceGroup: THREE.Group
    resultGroup: THREE.Group
    grid: THREE.GridHelper
    buildPlate: THREE.Mesh
    referenceGroup: THREE.Group
    measurementGroup: THREE.Group
    brushCursor: THREE.Group
    sketchGroup: THREE.Group
    sourceById: Map<string, THREE.Mesh>
    resize: ResizeObserver
    frame: number
  } | null>(null)

  const document = useEditor((state) => state.document)
  const selectedNodeId = useEditor((state) => state.selectedNodeId)
  const selectedNodeIds = useEditor((state) => state.selectedNodeIds)
  const tool = useEditor((state) => state.tool)
  const showResult = useEditor((state) => state.showResult)
  const showGrid = useEditor((state) => state.showGrid)
  const showReferencePlanes = useEditor((state) => state.showReferencePlanes)
  const xrayEnabled = useEditor((state) => state.xrayEnabled)
  const displayMode = useEditor((state) => state.displayMode)
  const meshPayload = useEditor((state) => state.mesh)
  const translationSnap = useEditor((state) => state.translationSnap)
  const rotationSnap = useEditor((state) => state.rotationSnap)
  const scaleSnap = useEditor((state) => state.scaleSnap)
  const brushRadius = useEditor((state) => state.brushRadius)
  const brushStrength = useEditor((state) => state.brushStrength)
  const measurement = useEditor((state) => state.measurement)
  const section = useInspection(state => state.section)
  const meshComponentMode = useEditor((state) => state.meshComponentMode)
  const selectedMeshVertices = useEditor((state) => state.selectedMeshVertices)
  const selectedMeshEdges = useEditor((state) => state.selectedMeshEdges)
  const selectedMeshFaces = useEditor((state) => state.selectedMeshFaces)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#14151d')
    scene.fog = new THREE.FogExp2('#14151d', 0.0028)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000)
    camera.up.set(0, 0, 1)
    camera.position.set(92, -108, 82)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.localClippingEnabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    host.appendChild(renderer.domElement)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08
    orbit.target.set(0, 0, 12)
    orbit.minDistance = 8
    orbit.maxDistance = 1200

    scene.add(new THREE.HemisphereLight('#b9d4ff', '#20202b', 1.7))
    const key = new THREE.DirectionalLight('#fff5e4', 3.6)
    key.position.set(-60, -70, 110)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    scene.add(key)
    const rim = new THREE.DirectionalLight('#6d75ff', 1.3)
    rim.position.set(80, 60, 60)
    scene.add(rim)

    const grid = new THREE.GridHelper(400, 80, '#5a5d78', '#30323f')
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.02
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
    gridMaterials.forEach((material) => { material.transparent = true; material.opacity = 0.42 })
    scene.add(grid)

    const buildPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshStandardMaterial({ color: '#1c1e28', roughness: 0.92, transparent: true, opacity: 0.68, side: THREE.DoubleSide }),
    )
    buildPlate.receiveShadow = true
    buildPlate.position.z = -0.08
    scene.add(buildPlate)

    const referenceGroup = new THREE.Group()
    const referenceGrid = (color: string) => {
      const helper = new THREE.GridHelper(180, 18, color, color)
      const materials = Array.isArray(helper.material) ? helper.material : [helper.material]
      materials.forEach((material) => { material.transparent = true; material.opacity = 0.18; material.depthWrite = false })
      return helper
    }
    const xyReference = referenceGrid('#6673da')
    xyReference.rotation.x = Math.PI / 2
    const xzReference = referenceGrid('#5bc69f')
    const yzReference = referenceGrid('#e7798e')
    yzReference.rotation.z = Math.PI / 2
    referenceGroup.add(xyReference, xzReference, yzReference, new THREE.AxesHelper(55))
    referenceGroup.visible = false
    scene.add(referenceGroup)

    const sourceGroup = new THREE.Group()
    const resultGroup = new THREE.Group()
    scene.add(sourceGroup, resultGroup)

    const sketchGroup = new THREE.Group()
    sketchGroup.renderOrder = 35
    scene.add(sketchGroup)

    const measurementGroup = new THREE.Group()
    measurementGroup.renderOrder = 40
    scene.add(measurementGroup)

    const brushCursor = new THREE.Group()
    const brushOuter = makeBrushCircle('#f3f4ff')
    const brushInner = makeBrushCircle('#9397ff')
    brushInner.userData.inner = true
    brushCursor.add(brushOuter, brushInner)
    brushCursor.visible = false
    brushCursor.renderOrder = 30
    scene.add(brushCursor)

    const transform = new TransformControls(camera, renderer.domElement)
    transform.setSize(1.12)
    scene.add(transform.getHelper())
    let transformDragging = false
    transform.addEventListener('dragging-changed', (event) => {
      transformDragging = Boolean(event.value)
      orbit.enabled = !event.value
    })
    let transformSnapshot: ModelNode[] = []
    const snapshotSelection = () => {
      const state = useEditor.getState()
      transformSnapshot = state.document.nodes.filter(node => state.selectedNodeIds.includes(node.id) && !node.locked).map(node => structuredClone(node))
    }
    const objectTransform = (object: THREE.Object3D, node: ModelNode): ModelNode['transform'] => ({
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotation: { x: THREE.MathUtils.radToDeg(object.rotation.x), y: THREE.MathUtils.radToDeg(object.rotation.y), z: THREE.MathUtils.radToDeg(object.rotation.z) },
      scale: { x: nonzeroScale(object.scale.x, node.transform.scale.x), y: nonzeroScale(object.scale.y, node.transform.scale.y), z: nonzeroScale(object.scale.z, node.transform.scale.z) },
    })
    const previewSelection = (object: THREE.Object3D) => {
      const nodeId = object.userData.nodeId as string
      const node = transformSnapshot.find(candidate => candidate.id === nodeId)
      if (!node) return []
      const updates = transformSelectionFromPrimary(transformSnapshot, nodeId, objectTransform(object, node))
      for (const update of updates) {
        const target = sourceById.get(update.id)
        if (target) applyNodeTransform(target, { ...node, transform: update.transform })
      }
      return updates
    }
    transform.addEventListener('mouseDown', snapshotSelection)
    transform.addEventListener('objectChange', () => { if (transform.object) previewSelection(transform.object) })
    transform.addEventListener('mouseUp', () => {
      if (transform.object && !gizmoDrag) useEditor.getState().updateSelectionTransforms(previewSelection(transform.object))
      if (!gizmoDrag) transformSnapshot = []
    })

    const raycaster = new THREE.Raycaster()
    raycaster.params.Line = { threshold: 1.25 }
    const pointer = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    let placementStart: THREE.Vector3 | null = null
    let placementPreview: PlacementPreview | null = null
    let directDrag: { nodeId: string; startPoint: THREE.Vector3; startPosition: THREE.Vector3 } | null = null
    let gizmoDrag: { nodeId: string; axis: string; startPoint: THREE.Vector3; startPosition: THREE.Vector3; plane: THREE.Plane } | null = null
    let sculpting = false
    let sculptHasHistory = false
    let lastSculptPoint: THREE.Vector3 | null = null
    let polygonStroke: {
      nodeId: string
      node: ModelNode
      object: THREE.Mesh
      mode: PolygonBrushMode
      mask: Float32Array
      adjacency: Array<Set<number>>
      affectedVertices: Set<number>
      seedVertex: number
      startPoint: THREE.Vector3
      lastPoint: THREE.Vector3
      localNormal: THREE.Vector3
      worldNormal: THREE.Vector3
      dragPlane: THREE.Plane
      lastPlanePoint: THREE.Vector3
      grabWeights?: Float32Array
      lastTopologyAt: number
      modified: boolean
    } | null = null
    let sketchPoints: THREE.Vector3[] = []
    let measuring = false

    const updateRay = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
    }

    const pointOnPlane = (event: PointerEvent) => {
      updateRay(event)
      return raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    }

    const resultHit = (event: PointerEvent) => {
      updateRay(event)
      const result = resultGroup.children[0]
      if (!result) return null
      const hit = raycaster.intersectObject(result, false).find(hit => sectionPointVisible(hit.point, useInspection.getState().section))
      if (!hit?.face) return null
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      return { point: hit.point, normal }
    }

    const polygonHit = (event: PointerEvent) => {
      const state = useEditor.getState()
      const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
      const object = node?.kind === 'mesh' && !node.locked ? sourceById.get(node.id) : undefined
      if (!node || !object) return null
      updateRay(event)
      const hit = raycaster.intersectObject(object, false).find(hit => sectionPointVisible(hit.point, useInspection.getState().section))
      if (!hit?.face) return null
      const worldNormal = hit.face.normal.clone().transformDirection(object.matrixWorld).normalize()
      const localPoint = object.worldToLocal(hit.point.clone())
      const localNormal = hit.face.normal.clone().normalize()
      return { point: hit.point, normal: worldNormal, localPoint, localNormal, object, node, seedVertex: hit.face.a }
    }

    const measurementPoint = (event: PointerEvent) => {
      updateRay(event)
      const state = useEditor.getState()
      if (state.showResult && (state.meshDocument !== state.document || state.geometryStatus !== 'ready')) return null
      const targets: THREE.Object3D[] = state.showResult
        ? resultGroup.children.filter(object => object.visible)
        : sourceGroup.children.filter(object => object.visible && state.document.nodes.some(node => node.id === object.userData.nodeId && node.visible && !node.suppressed))
      const hit = raycaster.intersectObjects(targets, false).find(hit => sectionPointVisible(hit.point, useInspection.getState().section))
      const point = hit ? measurementFromHit(hit, useInspection.getState().measurementMode) : null
      return point && sectionPointVisible(point, useInspection.getState().section) ? point : null
    }

    const updateBrushCursor = (hit: { point: THREE.Vector3; normal: THREE.Vector3 } | null) => {
      const state = useEditor.getState()
      const overSculptSurface = Boolean(hit && state.tool.startsWith('sculpt'))
      renderer.domElement.classList.toggle('sculpt-hit', overSculptSurface)
      if (!hit || !overSculptSurface) { brushCursor.visible = false; return }
      brushCursor.visible = true
      brushCursor.position.copy(hit.point).addScaledVector(hit.normal, 0.08)
      brushCursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal)
      brushCursor.scale.setScalar(state.brushRadius)
      const inner = brushCursor.children.find((child) => child.userData.inner)
      inner?.scale.setScalar(Math.max(0.12, state.brushStrength))
    }

    const refreshSketch = (hover?: THREE.Vector3 | null) => {
      disposeGroup(sketchGroup)
      if (!sketchPoints.length) return
      const linePoints = [...sketchPoints]
      if (hover) linePoints.push(hover)
      if (!hover && sketchPoints.length > 2) linePoints.push(sketchPoints[0]!)
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePoints.map((point) => point.clone().setZ(0.12))),
        new THREE.LineBasicMaterial({ color: '#a9acff', depthTest: false }),
      )
      line.renderOrder = 35
      sketchGroup.add(line)
      sketchPoints.forEach((point, index) => {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(index === 0 ? 1.15 : 0.8, 14, 10),
          new THREE.MeshBasicMaterial({ color: index === 0 ? '#72d9b6' : '#f2f2ff', depthTest: false }),
        )
        marker.position.copy(point).setZ(0.18)
        marker.renderOrder = 36
        sketchGroup.add(marker)
      })
    }

    const completeSketch = () => {
      if (sketchPoints.length >= 3) {
        useEditor.getState().finishProfileDrawing(sketchPoints.map((point) => ({ x: point.x, y: point.y })))
      }
      sketchPoints = []
      refreshSketch()
    }

    const cancelSketch = () => {
      sketchPoints = []
      refreshSketch()
      if (useEditor.getState().tool === 'draw-profile') useEditor.getState().setTool('select')
    }

    const stampSculpt = (hit: { point: THREE.Vector3; normal: THREE.Vector3 }, invert = false) => {
      const state = useEditor.getState()
      const mode = state.tool === 'sculpt-add' ? (invert ? 'carve' : 'add')
        : state.tool === 'sculpt-carve' ? (invert ? 'add' : 'carve')
          : state.tool === 'sculpt-inflate' ? 'inflate'
            : state.tool === 'sculpt-pinch' ? 'pinch'
              : state.tool === 'sculpt-flatten' ? 'flatten'
                : 'smooth'
      const center = hit.point.clone()
      if (mode === 'add' || mode === 'carve' || mode === 'inflate') {
        const depth = state.brushRadius * (1 - state.brushStrength * 0.92)
        center.addScaledVector(hit.normal, mode === 'carve' ? depth : -depth)
      }
      const symmetry = { x: state.brushSymmetryX, y: state.brushSymmetryY, z: state.brushSymmetryZ }
      const signs = symmetryPoints(new THREE.Vector3(1, 1, 1), symmetry)
      const stamped = new Set<string>()
      for (const sign of signs) {
        const point = center.clone().multiply(sign)
        const key = point.toArray().map(value => value.toFixed(5)).join(',')
        if (stamped.has(key)) continue
        stamped.add(key)
        const normal = hit.normal.clone().multiply(sign)
        state.addSculptStroke({ x: point.x, y: point.y, z: point.z }, mode, state.brushRadius, state.brushStrength, state.brushFalloff, { x: normal.x, y: normal.y, z: normal.z }, !sculptHasHistory)
        sculptHasHistory = true
      }
      lastSculptPoint = hit.point.clone()
    }

    const replacePolygonGeometry = (object: THREE.Mesh, mesh: NonNullable<ModelNode['mesh']>) => {
      const outline = object.getObjectByName('selection-outline') as THREE.LineSegments | undefined
      if (outline) {
        outline.geometry.dispose()
        const materials = Array.isArray(outline.material) ? outline.material : [outline.material]
        materials.forEach((material) => material.dispose())
        object.remove(outline)
      }
      object.geometry.dispose()
      object.geometry = sculptMeshToGeometry(mesh)
      object.userData.geometrySignature = `live-sculpt-${performance.now()}`
    }

    const applyDirectBrush = (event: PointerEvent, hit: ReturnType<typeof polygonHit>, dragDelta?: THREE.Vector3) => {
      if (!polygonStroke || !hit) return
      const state = useEditor.getState()
      const scale = polygonStroke.object.getWorldScale(new THREE.Vector3())
      const localScale = Math.max(0.0001, (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3)
      const center = polygonStroke.mode === 'grab' ? polygonStroke.startPoint : hit.localPoint
      const normal = polygonStroke.mode === 'grab'
        ? polygonStroke.object.worldToLocal(hit.point.clone().add(hit.normal)).sub(polygonStroke.object.worldToLocal(hit.point.clone())).normalize()
        : hit.localNormal
      const worldView = camera.position.clone().sub(hit.point).normalize()
      const localView = worldView.transformDirection(polygonStroke.object.matrixWorld.clone().invert()).normalize()
      if (state.dynamicTopology && !['grab', 'snake', 'mask'].includes(polygonStroke.mode) && performance.now() - polygonStroke.lastTopologyAt >= 100) {
        const current = geometryToSculptMesh(polygonStroke.object.geometry, polygonStroke.mask)
        const detailed = adaptiveSubdivideMesh(
          current,
          symmetryPoints(center, { x: state.brushSymmetryX, y: state.brushSymmetryY, z: state.brushSymmetryZ }),
          state.brushRadius * 1.15 / localScale,
          Math.max(0.08, state.brushRadius * state.sculptDetail / localScale),
        )
        polygonStroke.lastTopologyAt = performance.now()
        if (detailed.positions.length !== current.positions.length) {
          replacePolygonGeometry(polygonStroke.object, detailed)
          polygonStroke.mask = new Float32Array(detailed.mask ?? new Array(detailed.positions.length / 3).fill(0))
          polygonStroke.adjacency = buildAdjacency(polygonStroke.object.geometry.getIndex()?.array ?? [], detailed.positions.length / 3)
          polygonStroke.affectedVertices = connectedVertexSet(polygonStroke.adjacency, polygonStroke.seedVertex)
          updateMaskColors(polygonStroke.object, hit.node.color, polygonStroke.mask)
          polygonStroke.modified = true
        }
      }
      const changed = applyPolygonBrush({
        geometry: polygonStroke.object.geometry,
        mode: polygonStroke.mode,
        center,
        normal,
        dragDelta,
        radius: state.brushRadius / localScale,
        strength: state.brushStrength,
        falloff: state.brushFalloff,
        invert: event.shiftKey,
        symmetry: { x: state.brushSymmetryX, y: state.brushSymmetryY, z: state.brushSymmetryZ },
        frontFacesOnly: state.brushFrontFacesOnly,
        viewDirection: localView,
        mask: polygonStroke.mask,
        adjacency: polygonStroke.adjacency,
        grabWeights: polygonStroke.grabWeights,
        affectedVertices: polygonStroke.affectedVertices,
      })
      if (!changed) return
      polygonStroke.modified = true
      if (polygonStroke.mode === 'mask') updateMaskColors(polygonStroke.object, hit.node.color, polygonStroke.mask)
      polygonStroke.lastPoint.copy(hit.localPoint)
    }

    const beginPolygonStroke = (event: PointerEvent, hit: NonNullable<ReturnType<typeof polygonHit>>) => {
      const state = useEditor.getState()
      const mode = polygonToolMode(state.tool)
      if (!mode || !hit.node.mesh) return false
      const scale = hit.object.getWorldScale(new THREE.Vector3())
      const localScale = Math.max(0.0001, (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3)
      let mask = new Float32Array(hit.node.mesh.mask ?? new Array(hit.object.geometry.getAttribute('position').count).fill(0))

      // Refine once before a Grab stroke so a small brush has enough vertices
      // to form a smooth deformation. Topology remains frozen during the drag,
      // keeping the cached Grab weights stable.
      if (state.dynamicTopology && !['snake', 'mask'].includes(mode)) {
        const current = geometryToSculptMesh(hit.object.geometry, mask)
        const detailed = adaptiveSubdivideMesh(
          current,
          symmetryPoints(hit.localPoint, { x: state.brushSymmetryX, y: state.brushSymmetryY, z: state.brushSymmetryZ }),
          state.brushRadius * 1.15 / localScale,
          Math.max(0.08, state.brushRadius * state.sculptDetail / localScale),
        )
        if (detailed.positions.length !== current.positions.length) {
          replacePolygonGeometry(hit.object, detailed)
          mask = new Float32Array(detailed.mask ?? new Array(detailed.positions.length / 3).fill(0))
          updateMaskColors(hit.object, hit.node.color, mask)
        }
      }

      const cameraDirection = camera.getWorldDirection(new THREE.Vector3())
      const adjacency = buildAdjacency(hit.object.geometry.getIndex()?.array ?? [], hit.object.geometry.getAttribute('position').count)
      const affectedVertices = connectedVertexSet(adjacency, hit.seedVertex)
      polygonStroke = {
        nodeId: hit.node.id,
        node: hit.node,
        object: hit.object,
        mode,
        mask,
        adjacency,
        affectedVertices,
        seedVertex: hit.seedVertex,
        startPoint: hit.localPoint.clone(),
        lastPoint: hit.localPoint.clone(),
        localNormal: hit.localNormal.clone(),
        worldNormal: hit.normal.clone(),
        dragPlane: new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDirection, hit.point),
        lastPlanePoint: hit.point.clone(),
        grabWeights: mode === 'grab' ? createGrabWeights(hit.object.geometry, hit.localPoint, state.brushRadius / localScale, state.brushFalloff, { x: state.brushSymmetryX, y: state.brushSymmetryY, z: state.brushSymmetryZ }, affectedVertices) : undefined,
        lastTopologyAt: performance.now(),
        modified: hit.object.geometry.getAttribute('position').count !== hit.node.mesh.positions.length / 3,
      }
      if (!['grab', 'snake'].includes(mode)) applyDirectBrush(event, hit)
      return true
    }

    const updatePlacement = (point: THREE.Vector3) => {
      const state = useEditor.getState()
      const node = state.document.nodes.find((item) => item.id === state.placingNodeId)
      const object = node ? sourceById.get(node.id) : undefined
      if (!node || !object || !placementStart) return
      const dx = point.x - placementStart.x
      const dy = point.y - placementStart.y
      const rawDistance = Math.hypot(dx, dy)
      if (rawDistance < 0.75) return
      const distance = Math.max(1, rawDistance)
      const parameters = { ...node.parameters }
      const transformValue = structuredClone(node.transform)

      if (node.kind === 'extrude' || node.kind === 'revolve') {
        // Recipe profiles are dimensioned before placement. Dragging positions
        // the exact outline instead of silently changing its stored geometry.
        transformValue.position = { x: point.x, y: point.y, z: parameters.height / 2 }
        object.scale.set(1, 1, 1)
      } else if (node.kind === 'box' || node.kind === 'roundedBox' || node.kind === 'wedge' || node.kind === 'loft') {
        parameters.width = Math.max(1, Math.abs(dx))
        parameters.depth = Math.max(1, Math.abs(dy))
        transformValue.position = { x: placementStart.x + dx / 2, y: placementStart.y + dy / 2, z: parameters.height / 2 }
        object.scale.set(parameters.width / node.parameters.width, parameters.depth / node.parameters.depth, 1)
      } else {
        parameters.radius = distance
        if (node.kind === 'cone') parameters.radiusTop = Math.min(parameters.radiusTop, distance * 0.8)
        transformValue.position = { x: placementStart.x, y: placementStart.y, z: node.kind === 'sphere' ? distance : node.kind === 'torus' ? parameters.radiusTop : parameters.height / 2 }
        const radialScale = distance / node.parameters.radius
        object.scale.set(radialScale, radialScale, node.kind === 'sphere' ? radialScale : 1)
      }
      transformValue.position.z -= nodeWorldBounds({ ...node, transform: transformValue, parameters }).min.z
      object.position.set(transformValue.position.x, transformValue.position.y, transformValue.position.z)
      placementPreview = { transform: transformValue, parameters }
    }

    let emptyPress: { x: number; y: number } | null = null
    const onPointerDown = (event: PointerEvent) => {
      host.focus({ preventScroll: true })
      if (event.button !== 0 || !event.isPrimary) return
      emptyPress = null
      const state = useEditor.getState()
      if (transformDragging) {
        const object = transform.object
        const nodeId = object?.userData.nodeId as string | undefined
        const axis = transform.axis
        const node = nodeId ? state.document.nodes.find((candidate) => candidate.id === nodeId) : undefined
        if (state.tool === 'move' && object && node && !node.locked && axis) {
          const worldPosition = object.getWorldPosition(new THREE.Vector3())
          const axisVector = axis === 'X' ? new THREE.Vector3(1, 0, 0) : axis === 'Y' ? new THREE.Vector3(0, 1, 0) : axis === 'Z' ? new THREE.Vector3(0, 0, 1) : null
          let normal: THREE.Vector3
          if (axisVector) {
            const eye = camera.position.clone().sub(worldPosition).normalize()
            normal = eye.sub(axisVector.clone().multiplyScalar(eye.dot(axisVector))).normalize()
            if (normal.lengthSq() < 1e-5) normal = axisVector.x ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
          } else if (axis === 'XY') normal = new THREE.Vector3(0, 0, 1)
          else if (axis === 'XZ') normal = new THREE.Vector3(0, 1, 0)
          else if (axis === 'YZ') normal = new THREE.Vector3(1, 0, 0)
          else normal = camera.position.clone().sub(worldPosition).normalize()
          const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, worldPosition)
          updateRay(event)
          const startPoint = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3())
          if (startPoint) {
            snapshotSelection()
            gizmoDrag = { nodeId: node.id, axis, startPoint, startPosition: object.position.clone(), plane: dragPlane }
            // TransformControls has already captured the handle. Its native
            // pointer-move path is inconsistent in some embedded browsers, so
            // use the same highlighted axis with our deterministic drag path.
            transform.dragging = false
            orbit.enabled = false
            renderer.domElement.setPointerCapture(event.pointerId)
            event.preventDefault()
          }
        }
        return
      }
      if (state.tool === 'draw-profile') {
        let point = pointOnPlane(event)
        if (!point) return
        const previous = sketchPoints.at(-1)
        if (previous && event.shiftKey) {
          if (Math.abs(point.x - previous.x) > Math.abs(point.y - previous.y)) point.y = previous.y
          else point.x = previous.x
        }
        if (state.translationSnap) {
          point.x = Math.round(point.x / state.translationSnap) * state.translationSnap
          point.y = Math.round(point.y / state.translationSnap) * state.translationSnap
        }
        if (sketchPoints.length >= 3 && point.distanceTo(sketchPoints[0]!) < 3) completeSketch()
        else { sketchPoints.push(point); refreshSketch() }
        event.preventDefault()
        return
      }
      if (state.tool === 'measure') {
        const point = measurementPoint(event)
        if (!point) return
        const value = { x: point.x, y: point.y, z: point.z }
        if (!measuring || !state.measurement) {
          measuring = true
          state.setMeasurement({ start: value, end: value, complete: false })
        } else {
          measuring = false
          state.setMeasurement({ ...state.measurement, end: value, complete: true })
        }
        event.preventDefault()
        return
      }
      if (state.tool === 'place' && state.placingNodeId) {
        const point = pointOnPlane(event)
        if (!point) return
        placementStart = point
        orbit.enabled = false
        const node = state.document.nodes.find((item) => item.id === state.placingNodeId)
        if (node) {
          const transformValue = structuredClone(node.transform)
          transformValue.position = {
            x: point.x,
            y: point.y,
            z: node.transform.position.z,
          }
          const object = sourceById.get(node.id)
          object?.position.set(transformValue.position.x, transformValue.position.y, transformValue.position.z)
          placementPreview = { transform: transformValue, parameters: structuredClone(node.parameters) }
        }
        renderer.domElement.setPointerCapture(event.pointerId)
        event.preventDefault()
        return
      }
      if (state.tool.startsWith('sculpt')) {
        const directHit = polygonHit(event)
        if (polygonToolMode(state.tool) && directHit && beginPolygonStroke(event, directHit)) {
          sculpting = true
          orbit.enabled = false
          renderer.domElement.setPointerCapture(event.pointerId)
          updateBrushCursor(directHit)
          event.preventDefault()
          return
        }
        const hit = resultHit(event)
        if (!hit) return
        sculpting = true
        orbit.enabled = false
        sculptHasHistory = false
        lastSculptPoint = null
        renderer.domElement.setPointerCapture(event.pointerId)
        stampSculpt(hit, event.shiftKey)
        event.preventDefault()
        return
      }
      if (state.meshComponentMode !== 'object' && state.selectedNodeId) {
        const object = sourceById.get(state.selectedNodeId)
        const node = state.document.nodes.find((candidate) => candidate.id === state.selectedNodeId)
        if (object && node?.mesh) {
          updateRay(event)
          const hit = raycaster.intersectObject(object, false).find(hit => sectionPointVisible(hit.point, useInspection.getState().section))
          if (hit?.face && hit.faceIndex != null) {
            if (state.meshComponentMode === 'face') state.selectMeshComponent('face', hit.faceIndex, event.ctrlKey || event.metaKey || event.shiftKey)
            else {
              const position = object.geometry.getAttribute('position')
              const candidates = [hit.face.a, hit.face.b, hit.face.c]
              const localPoint = object.worldToLocal(hit.point.clone())
              if (state.meshComponentMode === 'vertex') {
                let closest = candidates[0]!
                let distance = Infinity
                for (const index of candidates) {
                  const candidate = new THREE.Vector3().fromBufferAttribute(position, index)
                  const nextDistance = candidate.distanceToSquared(localPoint)
                  if (nextDistance < distance) { closest = index; distance = nextDistance }
                }
                state.selectMeshComponent('vertex', closest, event.ctrlKey || event.metaKey || event.shiftKey)
              } else {
                const edges = [[candidates[0]!, candidates[1]!], [candidates[1]!, candidates[2]!], [candidates[2]!, candidates[0]!]] as const
                let closest = edges[0]!
                let distance = Infinity
                for (const edge of edges) {
                  const start = new THREE.Vector3().fromBufferAttribute(position, edge[0])
                  const end = new THREE.Vector3().fromBufferAttribute(position, edge[1])
                  const point = new THREE.Line3(start, end).closestPointToPoint(localPoint, true, new THREE.Vector3())
                  const nextDistance = point.distanceToSquared(localPoint)
                  if (nextDistance < distance) { closest = edge; distance = nextDistance }
                }
                const key = closest[0] < closest[1] ? `${closest[0]}:${closest[1]}` : `${closest[1]}:${closest[0]}`
                const edgeIndex = extractMeshTopology(node.mesh).edgeIndexByKey.get(key)
                if (edgeIndex !== undefined) state.selectMeshComponent('edge', edgeIndex, event.ctrlKey || event.metaKey || event.shiftKey)
              }
            }
            event.preventDefault()
            return
          }
        }
      }
      updateRay(event)
      const hit = raycaster.intersectObjects(sourceGroup.children, false).find(hit => sectionPointVisible(hit.point, useInspection.getState().section))
      if (hit) {
        const nodeId = hit.object.userData.nodeId as string
        const additive = event.ctrlKey || event.metaKey || event.shiftKey
        if (additive || !state.selectedNodeIds.includes(nodeId)) state.selectNode(nodeId, additive)
        if (state.tool === 'move' && !state.document.sculptStrokes.length && !(transform as unknown as { axis?: string | null }).axis) {
          const node = state.document.nodes.find((item) => item.id === nodeId)
          const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3())
          if (node && !node.locked && point && !additive) {
            snapshotSelection()
            directDrag = { nodeId, startPoint: point, startPosition: hit.object.position.clone() }
            orbit.enabled = false
            renderer.domElement.setPointerCapture(event.pointerId)
            event.preventDefault()
          }
        }
      } else emptyPress = { x: event.clientX, y: event.clientY }
    }

    const onPointerMove = (event: PointerEvent) => {
      const state = useEditor.getState()
      if (state.tool === 'draw-profile') {
        const point = pointOnPlane(event)
        refreshSketch(point)
        return
      }
      if (gizmoDrag) {
        updateRay(event)
        const point = raycaster.ray.intersectPlane(gizmoDrag.plane, new THREE.Vector3())
        const object = sourceById.get(gizmoDrag.nodeId)
        if (point && object) {
          const delta = point.sub(gizmoDrag.startPoint)
          const next = gizmoDrag.startPosition.clone()
          if (gizmoDrag.axis === 'X') next.x += delta.x
          else if (gizmoDrag.axis === 'Y') next.y += delta.y
          else if (gizmoDrag.axis === 'Z') next.z += delta.z
          else {
            if (gizmoDrag.axis.includes('X')) next.x += delta.x
            if (gizmoDrag.axis.includes('Y')) next.y += delta.y
            if (gizmoDrag.axis.includes('Z')) next.z += delta.z
          }
          const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1
          const snap = state.translationSnap === null ? null : state.translationSnap * multiplier
          if (snap) {
            if (gizmoDrag.axis.includes('X')) next.x = Math.round(next.x / snap) * snap
            if (gizmoDrag.axis.includes('Y')) next.y = Math.round(next.y / snap) * snap
            if (gizmoDrag.axis.includes('Z')) next.z = Math.round(next.z / snap) * snap
          }
          object.position.copy(next)
          previewSelection(object)
        }
        return
      }
      if (directDrag) {
        const point = pointOnPlane(event)
        const object = sourceById.get(directDrag.nodeId)
        if (point && object) {
          const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1
          const snap = state.translationSnap === null ? null : state.translationSnap * multiplier
          const nextX = directDrag.startPosition.x + point.x - directDrag.startPoint.x
          const nextY = directDrag.startPosition.y + point.y - directDrag.startPoint.y
          object.position.x = snap ? Math.round(nextX / snap) * snap : nextX
          object.position.y = snap ? Math.round(nextY / snap) * snap : nextY
          previewSelection(object)
        }
        return
      }
      if (placementStart && state.tool === 'place') {
        const point = pointOnPlane(event)
        if (point) updatePlacement(point)
        return
      }
      if (state.tool.startsWith('sculpt')) {
        const directHit = polygonToolMode(state.tool) ? polygonHit(event) : null
        const hit = directHit ?? resultHit(event)
        updateBrushCursor(hit)
        if (polygonStroke) {
          const scale = polygonStroke.object.getWorldScale(new THREE.Vector3())
          const localScale = Math.max(0.0001, (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3)
          if (polygonStroke.mode === 'grab') {
            updateRay(event)
            const planePoint = raycaster.ray.intersectPlane(polygonStroke.dragPlane, new THREE.Vector3())
            if (planePoint) {
              const currentLocal = polygonStroke.object.worldToLocal(planePoint.clone())
              const previousLocal = polygonStroke.object.worldToLocal(polygonStroke.lastPlanePoint.clone())
              const brushHit = directHit ?? {
                point: planePoint.clone(),
                normal: polygonStroke.worldNormal,
                localPoint: currentLocal.clone(),
                localNormal: polygonStroke.localNormal,
                object: polygonStroke.object,
                node: polygonStroke.node,
                seedVertex: polygonStroke.seedVertex,
              }
              applyDirectBrush(event, brushHit, currentLocal.sub(previousLocal))
              polygonStroke.lastPlanePoint.copy(planePoint)
            }
          } else if (directHit) {
            const minimumSpacing = Math.max(0.015, state.brushRadius * state.brushSpacing / localScale)
            if (polygonStroke.lastPoint.distanceTo(directHit.localPoint) >= minimumSpacing) {
              const drag = polygonStroke.mode === 'snake' ? directHit.localPoint.clone().sub(polygonStroke.lastPoint) : undefined
              applyDirectBrush(event, directHit, drag)
            }
          }
        } else if (sculpting && hit) {
          const minimumSpacing = Math.max(0.15, state.brushRadius * state.brushSpacing)
          if (!lastSculptPoint || lastSculptPoint.distanceTo(hit.point) >= minimumSpacing) stampSculpt(hit, event.shiftKey)
        }
      } else {
        brushCursor.visible = false
      }
      if (state.tool === 'measure' && measuring && state.measurement) {
        const point = measurementPoint(event)
        if (point) state.setMeasurement({ ...state.measurement, end: { x: point.x, y: point.y, z: point.z }, complete: false })
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      const state = useEditor.getState()
      if (event.button !== 0 && event.type !== 'pointercancel') return
      if (emptyPress && Math.hypot(event.clientX - emptyPress.x, event.clientY - emptyPress.y) < 4) state.selectNode(null)
      emptyPress = null
      const drag = gizmoDrag ?? directDrag
      if (drag) {
        const object = sourceById.get(drag.nodeId)
        if (object) state.updateSelectionTransforms(previewSelection(object))
      }
      gizmoDrag = null
      directDrag = null
      transformSnapshot = []
      if (placementStart && state.placingNodeId) {
        const node = state.document.nodes.find((item) => item.id === state.placingNodeId)
        if (node) {
          const fallbackTransform = structuredClone(node.transform)
          fallbackTransform.position = {
            x: placementStart.x,
            y: placementStart.y,
            z: node.kind === 'sphere' ? node.parameters.radius : node.parameters.height / 2,
          }
          state.finishPlacement(node.id, placementPreview?.transform ?? fallbackTransform, placementPreview?.parameters ?? node.parameters)
        }
      }
      placementStart = null
      placementPreview = null
      if (polygonStroke) {
        if (polygonStroke.modified) state.commitPolygonSculpt(polygonStroke.nodeId, geometryToSculptMesh(polygonStroke.object.geometry, polygonStroke.mask))
        polygonStroke = null
      }
      sculpting = false
      sculptHasHistory = false
      lastSculptPoint = null
      orbit.enabled = true
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId)
    }

    const onPointerLeave = () => {
      renderer.domElement.classList.remove('sculpt-hit')
      if (!sculpting) brushCursor.visible = false
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)

    const frameObjects = (selectedOnly: boolean) => {
      const state = useEditor.getState()
      const bounds = new THREE.Box3()
      if (selectedOnly) {
        for (const id of state.selectedNodeIds) {
          const object = sourceById.get(id)
          if (object) bounds.expandByObject(object)
        }
      } else bounds.setFromObject(state.showResult && resultGroup.children[0] ? resultGroup.children[0] : sourceGroup)
      if (bounds.isEmpty()) return
      const center = bounds.getCenter(new THREE.Vector3())
      const size = bounds.getSize(new THREE.Vector3())
      const direction = camera.position.clone().sub(orbit.target).normalize()
      const limitingView = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect)
      const distance = Math.max(12, size.length() / (2 * limitingView) * 1.15)
      orbit.target.copy(center)
      camera.position.copy(center).addScaledVector(direction, distance)
      camera.near = Math.max(0.01, distance / 1000)
      camera.far = distance * 20
      camera.updateProjectionMatrix()
      orbit.update()
    }
    const frameListener = (event: Event) => frameObjects(Boolean((event as CustomEvent<{ selectedOnly: boolean }>).detail?.selectedOnly))
    const viewListener = (event: Event) => {
      const view = (event as CustomEvent<{ view: string }>).detail?.view ?? 'iso'
      const targetObject = resultGroup.children[0] ?? sourceGroup
      const bounds = new THREE.Box3().setFromObject(targetObject)
      const center = bounds.isEmpty() ? orbit.target.clone() : bounds.getCenter(new THREE.Vector3())
      const distance = Math.max(30, camera.position.distanceTo(orbit.target))
      const directions: Record<string, THREE.Vector3> = {
        iso: new THREE.Vector3(1, -1, 0.82), top: new THREE.Vector3(0, 0, 1), bottom: new THREE.Vector3(0, 0, -1),
        front: new THREE.Vector3(0, -1, 0), back: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0), left: new THREE.Vector3(-1, 0, 0),
      }
      const direction = (directions[view] ?? directions.iso!).normalize()
      camera.up.set(0, Math.abs(direction.z) > 0.99 ? 1 : 0, Math.abs(direction.z) > 0.99 ? 0 : 1)
      orbit.target.copy(center)
      camera.position.copy(center).addScaledVector(direction, distance)
      camera.updateProjectionMatrix()
      orbit.update()
    }
    window.addEventListener('formforge:frame', frameListener)
    window.addEventListener('formforge:view', viewListener)
    window.addEventListener('formforge:finish-sketch', completeSketch)
    window.addEventListener('formforge:cancel-sketch', cancelSketch)

    const resize = new ResizeObserver(() => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      const nextAspect = width / height
      const framingScale = Math.min(1, camera.aspect) / Math.min(1, nextAspect)
      camera.position.sub(orbit.target).multiplyScalar(framingScale).add(orbit.target)
      camera.aspect = nextAspect
      camera.updateProjectionMatrix()
      orbit.update()
    })
    resize.observe(host)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      orbit.update()
      renderer.render(scene, camera)
    }
    animate()

    const sourceById = new Map<string, THREE.Mesh>()
    runtime.current = { scene, camera, renderer, orbit, transform, sourceGroup, resultGroup, grid, buildPlate, referenceGroup, measurementGroup, brushCursor, sketchGroup, sourceById, resize, frame }
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('formforge:frame', frameListener)
      window.removeEventListener('formforge:view', viewListener)
      window.removeEventListener('formforge:finish-sketch', completeSketch)
      window.removeEventListener('formforge:cancel-sketch', cancelSketch)
      transform.dispose()
      orbit.dispose()
      disposeGroup(sourceGroup)
      disposeGroup(resultGroup)
      disposeGroup(sketchGroup)
      disposeGroup(referenceGroup)
      disposeGroup(measurementGroup)
      renderer.dispose()
      host.removeChild(renderer.domElement)
      runtime.current = null
    }
  }, [])

  useEffect(() => {
    const rt = runtime.current
    if (!rt) return
    const light = theme === 'light'
    const background = light ? '#f0eff5' : '#181822'
    rt.scene.background = new THREE.Color(background)
    rt.scene.fog = new THREE.FogExp2(background, light ? 0.0032 : 0.0028)
    const plateMaterial = rt.buildPlate.material as THREE.MeshStandardMaterial
    plateMaterial.color.set(light ? '#ebe9f0' : '#1c1e28')
    plateMaterial.opacity = light ? 0.82 : 0.68
    plateMaterial.needsUpdate = true
    const gridMaterials = Array.isArray(rt.grid.material) ? rt.grid.material : [rt.grid.material]
    gridMaterials.forEach((material) => { material.opacity = light ? 0.18 : 0.3; material.needsUpdate = true })
  }, [theme])

  useEffect(() => {
    const rt = runtime.current
    if (!rt) return
    rt.transform.detach()

    const visibleIds = new Set(document.nodes.filter((node) => node.visible).map((node) => node.id))
    for (const [id, object] of rt.sourceById) {
      if (visibleIds.has(id)) continue
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
      object.children.forEach((child) => {
        const line = child as THREE.LineSegments
        line.geometry?.dispose()
        const lineMaterials = Array.isArray(line.material) ? line.material : line.material ? [line.material] : []
        lineMaterials.forEach((material) => material.dispose())
      })
      rt.sourceGroup.remove(object)
      rt.sourceById.delete(id)
    }

    for (const node of document.nodes) {
      if (!node.visible) continue
      const selected = selectedNodeIds.includes(node.id)
      const suppressed = Boolean(node.suppressed)
      const editing = !showResult
      const signature = nodeGeometrySignature(node)
      let object = rt.sourceById.get(node.id)
      if (!object) {
        object = new THREE.Mesh(makeSourceGeometry(node), new THREE.MeshStandardMaterial({ fog: false }))
        object.userData.nodeId = node.id
        object.userData.geometrySignature = signature
        rt.sourceGroup.add(object)
        rt.sourceById.set(node.id, object)
      } else if (object.userData.geometrySignature !== signature) {
        object.geometry.dispose()
        object.geometry = makeSourceGeometry(node)
        object.userData.geometrySignature = signature
      }

      const material = object.material as THREE.MeshStandardMaterial
      material.color.set(suppressed ? '#6d7080' : node.boolean === 'cut' ? '#ff7185' : node.boolean === 'intersect' ? '#b88cff' : node.color)
      material.roughness = 0.38
      material.metalness = 0.05
      material.transparent = true
      material.opacity = suppressed ? selected ? 0.28 : 0.1 : editing
        ? node.boolean === 'add' ? 0.88 : 0.28
        : selected || xrayEnabled ? 0.14 : 0
      material.depthWrite = !suppressed && editing && node.boolean === 'add' && displayMode === 'solid'
      material.wireframe = suppressed || displayMode === 'wireframe' || (node.boolean !== 'add' && editing)
      updateMaskColors(object, suppressed ? '#6d7080' : node.color, node.mesh?.mask)
      material.needsUpdate = true
      object.visible = editing || selected || xrayEnabled
      object.castShadow = editing && node.boolean === 'add'
      object.receiveShadow = editing && node.boolean === 'add'
      applyNodeTransform(object, node)

      const oldOutline = object.getObjectByName('selection-outline') as THREE.LineSegments | undefined
      const showOutline = selected || xrayEnabled || (editing && (suppressed || node.boolean !== 'add'))
      let outline = oldOutline
      if (outline && !showOutline) {
        outline.geometry.dispose()
        const outlineMaterials = Array.isArray(outline.material) ? outline.material : [outline.material]
        outlineMaterials.forEach((candidate) => candidate.dispose())
        object.remove(outline)
        outline = undefined
      }
      if (showOutline) {
        if (!outline || outline.userData.geometrySignature !== signature) {
          if (outline) {
            outline.geometry.dispose()
            const oldMaterials = Array.isArray(outline.material) ? outline.material : [outline.material]
            oldMaterials.forEach((candidate) => candidate.dispose())
            object.remove(outline)
          }
          outline = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 18), new THREE.LineBasicMaterial())
          outline.name = 'selection-outline'
          outline.userData.geometrySignature = signature
          outline.renderOrder = 15
          outline.raycast = () => undefined
          object.add(outline)
        }
        const outlineMaterial = outline.material as THREE.LineBasicMaterial
        outlineMaterial.color.set(suppressed ? '#777b89' : node.boolean === 'cut' ? '#ff7d91' : node.boolean === 'intersect' ? '#c9a7ff' : selected ? '#e6e7ff' : '#8491c9')
        outlineMaterial.transparent = true
        outlineMaterial.opacity = selected ? 1 : node.boolean !== 'add' ? 0.72 : 0.52
        outlineMaterial.depthTest = editing && !xrayEnabled
        outlineMaterial.needsUpdate = true
      }
    }
    const selectedObject = selectedNodeId ? rt.sourceById.get(selectedNodeId) : undefined
    if (selectedObject && document.sculptStrokes.length === 0 && !document.nodes.find(node => node.id === selectedNodeId)?.locked && ['move', 'rotate', 'scale'].includes(tool)) {
      rt.transform.setMode(transformModeFor(tool))
      rt.transform.setSpace(tool === 'scale' ? 'local' : 'world')
      rt.transform.attach(selectedObject)
    }
  }, [document.nodes, document.sculptStrokes, selectedNodeId, selectedNodeIds, showResult, tool, xrayEnabled, displayMode])

  useEffect(() => {
    const rt = runtime.current
    if (!rt) return

    for (const object of rt.sourceById.values()) {
      const previous = object.getObjectByName('mesh-component-overlay') as THREE.Group | undefined
      if (!previous) continue
      disposeGroup(previous)
      object.remove(previous)
    }

    if (meshComponentMode === 'object' || !selectedNodeId) return
    const object = rt.sourceById.get(selectedNodeId)
    const node = document.nodes.find((candidate) => candidate.id === selectedNodeId)
    if (!object || !node?.mesh) return

    const positions = object.geometry.getAttribute('position')
    const index = object.geometry.index
    if (!positions || !index) return

    const overlay = new THREE.Group()
    overlay.name = 'mesh-component-overlay'
    overlay.renderOrder = 30
    const disableRaycast = (candidate: THREE.Object3D) => { candidate.raycast = () => undefined }

    if (meshComponentMode === 'vertex') {
      const allGeometry = new THREE.BufferGeometry()
      allGeometry.setAttribute('position', positions.clone())
      const allPoints = new THREE.Points(allGeometry, new THREE.PointsMaterial({
        color: '#9ea4c2', size: 3.2, sizeAttenuation: false, transparent: true,
        opacity: 0.72, depthTest: false,
      }))
      disableRaycast(allPoints)
      overlay.add(allPoints)

      const selectedPositions: number[] = []
      for (const vertex of selectedMeshVertices) {
        if (vertex < 0 || vertex >= positions.count) continue
        selectedPositions.push(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex))
      }
      if (selectedPositions.length) {
        const selectedGeometry = new THREE.BufferGeometry()
        selectedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedPositions, 3))
        const selectedPoints = new THREE.Points(selectedGeometry, new THREE.PointsMaterial({
          color: '#ffd166', size: 7, sizeAttenuation: false, depthTest: false,
        }))
        disableRaycast(selectedPoints)
        overlay.add(selectedPoints)
      }
    } else {
      const edgeKeys = new Set<string>()
      const edgePositions: number[] = []
      const selectedEdgePositions: number[] = []
      const selectedEdgeSet = new Set(selectedMeshEdges)
      const topology = extractMeshTopology(node.mesh)
      const faceIndices = new Set(selectedMeshFaces)
      const selectedFacePositions: number[] = []
      const pushEdge = (a: number, b: number) => {
        const low = Math.min(a, b); const high = Math.max(a, b)
        const key = `${low}:${high}`
        if (edgeKeys.has(key)) return
        edgeKeys.add(key)
        const topologyEdge = topology.edgeIndexByKey.get(key)
        const target = topologyEdge !== undefined && selectedEdgeSet.has(topologyEdge) ? selectedEdgePositions : edgePositions
        target.push(
          positions.getX(a), positions.getY(a), positions.getZ(a),
          positions.getX(b), positions.getY(b), positions.getZ(b),
        )
      }
      for (let offset = 0; offset + 2 < index.count; offset += 3) {
        const a = index.getX(offset); const b = index.getX(offset + 1); const c = index.getX(offset + 2)
        pushEdge(a, b); pushEdge(b, c); pushEdge(c, a)
        if (meshComponentMode === 'face' && faceIndices.has(offset / 3)) {
          for (const vertex of [a, b, c]) selectedFacePositions.push(
            positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex),
          )
        }
      }

      if (edgePositions.length) {
        const wireGeometry = new THREE.BufferGeometry()
        wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3))
        const wire = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({
          color: '#8991b1', transparent: true, opacity: meshComponentMode === 'edge' ? 0.62 : 0.42,
          depthTest: false,
        }))
        disableRaycast(wire)
        overlay.add(wire)
      }
      if (selectedEdgePositions.length) {
        const selectedGeometry = new THREE.BufferGeometry()
        selectedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedEdgePositions, 3))
        const selectedEdges = new THREE.LineSegments(selectedGeometry, new THREE.LineBasicMaterial({
          color: '#ffd166', depthTest: false,
        }))
        disableRaycast(selectedEdges)
        overlay.add(selectedEdges)
      }
      if (selectedFacePositions.length) {
        const faceGeometry = new THREE.BufferGeometry()
        faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedFacePositions, 3))
        faceGeometry.computeVertexNormals()
        const faces = new THREE.Mesh(faceGeometry, new THREE.MeshBasicMaterial({
          color: '#ffd166', transparent: true, opacity: 0.34, depthTest: false,
          side: THREE.DoubleSide,
        }))
        disableRaycast(faces)
        overlay.add(faces)
      }
    }

    object.add(overlay)
    return () => {
      if (overlay.parent) overlay.parent.remove(overlay)
      disposeGroup(overlay)
    }
  }, [document.nodes, selectedNodeId, meshComponentMode, selectedMeshVertices, selectedMeshEdges, selectedMeshFaces])

  useEffect(() => {
    const rt = runtime.current
    if (!rt) return
    disposeGroup(rt.resultGroup)
    if (!meshPayload?.positions.length) return
    const geometry = meshPayloadToGeometry(meshPayload)
    const material = new THREE.MeshStandardMaterial({
      color: '#829eff', roughness: 0.32, metalness: 0.08, fog: false,
      wireframe: displayMode === 'wireframe',
      transparent: displayMode === 'vertices',
      opacity: displayMode === 'vertices' ? 0.08 : 1,
    })
    const object = new THREE.Mesh(geometry, material)
    object.castShadow = true
    object.receiveShadow = true
    // The result group owns visibility; a rebuild in Edit shapes must remain
    // available when the user switches back to Solid result.
    rt.resultGroup.add(object)
    if (displayMode === 'vertices') {
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#d9dbff', size: 1.15, sizeAttenuation: true }))
      points.raycast = () => undefined
      object.add(points)
    }
  }, [meshPayload, displayMode])

  useEffect(() => {
    const rt = runtime.current
    if (!rt) return
    rt.resultGroup.visible = showResult
  }, [showResult])

  useEffect(() => {
    const rt = runtime.current
    if (!rt) return
    rt.grid.visible = showGrid
    rt.buildPlate.visible = showGrid
  }, [showGrid])

  useEffect(() => {
    if (runtime.current) runtime.current.referenceGroup.visible = showReferencePlanes
  }, [showReferencePlanes])

  useEffect(() => { useInspection.getState().resetSection() }, [document.id])
  useEffect(() => { useEditor.getState().setMeasurement(null) }, [document.nodes, document.sculptStrokes, document.id, showResult, section])

  useEffect(() => {
    const rt = runtime.current
    if (!rt) return
    const planes = section.enabled ? [sectionPlane(section)] : []
    for (const group of [rt.sourceGroup, rt.resultGroup]) group.traverse(object => {
      const mesh = object as THREE.Mesh
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const material of materials) { material.clippingPlanes = planes; material.clipShadows = true; material.needsUpdate = true }
    })
  }, [section, document.nodes, selectedNodeIds, meshPayload, displayMode, showResult, tool, xrayEnabled, selectedMeshVertices, selectedMeshEdges, selectedMeshFaces])

  useEffect(() => {
    const group = runtime.current?.measurementGroup
    if (!group) return
    disposeGroup(group)
    if (!measurement) return
    const start = new THREE.Vector3(measurement.start.x, measurement.start.y, measurement.start.z)
    const end = new THREE.Vector3(measurement.end.x, measurement.end.y, measurement.end.z)
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: '#ffd36c', depthTest: false, transparent: true, opacity: 0.95 }))
    line.renderOrder = 40
    group.add(line)
    for (const point of [start, end]) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff0b8', depthTest: false }))
      marker.position.copy(point)
      marker.renderOrder = 41
      group.add(marker)
    }
  }, [measurement])

  useEffect(() => {
    const rt = runtime.current
    if (!rt) return
    rt.transform.setTranslationSnap(translationSnap)
    rt.transform.setRotationSnap(rotationSnap ? THREE.MathUtils.degToRad(rotationSnap) : null)
    rt.transform.setScaleSnap(scaleSnap || null)
  }, [translationSnap, rotationSnap, scaleSnap])

  useEffect(() => {
    const cursor = runtime.current?.brushCursor
    if (!cursor) return
    cursor.scale.setScalar(brushRadius)
    const inner = cursor.children.find((child) => child.userData.inner)
    inner?.scale.setScalar(Math.max(0.12, brushStrength))
  }, [brushRadius, brushStrength])

  return <div ref={hostRef} tabIndex={0} role="region" className={`viewport-canvas ${tool === 'place' || tool === 'draw-profile' || tool === 'measure' ? 'is-placing' : tool.startsWith('sculpt') ? 'is-sculpting' : ''}`} aria-label="3D modeling viewport" />
}
