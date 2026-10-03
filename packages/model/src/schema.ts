import { z } from 'zod'

const vec3Schema = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
const transformSchema = z.object({ position: vec3Schema, rotation: vec3Schema, scale: vec3Schema })
const parameterBindingSchema = z.object({
  width: z.string().min(1).optional(),
  depth: z.string().min(1).optional(),
  height: z.string().min(1).optional(),
  radius: z.string().min(1).optional(),
  radiusTop: z.string().min(1).optional(),
  fillet: z.string().min(1).optional(),
  topWidth: z.string().min(1).optional(),
  topDepth: z.string().min(1).optional(),
  wall: z.string().min(1).optional(),
  positionX: z.string().min(1).optional(),
  positionY: z.string().min(1).optional(),
  positionZ: z.string().min(1).optional(),
  twist: z.string().min(1).optional(),
  rotationX: z.string().min(1).optional(),
  rotationY: z.string().min(1).optional(),
  rotationZ: z.string().min(1).optional(),
}).strict()

const namedParameterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  expression: z.string(),
  unit: z.enum(['mm', 'cm', 'm', 'in', 'deg', 'rad']),
  value: z.number().finite(),
})

export const materialPaletteEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Material color must use #RRGGBB.'),
  printSlot: z.number().int().min(1).max(16).optional(),
}).strict()

export const triangleMaterialAssignmentSchema = z.object({
  materialId: z.string().min(1),
  triangleIndices: z.array(z.number().int().nonnegative()).min(1),
}).strict()

const sketchIndexSchema = z.number().int().nonnegative()
const sketchConstraintSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('horizontal'), a: sketchIndexSchema, b: sketchIndexSchema, value: z.number().finite().optional() }).strict(),
  z.object({ type: z.literal('vertical'), a: sketchIndexSchema, b: sketchIndexSchema, value: z.number().finite().optional() }).strict(),
  z.object({ type: z.literal('equal'), a: sketchIndexSchema, b: sketchIndexSchema, value: z.number().finite().optional() }).strict(),
  z.object({ type: z.literal('distance'), a: sketchIndexSchema, b: sketchIndexSchema, value: z.number().finite().nonnegative() }).strict(),
  z.object({ type: z.literal('coincident'), a: sketchIndexSchema, b: sketchIndexSchema, value: z.number().finite().optional() }).strict(),
  z.object({ type: z.literal('parallel'), a: sketchIndexSchema, b: sketchIndexSchema, value: z.number().finite().optional() }).strict(),
  z.object({ type: z.literal('perpendicular'), a: sketchIndexSchema, b: sketchIndexSchema, value: z.number().finite().optional() }).strict(),
  z.object({ type: z.literal('angle'), a: sketchIndexSchema, b: sketchIndexSchema, value: z.number().finite() }).strict(),
])

export const modelNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['box', 'roundedBox', 'cylinder', 'sphere', 'cone', 'torus', 'capsule', 'tube', 'wedge', 'star', 'gear', 'loft', 'spring', 'extrude', 'revolve', 'mesh']),
  boolean: z.enum(['add', 'cut', 'intersect']),
  transform: transformSchema,
  parameters: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    height: z.number().positive(),
    radius: z.number().positive(),
    radiusTop: z.number().nonnegative(),
    segments: z.number().int().min(8).max(256),
    fillet: z.number().nonnegative().default(2),
    count: z.number().int().min(1).max(256).default(12),
    twist: z.number().finite().default(0),
    topWidth: z.number().positive().default(14),
    topDepth: z.number().positive().default(14),
    wall: z.number().nonnegative().default(0),
  }),
  parameterBindings: parameterBindingSchema.optional(),
  profile: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).min(3).optional(),
  profileSettings: z.object({
    curveMode: z.enum(['polyline', 'rounded', 'spline']),
    cornerRadius: z.number().finite().nonnegative().max(1_000),
    offset: z.number().finite().min(-1_000).max(1_000),
    tension: z.number().finite().min(0).max(1),
    resolution: z.number().int().min(1).max(64),
  }).strict().optional(),
  profileConstraints: z.array(sketchConstraintSchema).optional(),
  mesh: z.object({
    positions: z.array(z.number().finite()),
    indices: z.array(z.number().int().nonnegative()),
    mask: z.array(z.number().min(0).max(1)).optional(),
    triangleMaterials: z.array(triangleMaterialAssignmentSchema).optional(),
  }).optional(),
  color: z.string(),
  materialId: z.string().min(1).optional(),
  materialSlot: z.number().int().min(1).max(4).optional(),
  combined: z.boolean().optional(),
  groupId: z.string().optional(),
  groupOperation: z.enum(['boolean', 'hull']).optional(),
  layer: z.string().optional(),
  deformation: z.object({ kind: z.enum(['none', 'taper', 'twist', 'bend']), amount: z.number().finite() }).optional(),
  surface: z.object({
    smoothAngle: z.number().min(0).max(180),
    refineLength: z.number().nonnegative(),
    simplifyTolerance: z.number().nonnegative(),
    hollowThickness: z.number().nonnegative(),
  }).optional(),
  visible: z.boolean(),
  suppressed: z.boolean().optional(),
  locked: z.boolean(),
  createdAt: z.string(),
})

