import type { ComponentMesh } from './componentMesh'

/** One-based print/material slot ID in FormForge's portable 1-16 range. */
export type FaceMaterialId = number
export type FaceMaterialAssignments = readonly FaceMaterialId[]

export interface FaceMaterialOptions {
  /** Used for missing, invalid, newly created, or conflicting faces. Defaults to slot 1. */
  defaultMaterial?: FaceMaterialId
}

export interface FaceMaterialValidation {
  valid: boolean
  faceCount: number
  assignmentCount: number
  trailingIndexValues: number
  missingFaceIndices: number[]
  extraAssignmentIndices: number[]
  invalidAssignmentIndices: number[]
}

export type FaceRemapTargets = number | readonly number[] | null | undefined

/** Array indices or Map keys are old face indices; values are their new face indices. */
export type OldToNewFaceMap =
  | ReadonlyArray<FaceRemapTargets>
  | ReadonlyMap<number, FaceRemapTargets>

const DEFAULT_MATERIAL = 1

function meshFaceCount(mesh: ComponentMesh) {
  return Math.floor(mesh.indices.length / 3)
}

function isMaterialId(value: unknown): value is FaceMaterialId {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 16
}

function checkedMaterial(value: unknown, label: string): FaceMaterialId {
  if (!isMaterialId(value)) throw new RangeError(`${label} must be an integer between 1 and 16.`)
  return value
}

function defaultMaterial(options: FaceMaterialOptions) {
  return checkedMaterial(options.defaultMaterial ?? DEFAULT_MATERIAL, 'Default face material')
}

/** Strictly validates that one valid material ID exists for every complete triangle. */
export function validateFaceMaterialAssignments(
  mesh: ComponentMesh,
  assignments: FaceMaterialAssignments,
): FaceMaterialValidation {
  const faceCount = meshFaceCount(mesh)
  const missingFaceIndices = Array.from(
    { length: Math.max(0, faceCount - assignments.length) },
    (_, offset) => assignments.length + offset,
  )
  const extraAssignmentIndices = assignments.length > faceCount
    ? Array.from({ length: assignments.length - faceCount }, (_, offset) => faceCount + offset)
    : []
  const invalidAssignmentIndices: number[] = []
  assignments.forEach((material, index) => {
    if (!isMaterialId(material)) invalidAssignmentIndices.push(index)
  })
  const trailingIndexValues = mesh.indices.length % 3
  return {
    valid: trailingIndexValues === 0
      && missingFaceIndices.length === 0
      && extraAssignmentIndices.length === 0
      && invalidAssignmentIndices.length === 0,
    faceCount,
    assignmentCount: assignments.length,
    trailingIndexValues,
    missingFaceIndices,
    extraAssignmentIndices,
    invalidAssignmentIndices,
  }
}

/** Returns exactly one valid material per complete triangle without mutating input. */
export function normalizeFaceMaterialAssignments(
  mesh: ComponentMesh,
  assignments: FaceMaterialAssignments = [],
  options: FaceMaterialOptions = {},
): FaceMaterialId[] {
  const fallback = defaultMaterial(options)
  return Array.from({ length: meshFaceCount(mesh) }, (_, face) => {
    const material = assignments[face]
    return isMaterialId(material) ? material : fallback
  })
}

/** Atomically paints selected canonical face indices and returns a normalized copy. */
export function assignFaceMaterial(
  mesh: ComponentMesh,
  assignments: FaceMaterialAssignments,
  selectedFaceIndices: Iterable<number>,
  material: FaceMaterialId,
  options: FaceMaterialOptions = {},
): FaceMaterialId[] {
  const checked = checkedMaterial(material, 'Face material')
  const faceCount = meshFaceCount(mesh)
  const selection = [...new Set(selectedFaceIndices)]
  for (const face of selection) {
    if (!Number.isInteger(face) || face < 0 || face >= faceCount) {
      throw new RangeError(`Selected face index ${String(face)} is outside the canonical face range.`)
    }
  }
  const result = normalizeFaceMaterialAssignments(mesh, assignments, options)
  for (const face of selection) result[face] = checked
  return result
}

/** Counts normalized face assignments by material ID. */
export function faceMaterialUsage(
  mesh: ComponentMesh,
  assignments: FaceMaterialAssignments = [],
  options: FaceMaterialOptions = {},
): Map<FaceMaterialId, number> {
  const usage = new Map<FaceMaterialId, number>()
  for (const material of normalizeFaceMaterialAssignments(mesh, assignments, options)) {
    usage.set(material, (usage.get(material) ?? 0) + 1)
  }
  return usage
}

function remapEntries(faceMap: OldToNewFaceMap): Iterable<readonly [number, FaceRemapTargets]> {
  return faceMap.entries()
}

/**
 * Propagates materials through an explicit old-to-new topology map. Unmapped new
 * faces keep the default. Many-to-one maps preserve a shared material, while a
 * merge of different source materials resolves to the safe default.
 */
export function remapFaceMaterialAssignments(
  sourceMesh: ComponentMesh,
  targetMesh: ComponentMesh,
  assignments: FaceMaterialAssignments,
  oldToNewFaceMap: OldToNewFaceMap,
  options: FaceMaterialOptions = {},
): FaceMaterialId[] {
  const fallback = defaultMaterial(options)
  const sourceFaceCount = meshFaceCount(sourceMesh)
  const targetFaceCount = meshFaceCount(targetMesh)
  const source = normalizeFaceMaterialAssignments(sourceMesh, assignments, { defaultMaterial: fallback })
  const result = new Array(targetFaceCount).fill(fallback) as FaceMaterialId[]
  const assigned = new Array(targetFaceCount).fill(false) as boolean[]
  const conflicted = new Array(targetFaceCount).fill(false) as boolean[]

  for (const [oldFace, rawTargets] of remapEntries(oldToNewFaceMap)) {
    if (rawTargets === null || rawTargets === undefined) continue
    if (!Number.isInteger(oldFace) || oldFace < 0 || oldFace >= sourceFaceCount) {
      throw new RangeError(`Old face index ${String(oldFace)} is outside the source face range.`)
    }
    const targets = typeof rawTargets === 'number' ? [rawTargets] : [...rawTargets]
    const uniqueTargets = [...new Set(targets)]
    for (const newFace of uniqueTargets) {
      if (!Number.isInteger(newFace) || newFace < 0 || newFace >= targetFaceCount) {
        throw new RangeError(`New face index ${String(newFace)} is outside the target face range.`)
      }
    }

    const material = source[oldFace]!
    for (const newFace of uniqueTargets) {
      if (conflicted[newFace]) continue
      if (!assigned[newFace]) {
        result[newFace] = material
        assigned[newFace] = true
      } else if (result[newFace] !== material) {
        result[newFace] = fallback
        conflicted[newFace] = true
      }
    }
  }
  return result
}
