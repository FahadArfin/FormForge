import type { ParameterDefinition } from './parameters.js'

export type Vec3Value = { x: number; y: number; z: number }

export type PrimitiveKind = 'box' | 'roundedBox' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'capsule' | 'tube' | 'wedge' | 'star' | 'gear' | 'loft' | 'spring' | 'extrude' | 'revolve' | 'mesh'
export type BooleanMode = 'add' | 'cut' | 'intersect'
export type WorkspaceMode = 'simple' | 'pro'
export type ToolMode = 'select' | 'place' | 'draw-profile' | 'measure' | 'move' | 'rotate' | 'scale' | 'sculpt-add' | 'sculpt-carve' | 'sculpt-draw' | 'sculpt-clay' | 'sculpt-smooth' | 'sculpt-inflate' | 'sculpt-pinch' | 'sculpt-flatten' | 'sculpt-crease' | 'sculpt-grab' | 'sculpt-snake' | 'sculpt-relax' | 'sculpt-mask'
export type BrushFalloff = 'smooth' | 'sharp' | 'flat'
export type DeformKind = 'none' | 'taper' | 'twist' | 'bend'
export type ParameterBindingTarget =
  | 'width'
  | 'depth'
  | 'height'
  | 'radius'
  | 'radiusTop'
  | 'fillet'
  | 'topWidth'
  | 'topDepth'
  | 'wall'
  | 'positionX'
  | 'positionY'
  | 'positionZ'
  | 'twist'
  | 'rotationX'
  | 'rotationY'
  | 'rotationZ'

export interface TransformValue {
  position: Vec3Value
  rotation: Vec3Value
  scale: Vec3Value
}

export interface PrimitiveParameters {
  width: number
  depth: number
  height: number
  radius: number
  radiusTop: number
  segments: number
  fillet: number
  count: number
  twist: number
  topWidth: number
  topDepth: number
  wall: number
}

export interface SurfaceModifiers {
  smoothAngle: number
  refineLength: number
  simplifyTolerance: number
  hollowThickness: number
}

/** A document-scoped printable material/color that a slicer can map to an extruder or AMS tray. */
export interface MaterialPaletteEntry {
  /** Stable identifier referenced by nodes and triangle assignments. */
  id: string
  name: string
  /** Opaque sRGB color encoded as #RRGGBB for 3MF base-material output. */
  color: string
  /** Optional one-based logical print-color slot; physical tray mapping remains a slicer concern. */
  printSlot?: number
}

/** Sparse material override for triangles in an indexed mesh. */
export interface TriangleMaterialAssignment {
  materialId: string
  /** Zero-based triangle indices; each triangle may occur in at most one assignment. */
  triangleIndices: number[]
}

export interface SketchConstraint {
  type: 'horizontal' | 'vertical' | 'equal' | 'distance' | 'coincident' | 'parallel' | 'perpendicular' | 'angle'
  a: number
  b: number
  /** Distance in document units, or a signed directed angle in degrees for angle constraints. */
  value?: number
}

export interface ModelNode {
  id: string
  name: string
  kind: PrimitiveKind
  boolean: BooleanMode
  transform: TransformValue
  parameters: PrimitiveParameters
  parameterBindings?: Partial<Record<ParameterBindingTarget, string>>
  profile?: { x: number; y: number }[]
  profileSettings?: {
    curveMode: 'polyline' | 'rounded' | 'spline'
    cornerRadius: number
    offset: number
    tension: number
    resolution: number
  }
  profileConstraints?: SketchConstraint[]
  mesh?: {
    positions: number[]
    indices: number[]
    mask?: number[]
    triangleMaterials?: TriangleMaterialAssignment[]
  }
  color: string
  /** Palette-backed default material. Legacy color/materialSlot remain valid fallbacks. */
  materialId?: string
  materialSlot?: number
  combined?: boolean
  groupId?: string
  groupOperation?: 'boolean' | 'hull'
  layer?: string
  deformation?: { kind: DeformKind; amount: number }
  surface?: SurfaceModifiers
  visible: boolean
  suppressed?: boolean
  locked: boolean
  createdAt: string
}

export interface SculptStroke {
  id: string
  nodeId: string
  mode: 'add' | 'carve' | 'smooth' | 'inflate' | 'pinch' | 'flatten'
  center: Vec3Value
  normal?: Vec3Value
  radius: number
  strength: number
  falloff?: BrushFalloff
  createdAt: string
}

export interface PrinterProfile {
  name: string
  buildVolume: Vec3Value
  nozzleDiameter: number
  minimumWall: number
  overhangAngle: number
}

export interface ParameterVariant {
  id: string
  name: string
  parameters: ParameterDefinition[]
}

export interface ModelDocument {
  schemaVersion: 1
  id: string
  name: string
  units: 'mm' | 'in'
  workspaceMode: WorkspaceMode
  nodes: ModelNode[]
  materialPalette: MaterialPaletteEntry[]
  namedParameters: ParameterDefinition[]
  parameterVariants?: ParameterVariant[]
  sculptStrokes: SculptStroke[]
  printer: PrinterProfile
  revision: number
  createdAt: string
  updatedAt: string
}

export type ModelCommand =
  | { type: 'add-node'; node: ModelNode }
  | { type: 'add-nodes'; nodes: ModelNode[] }
  | { type: 'update-node'; nodeId: string; patch: Partial<Omit<ModelNode, 'id' | 'createdAt'>> }
  | { type: 'update-nodes'; nodeIds: string[]; patch: Partial<Omit<ModelNode, 'id' | 'createdAt'>> }
  | { type: 'replace-nodes'; nodes: ModelNode[] }
  | { type: 'remove-node'; nodeId: string }
  | { type: 'remove-nodes'; nodeIds: string[] }
  | { type: 'duplicate-node'; nodeId: string; newNode: ModelNode }
  | { type: 'add-sculpt-stroke'; stroke: SculptStroke }
  | { type: 'rename-document'; name: string }
  | { type: 'set-workspace-mode'; mode: WorkspaceMode }
  | { type: 'replace-document'; document: ModelDocument }

export interface MeshPayload {
  positions: Float32Array
  indices: Uint32Array
  volume: number
  triangleCount: number
}

export interface PrintIssue {
  id: string
  severity: 'info' | 'warning' | 'error'
  title: string
  description: string
}

export interface PrintAnalysis {
  status: 'ready' | 'warning' | 'blocked'
  dimensions: Vec3Value
  volume: number
  triangleCount: number
  issues: PrintIssue[]
}