export const modelDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  units: z.enum(['mm', 'in']),
  workspaceMode: z.enum(['simple', 'pro']),
  nodes: z.array(modelNodeSchema),
  materialPalette: z.array(materialPaletteEntrySchema).max(256).default([]),
  namedParameters: z.array(namedParameterSchema).default([]),
  parameterVariants: z.array(z.object({
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(64),
    parameters: z.array(namedParameterSchema.extend({ name: z.string().min(1).max(128), expression: z.string().max(256) })).min(1).max(256),
  })).max(24).optional(),
  sculptStrokes: z.array(z.object({
    id: z.string(),
    nodeId: z.string(),
    mode: z.enum(['add', 'carve', 'smooth', 'inflate', 'pinch', 'flatten']),
    center: vec3Schema,
    normal: vec3Schema.optional(),
    radius: z.number().positive(),
    strength: z.number().min(0).max(1),
    falloff: z.enum(['smooth', 'sharp', 'flat']).optional(),
    createdAt: z.string(),
  })),
  printer: z.object({
    name: z.string(),
    buildVolume: vec3Schema,
    nozzleDiameter: z.number().positive(),
    minimumWall: z.number().positive(),
    overhangAngle: z.number().min(0).max(90),
  }),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine((document, context) => {
  const materialIds = new Map<string, number>()
  const printSlots = new Map<number, number>()

  document.materialPalette.forEach((material, materialIndex) => {
    const previousId = materialIds.get(material.id)
    if (previousId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['materialPalette', materialIndex, 'id'],
        message: `Material id "${material.id}" duplicates palette entry ${previousId}.`,
      })
    } else {
      materialIds.set(material.id, materialIndex)
    }

    if (material.printSlot !== undefined) {
      const previousSlot = printSlots.get(material.printSlot)
      if (previousSlot !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['materialPalette', materialIndex, 'printSlot'],
          message: `Print slot ${material.printSlot} is already used by palette entry ${previousSlot}.`,
        })
      } else {
        printSlots.set(material.printSlot, materialIndex)
      }
    }
  })

  document.nodes.forEach((node, nodeIndex) => {
    if (node.materialId !== undefined && !materialIds.has(node.materialId)) {
      context.addIssue({
        code: 'custom',
        path: ['nodes', nodeIndex, 'materialId'],
        message: `Unknown material id "${node.materialId}".`,
      })
    }

    const assignments = node.mesh?.triangleMaterials
    if (assignments === undefined) return
    const indices = node.mesh!.indices
    if (indices.length % 3 !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['nodes', nodeIndex, 'mesh', 'indices'],
        message: 'Triangle material assignments require an index count divisible by three.',
      })
      return
    }

    const triangleCount = indices.length / 3
    const assignedTriangles = new Map<number, number>()
    assignments.forEach((assignment, assignmentIndex) => {
      if (!materialIds.has(assignment.materialId)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', nodeIndex, 'mesh', 'triangleMaterials', assignmentIndex, 'materialId'],
          message: `Unknown material id "${assignment.materialId}".`,
        })
      }

      assignment.triangleIndices.forEach((triangleIndex, listIndex) => {
        if (triangleIndex >= triangleCount) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', nodeIndex, 'mesh', 'triangleMaterials', assignmentIndex, 'triangleIndices', listIndex],
            message: `Triangle index ${triangleIndex} is outside this mesh's ${triangleCount} triangles.`,
          })
          return
        }

        const previousAssignment = assignedTriangles.get(triangleIndex)
        if (previousAssignment !== undefined) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', nodeIndex, 'mesh', 'triangleMaterials', assignmentIndex, 'triangleIndices', listIndex],
            message: `Triangle ${triangleIndex} is already assigned by material group ${previousAssignment}.`,
          })
        } else {
          assignedTriangles.set(triangleIndex, assignmentIndex)
        }
      })
    })
  })
})

export function parseModelDocument(input: unknown) {
  return modelDocumentSchema.parse(input)
}
