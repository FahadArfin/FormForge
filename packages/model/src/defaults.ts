import { nanoid } from 'nanoid'
import type { BooleanMode, MaterialPaletteEntry, ModelDocument, ModelNode, PrimitiveKind, Vec3Value } from './types.js'

const now = () => new Date().toISOString()
export const vec3 = (x = 0, y = 0, z = 0): Vec3Value => ({ x, y, z })

/** Returns a fresh beginner-friendly palette using the first four logical print-color slots. */
export function createDefaultMaterialPalette(): MaterialPaletteEntry[] {
  return [
    { id: 'material-print-1', name: 'Primary blue', color: '#78A6FF', printSlot: 1 },
    { id: 'material-print-2', name: 'Mint', color: '#6FD8B8', printSlot: 2 },
    { id: 'material-print-3', name: 'Accent orange', color: '#FFB45C', printSlot: 3 },
    { id: 'material-print-4', name: 'Neutral white', color: '#F2F2F5', printSlot: 4 },
  ]
}

export function createNode(kind: PrimitiveKind, boolean: BooleanMode = 'add', position = vec3()): ModelNode {
  const names: Record<PrimitiveKind, string> = {
    box: 'Box',
    roundedBox: 'Rounded box',
    cylinder: 'Cylinder',
    sphere: 'Sphere',
    cone: 'Cone',
    torus: 'Torus',
    capsule: 'Capsule',
    tube: 'Tube',
    wedge: 'Wedge',
    star: 'Star',
    gear: 'Gear',
    loft: 'Section loft',
    spring: 'Spring',
    extrude: 'Extruded sketch',
    revolve: 'Revolved sketch',
    mesh: 'Imported mesh',
  }
  const colors: Record<PrimitiveKind, string> = {
    box: '#78a6ff',
    roundedBox: '#7f9cff',
    cylinder: '#6fd8b8',
    sphere: '#c995ff',
    cone: '#ffb45c',
    torus: '#ff86b5',
    capsule: '#66d6d1',
    tube: '#f1cf6b',
    wedge: '#ef8b72',
    star: '#b8d96d',
    gear: '#f2bf62',
    loft: '#77d2e8',
    spring: '#f191bf',
    extrude: '#78d2ff',
    revolve: '#8be1c3',
    mesh: '#8dc8c2',
  }
  return {
    id: nanoid(),
    name: boolean === 'cut' ? `${names[kind]} cut` : names[kind],
    kind,
    boolean,
    transform: {
      position,
      rotation: vec3(),
      scale: vec3(1, 1, 1),
    },
    parameters: {
      width: kind === 'loft' ? 32 : 28,
      depth: kind === 'loft' ? 24 : 28,
      height: kind === 'box' || kind === 'roundedBox' ? 18 : kind === 'spring' ? 36 : 28,
      radius: kind === 'sphere' ? 14 : kind === 'gear' ? 18 : 12,
      radiusTop: kind === 'cone' || kind === 'spring' ? 2 : kind === 'gear' ? 13 : 12,
      segments: 48,
      fillet: 3,
      count: kind === 'spring' ? 6 : kind === 'gear' ? 16 : 12,
      twist: kind === 'loft' ? 25 : 0,
      topWidth: 16,
      topDepth: 16,
      wall: 0,
    },
    color: boolean === 'cut' ? '#ff6f7d' : colors[kind],
    materialSlot: 1,
    combined: false,
    deformation: { kind: 'none', amount: 0 },
    surface: { smoothAngle: 0, refineLength: 0, simplifyTolerance: 0, hollowThickness: 0 },
    layer: 'Default',
    visible: true,
    suppressed: false,
    locked: false,
    createdAt: now(),
  }
}

export function createDocument(name = 'Untitled model'): ModelDocument {
  const createdAt = now()
  const base = createNode('box', 'add', vec3(0, 0, 9))
  base.name = 'Starter block'
  return {
    schemaVersion: 1,
    id: nanoid(),
    name,
    units: 'mm',
    workspaceMode: 'simple',
    nodes: [base],
    materialPalette: createDefaultMaterialPalette(),
    namedParameters: [],
    sculptStrokes: [],
    printer: {
      name: 'Standard 220',
      buildVolume: vec3(220, 220, 250),
      nozzleDiameter: 0.4,
      minimumWall: 0.8,
      overhangAngle: 45,
    },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  }
}

export function createDemoDocument(): ModelDocument {
  const doc = createDocument('Controller stand')
  doc.nodes = []

  const base = createNode('box', 'add', vec3(0, 0, 5))
  base.name = 'Rounded base'
  base.parameters.width = 72
  base.parameters.depth = 54
  base.parameters.height = 10

  const cradle = createNode('cylinder', 'add', vec3(0, 0, 17))
  cradle.name = 'Cradle'
  cradle.parameters.height = 32
  cradle.parameters.radius = 23
  cradle.transform.rotation.x = 90
  cradle.transform.scale.y = 1.25

  const carve = createNode('cylinder', 'cut', vec3(0, -1, 20))
  carve.name = 'Comfort carve'
  carve.parameters.height = 42
  carve.parameters.radius = 17
  carve.transform.rotation.x = 90
  carve.transform.scale.y = 1.25

  doc.nodes = [base, cradle, carve]
  return doc
}
