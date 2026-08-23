import type { SketchConstraint } from './types.js'

export interface SketchPoint {
  x: number
  y: number
}

export interface SketchSolverOptions {
  /** Maximum projection sweeps. Defaults to 120. */
  maxIterations?: number
  /** Residual, in profile units, considered solved. Defaults to 1e-6. */
  tolerance?: number
  /** Angular residual, in degrees, considered solved. Defaults to 1e-5. */
  angularToleranceDegrees?: number
  /** Fraction of each projection correction to apply. Defaults to 1. */
  relaxation?: number
  /** Point kept at its input position to remove rigid translation. Defaults to 0. */
  anchorIndex?: number | null
  /** Additional point indices kept at their input positions. */
  fixedPointIndices?: readonly number[]
  /** Allow an equal constraint at the last point to refer to the closing edge. Defaults to true. */
  closedProfile?: boolean
  /** Make the first and last stored points coincident. Use only for profiles that duplicate the closing point. */
  coincidentClosure?: boolean
}

export interface SketchConstraintResidual {
  constraintIndex: number | null
  type: SketchConstraint['type'] | 'coincident-closure'
  residual: number
  signedResidual?: number
  unit: 'length' | 'degrees'
  satisfied: boolean
}

export interface InvalidSketchConstraint {
  constraintIndex: number
  constraint: SketchConstraint
  reason: 'point-index' | 'segment-index' | 'distance-value' | 'angle-value'
  message: string
}

export interface SketchSolveDiagnostics {
  converged: boolean
  iterations: number
  maxResidual: number
  rmsResidual: number
  residuals: SketchConstraintResidual[]
  invalidConstraints: InvalidSketchConstraint[]
  conflictingConstraintIndices: number[]
  closureConflict: boolean
  estimatedDegreesOfFreedom: number
  estimatedConstraintRank: number
  scalarConstraintCount: number
  redundantConstraintCount: number
  overconstrained: boolean
  anchorIndex: number | null
  fixedPointIndices: number[]
}

export interface SketchSolveResult {
  points: SketchPoint[]
  diagnostics: SketchSolveDiagnostics
}

interface CompiledConstraint {
  constraintIndex: number
  constraint: SketchConstraint
  firstSegmentEnd?: number
  secondSegmentEnd?: number
}

interface Gradient {
  pointIndex: number
  x: number
  y: number
}

const EPSILON = 1e-12
const DIRECTION_EPSILON = 1e-9
const RADIANS_TO_DEGREES = 180 / Math.PI
const DEGREES_TO_RADIANS = Math.PI / 180
const DEGENERATE_ANGLE_RESIDUAL = 180

function isSegmentConstraint(type: SketchConstraint['type']) {
  return type === 'equal' || type === 'parallel' || type === 'perpendicular' || type === 'angle'
}

/** Normalizes an angle to the half-open range [-180, 180). */
export function normalizeSketchAngleDegrees(value: number) {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

function normalizeAngleRadians(value: number) {
  return normalizeSketchAngleDegrees(value * RADIANS_TO_DEGREES) * DEGREES_TO_RADIANS
}

function assertFinitePoints(points: readonly SketchPoint[]) {
  points.forEach((point, index) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError(`Sketch point ${index} must contain finite x and y coordinates.`)
    }
  })
}

function requirePositiveOption(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number.`)
}

function isPointIndex(index: number, pointCount: number) {
  return Number.isInteger(index) && index >= 0 && index < pointCount
}

function segmentEnd(start: number, pointCount: number, closedProfile: boolean) {
  if (!isPointIndex(start, pointCount) || pointCount < 2) return null
  if (start + 1 < pointCount) return start + 1
  return closedProfile ? 0 : null
}

function compileConstraints(
  constraints: readonly SketchConstraint[],
  pointCount: number,
  closedProfile: boolean,
) {
  const valid: CompiledConstraint[] = []
  const invalid: InvalidSketchConstraint[] = []

  constraints.forEach((constraint, constraintIndex) => {
    if (isSegmentConstraint(constraint.type)) {
      const firstSegmentEnd = segmentEnd(constraint.a, pointCount, closedProfile)
      const secondSegmentEnd = segmentEnd(constraint.b, pointCount, closedProfile)
      if (firstSegmentEnd === null || secondSegmentEnd === null) {
        invalid.push({
          constraintIndex,
          constraint,
          reason: 'segment-index',
          message: `${constraint.type} constraint ${constraintIndex} must reference two valid segment start indices.`,
        })
        return
      }
      if (constraint.type === 'angle' && (constraint.value === undefined || !Number.isFinite(constraint.value))) {
        invalid.push({
          constraintIndex,
          constraint,
          reason: 'angle-value',
          message: `Angle constraint ${constraintIndex} requires a finite value in degrees.`,
        })
        return
      }
      valid.push({ constraintIndex, constraint, firstSegmentEnd, secondSegmentEnd })
      return
    }

    if (!isPointIndex(constraint.a, pointCount) || !isPointIndex(constraint.b, pointCount)) {
      invalid.push({
        constraintIndex,
        constraint,
        reason: 'point-index',
        message: `${constraint.type} constraint ${constraintIndex} must reference two valid point indices.`,
      })
      return
    }

    if (
      constraint.type === 'distance'
      && (constraint.value === undefined || !Number.isFinite(constraint.value) || constraint.value < 0)
    ) {
      invalid.push({
        constraintIndex,
        constraint,
        reason: 'distance-value',
        message: `Distance constraint ${constraintIndex} requires a finite, non-negative value.`,
      })
      return
    }

    valid.push({ constraintIndex, constraint })
  })

  return { valid, invalid }
}

function mergedGradients(gradients: readonly Gradient[]) {
  const merged = new Map<number, { x: number; y: number }>()
  for (const gradient of gradients) {
    const existing = merged.get(gradient.pointIndex)
    if (existing) {
      existing.x += gradient.x
      existing.y += gradient.y
    } else {
      merged.set(gradient.pointIndex, { x: gradient.x, y: gradient.y })
    }
  }
  return merged
}

function projectScalar(
  points: SketchPoint[],
  error: number,
  gradients: readonly Gradient[],
  fixed: ReadonlySet<number>,
  relaxation: number,
) {
  if (!Number.isFinite(error) || Math.abs(error) <= EPSILON) return
  const merged = mergedGradients(gradients)
  let denominator = 0
  for (const [pointIndex, gradient] of merged) {
    if (!fixed.has(pointIndex)) denominator += gradient.x * gradient.x + gradient.y * gradient.y
  }
  if (denominator <= EPSILON) return

  const correction = relaxation * error / denominator
  for (const [pointIndex, gradient] of merged) {
    if (fixed.has(pointIndex)) continue
    const point = points[pointIndex]!
    point.x -= correction * gradient.x
    point.y -= correction * gradient.y
  }
}

function vector(points: readonly SketchPoint[], a: number, b: number) {
  const first = points[a]!
  const second = points[b]!
  const x = second.x - first.x
  const y = second.y - first.y
  const length = Math.hypot(x, y)
  return {
    x,
    y,
    length,
    unitX: length > EPSILON ? x / length : 1,
    unitY: length > EPSILON ? y / length : 0,
  }
}

function projectCoincident(
  points: SketchPoint[],
  a: number,
  b: number,
  fixed: ReadonlySet<number>,
  relaxation: number,
) {
  projectScalar(points, points[b]!.x - points[a]!.x, [
    { pointIndex: a, x: -1, y: 0 },
    { pointIndex: b, x: 1, y: 0 },
  ], fixed, relaxation)
  projectScalar(points, points[b]!.y - points[a]!.y, [
    { pointIndex: a, x: 0, y: -1 },
    { pointIndex: b, x: 0, y: 1 },
  ], fixed, relaxation)
}

function directedSegmentAngleRadians(first: ReturnType<typeof vector>, second: ReturnType<typeof vector>) {
  if (first.length <= DIRECTION_EPSILON || second.length <= DIRECTION_EPSILON) return null
  return normalizeAngleRadians(Math.atan2(second.y, second.x) - Math.atan2(first.y, first.x))
}

function angularConstraintErrorRadians(
  type: 'parallel' | 'perpendicular' | 'angle',
  angle: number,
  targetDegrees?: number,
) {
  if (type === 'angle') return normalizeAngleRadians(angle - normalizeSketchAngleDegrees(targetDegrees!) * DEGREES_TO_RADIANS)
  if (type === 'parallel') {
    let error = normalizeAngleRadians(angle)
    if (error > Math.PI / 2) error -= Math.PI
    else if (error < -Math.PI / 2) error += Math.PI
    return error
  }
  const positive = normalizeAngleRadians(angle - Math.PI / 2)
  const negative = normalizeAngleRadians(angle + Math.PI / 2)
  return Math.abs(positive) <= Math.abs(negative) ? positive : negative
}

function segmentAngleGradients(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
  first: ReturnType<typeof vector>,
  second: ReturnType<typeof vector>,
) {
  if (first.length <= DIRECTION_EPSILON || second.length <= DIRECTION_EPSILON) return null
  const firstLengthSquared = first.length * first.length
  const secondLengthSquared = second.length * second.length
  return [
    { pointIndex: firstStart, x: -first.y / firstLengthSquared, y: first.x / firstLengthSquared },
    { pointIndex: firstEnd, x: first.y / firstLengthSquared, y: -first.x / firstLengthSquared },
    { pointIndex: secondStart, x: second.y / secondLengthSquared, y: -second.x / secondLengthSquared },
    { pointIndex: secondEnd, x: -second.y / secondLengthSquared, y: second.x / secondLengthSquared },
  ] satisfies Gradient[]
}

function rotateSegmentDirection(
  points: SketchPoint[],
  startIndex: number,
  endIndex: number,
  radians: number,
  fixed: ReadonlySet<number>,
) {
  const segment = vector(points, startIndex, endIndex)
  if (segment.length <= DIRECTION_EPSILON || !Number.isFinite(radians)) return false
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const rotatedX = segment.x * cosine - segment.y * sine
  const rotatedY = segment.x * sine + segment.y * cosine

  if (!fixed.has(endIndex)) {
    const start = points[startIndex]!
    points[endIndex] = { x: start.x + rotatedX, y: start.y + rotatedY }
    return true
  }
  if (!fixed.has(startIndex)) {
    const end = points[endIndex]!
    points[startIndex] = { x: end.x - rotatedX, y: end.y - rotatedY }
    return true
  }
  return false
}

function projectCompiledConstraint(
  compiled: CompiledConstraint,
  points: SketchPoint[],
  fixed: ReadonlySet<number>,
  relaxation: number,
) {
  const { constraint } = compiled
  const a = constraint.a
  const b = constraint.b

  if (constraint.type === 'horizontal') {
    projectScalar(points, points[b]!.y - points[a]!.y, [
      { pointIndex: a, x: 0, y: -1 },
      { pointIndex: b, x: 0, y: 1 },
    ], fixed, relaxation)
    return
  }

  if (constraint.type === 'vertical') {
    projectScalar(points, points[b]!.x - points[a]!.x, [
      { pointIndex: a, x: -1, y: 0 },
      { pointIndex: b, x: 1, y: 0 },
    ], fixed, relaxation)
    return
  }

  if (constraint.type === 'coincident') {
    projectCoincident(points, a, b, fixed, relaxation)
    return
  }

  if (constraint.type === 'distance') {
    const target = constraint.value!
    if (target <= EPSILON) {
      projectCoincident(points, a, b, fixed, relaxation)
      return
    }
    const delta = vector(points, a, b)
    projectScalar(points, delta.length - target, [
      { pointIndex: a, x: -delta.unitX, y: -delta.unitY },
      { pointIndex: b, x: delta.unitX, y: delta.unitY },
    ], fixed, relaxation)
    return
  }

  const firstEnd = compiled.firstSegmentEnd!
  const secondEnd = compiled.secondSegmentEnd!
  const first = vector(points, a, firstEnd)
  const second = vector(points, b, secondEnd)
  if (constraint.type === 'equal') {
    projectScalar(points, first.length - second.length, [
      { pointIndex: a, x: -first.unitX, y: -first.unitY },
      { pointIndex: firstEnd, x: first.unitX, y: first.unitY },
      { pointIndex: b, x: second.unitX, y: second.unitY },
      { pointIndex: secondEnd, x: -second.unitX, y: -second.unitY },
    ], fixed, relaxation)
    return
  }

  const angle = directedSegmentAngleRadians(first, second)
  if (angle === null) return
  const error = angularConstraintErrorRadians(constraint.type, angle, constraint.value)
  // Treat segment A as the reference direction and rotate segment B without
  // changing its length. This avoids the zero-length collapse that a raw
  // angle-gradient projection can produce for adjacent profile edges.
  if (rotateSegmentDirection(points, b, secondEnd, -error * relaxation, fixed)) return
  rotateSegmentDirection(points, a, firstEnd, error * relaxation, fixed)
}

function projectClosure(
  points: SketchPoint[],
  fixed: ReadonlySet<number>,
  relaxation: number,
) {
  if (points.length < 2) return
  const last = points.length - 1
  projectScalar(points, points[last]!.x - points[0]!.x, [
    { pointIndex: 0, x: -1, y: 0 },
    { pointIndex: last, x: 1, y: 0 },
  ], fixed, relaxation)
  projectScalar(points, points[last]!.y - points[0]!.y, [
    { pointIndex: 0, x: 0, y: -1 },
    { pointIndex: last, x: 0, y: 1 },
  ], fixed, relaxation)
}

function constraintResidualData(compiled: CompiledConstraint, points: readonly SketchPoint[]) {
  const { constraint } = compiled
  if (constraint.type === 'horizontal') return { signed: points[constraint.b]!.y - points[constraint.a]!.y, unit: 'length' as const }
  if (constraint.type === 'vertical') return { signed: points[constraint.b]!.x - points[constraint.a]!.x, unit: 'length' as const }
  if (constraint.type === 'coincident') {
    return { signed: vector(points, constraint.a, constraint.b).length, unit: 'length' as const }
  }
  if (constraint.type === 'distance') {
    return { signed: vector(points, constraint.a, constraint.b).length - constraint.value!, unit: 'length' as const }
  }
  const first = vector(points, constraint.a, compiled.firstSegmentEnd!)
  const second = vector(points, constraint.b, compiled.secondSegmentEnd!)
  if (constraint.type === 'equal') {
    return { signed: first.length - second.length, unit: 'length' as const }
  }
  const angle = directedSegmentAngleRadians(first, second)
  if (angle === null) return { signed: DEGENERATE_ANGLE_RESIDUAL, unit: 'degrees' as const }
  return {
    signed: angularConstraintErrorRadians(constraint.type, angle, constraint.value) * RADIANS_TO_DEGREES,
    unit: 'degrees' as const,
  }
}

function constraintResiduals(
  constraints: readonly CompiledConstraint[],
  points: readonly SketchPoint[],
  tolerance: number,
  angularToleranceDegrees: number,
  coincidentClosure: boolean,
) {
  const residuals: SketchConstraintResidual[] = constraints.map((compiled) => {
    const { signed, unit } = constraintResidualData(compiled, points)
    const residual = Math.abs(signed)
    return {
      constraintIndex: compiled.constraintIndex,
      type: compiled.constraint.type,
      residual,
      signedResidual: signed,
      unit,
      satisfied: residual <= (unit === 'degrees' ? angularToleranceDegrees : tolerance),
    }
  })
  if (coincidentClosure && points.length > 1) {
    const last = points[points.length - 1]!
    const first = points[0]!
    const residual = Math.hypot(last.x - first.x, last.y - first.y)
    residuals.push({
      constraintIndex: null,
      type: 'coincident-closure',
      residual,
      unit: 'length',
      satisfied: residual <= tolerance,
    })
  }
  return residuals
}

function gradientRow(
  gradients: readonly Gradient[],
  variableOffset: ReadonlyMap<number, number>,
  variableCount: number,
) {
  const row = new Array<number>(variableCount).fill(0)
  for (const [pointIndex, gradient] of mergedGradients(gradients)) {
    const offset = variableOffset.get(pointIndex)
    if (offset === undefined) continue
    row[offset] = row[offset]! + gradient.x
    row[offset + 1] = row[offset + 1]! + gradient.y
  }
  return row
}

function jacobianRows(
  constraints: readonly CompiledConstraint[],
  points: readonly SketchPoint[],
  fixed: ReadonlySet<number>,
  coincidentClosure: boolean,
) {
  const variableOffset = new Map<number, number>()
  let variableCount = 0
  points.forEach((_, pointIndex) => {
    if (!fixed.has(pointIndex)) {
      variableOffset.set(pointIndex, variableCount)
      variableCount += 2
    }
  })

  const rows: number[][] = []
  for (const compiled of constraints) {
    const { constraint } = compiled
    const a = constraint.a
    const b = constraint.b
    if (constraint.type === 'horizontal') {
      rows.push(gradientRow([
        { pointIndex: a, x: 0, y: -1 },
        { pointIndex: b, x: 0, y: 1 },
      ], variableOffset, variableCount))
    } else if (constraint.type === 'vertical') {
      rows.push(gradientRow([
        { pointIndex: a, x: -1, y: 0 },
        { pointIndex: b, x: 1, y: 0 },
      ], variableOffset, variableCount))
    } else if (constraint.type === 'coincident' || (constraint.type === 'distance' && constraint.value! <= EPSILON)) {
      rows.push(gradientRow([
        { pointIndex: a, x: -1, y: 0 },
        { pointIndex: b, x: 1, y: 0 },
      ], variableOffset, variableCount))
      rows.push(gradientRow([
        { pointIndex: a, x: 0, y: -1 },
        { pointIndex: b, x: 0, y: 1 },
      ], variableOffset, variableCount))
    } else if (constraint.type === 'distance') {
      const delta = vector(points, a, b)
      rows.push(gradientRow([
        { pointIndex: a, x: -delta.unitX, y: -delta.unitY },
        { pointIndex: b, x: delta.unitX, y: delta.unitY },
      ], variableOffset, variableCount))
    } else if (constraint.type === 'equal') {
      const firstEnd = compiled.firstSegmentEnd!
      const secondEnd = compiled.secondSegmentEnd!
      const first = vector(points, a, firstEnd)
      const second = vector(points, b, secondEnd)
      rows.push(gradientRow([
        { pointIndex: a, x: -first.unitX, y: -first.unitY },
        { pointIndex: firstEnd, x: first.unitX, y: first.unitY },
        { pointIndex: b, x: second.unitX, y: second.unitY },
        { pointIndex: secondEnd, x: -second.unitX, y: -second.unitY },
      ], variableOffset, variableCount))
    } else {
      const firstEnd = compiled.firstSegmentEnd!
      const secondEnd = compiled.secondSegmentEnd!
      const first = vector(points, a, firstEnd)
      const second = vector(points, b, secondEnd)
      const gradients = segmentAngleGradients(a, firstEnd, b, secondEnd, first, second)
      rows.push(gradientRow(gradients ?? [], variableOffset, variableCount))
    }
  }

  if (coincidentClosure && points.length > 1) {
    const last = points.length - 1
    rows.push(gradientRow([
      { pointIndex: 0, x: -1, y: 0 },
      { pointIndex: last, x: 1, y: 0 },
    ], variableOffset, variableCount))
    rows.push(gradientRow([
      { pointIndex: 0, x: 0, y: -1 },
      { pointIndex: last, x: 0, y: 1 },
    ], variableOffset, variableCount))
  }

  return { rows, variableCount }
}

function matrixRank(rows: readonly (readonly number[])[], columnCount: number) {
  if (rows.length === 0 || columnCount === 0) return 0
  const matrix = rows.map((row) => [...row])
  let rank = 0
  for (let column = 0; column < columnCount && rank < matrix.length; column += 1) {
    let pivot = rank
    for (let row = rank + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row]![column]!) > Math.abs(matrix[pivot]![column]!)) pivot = row
    }
    if (Math.abs(matrix[pivot]![column]!) <= 1e-9) continue
    ;[matrix[rank], matrix[pivot]] = [matrix[pivot]!, matrix[rank]!]
    const divisor = matrix[rank]![column]!
    for (let nextColumn = column; nextColumn < columnCount; nextColumn += 1) {
      matrix[rank]![nextColumn] = matrix[rank]![nextColumn]! / divisor
    }
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === rank) continue
      const factor = matrix[row]![column]!
      if (Math.abs(factor) <= 1e-9) continue
      for (let nextColumn = column; nextColumn < columnCount; nextColumn += 1) {
        matrix[row]![nextColumn] = matrix[row]![nextColumn]! - factor * matrix[rank]![nextColumn]!
      }
    }
    rank += 1
  }
  return rank
}

function scalarCount(constraints: readonly CompiledConstraint[], coincidentClosure: boolean, pointCount: number) {
  let count = constraints.reduce((total, compiled) => {
    return total + (
      compiled.constraint.type === 'coincident'
      || (compiled.constraint.type === 'distance' && compiled.constraint.value! <= EPSILON)
        ? 2
        : 1
    )
  }, 0)
  if (coincidentClosure && pointCount > 1) count += 2
  return count
}

/**
 * Solves FormForge profile constraints with iterative position-based projections.
 *
 * `horizontal`, `vertical`, `distance`, and `coincident` use `a` and `b` as
 * point indices. `equal`, `parallel`, `perpendicular`, and `angle` use them as
 * segment-start indices; each segment ends at the next profile point, wrapping
 * to point zero for a closed profile. Angle values are signed degrees measured
 * from segment A to segment B: positive is counter-clockwise in the XY plane.
 * Values and residuals are normalized to [-180, 180).
 */
export function solveSketchConstraints(
  inputPoints: readonly SketchPoint[],
  constraints: readonly SketchConstraint[],
  options: SketchSolverOptions = {},
): SketchSolveResult {
  assertFinitePoints(inputPoints)
  const maxIterations = options.maxIterations ?? 120
  const tolerance = options.tolerance ?? 1e-6
  const angularToleranceDegrees = options.angularToleranceDegrees ?? 1e-5
  const relaxation = options.relaxation ?? 1
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError('maxIterations must be a positive integer.')
  }
  requirePositiveOption(tolerance, 'tolerance')
  requirePositiveOption(angularToleranceDegrees, 'angularToleranceDegrees')
  requirePositiveOption(relaxation, 'relaxation')
  if (relaxation > 1) throw new RangeError('relaxation must be less than or equal to 1.')

  const closedProfile = options.closedProfile ?? true
  const coincidentClosure = options.coincidentClosure ?? false
  const requestedAnchor = options.anchorIndex === undefined ? 0 : options.anchorIndex
  if (requestedAnchor !== null && inputPoints.length > 0 && !isPointIndex(requestedAnchor, inputPoints.length)) {
    throw new RangeError('anchorIndex must reference an existing point or be null.')
  }
  const fixed = new Set<number>()
  for (const pointIndex of options.fixedPointIndices ?? []) {
    if (!isPointIndex(pointIndex, inputPoints.length)) {
      throw new RangeError(`Fixed point index ${pointIndex} does not reference an existing point.`)
    }
    fixed.add(pointIndex)
  }
  const anchorIndex = requestedAnchor !== null && inputPoints.length > 0 ? requestedAnchor : null
  if (anchorIndex !== null) fixed.add(anchorIndex)

  const points = inputPoints.map((point) => ({ x: point.x, y: point.y }))
  const { valid, invalid } = compileConstraints(constraints, points.length, closedProfile)
  let residuals = constraintResiduals(valid, points, tolerance, angularToleranceDegrees, coincidentClosure)
  let maxResidual = residuals.reduce((maximum, residual) => Math.max(maximum, residual.residual), 0)
  let iterations = 0

  while (invalid.length === 0 && residuals.some((residual) => !residual.satisfied) && iterations < maxIterations) {
    iterations += 1
    for (const constraint of valid) projectCompiledConstraint(constraint, points, fixed, relaxation)
    if (coincidentClosure) projectClosure(points, fixed, relaxation)
    residuals = constraintResiduals(valid, points, tolerance, angularToleranceDegrees, coincidentClosure)
    maxResidual = residuals.reduce((maximum, residual) => Math.max(maximum, residual.residual), 0)
  }

  const rmsResidual = residuals.length === 0
    ? 0
    : Math.sqrt(residuals.reduce((sum, residual) => sum + residual.residual ** 2, 0) / residuals.length)
  const conflictingConstraintIndices = residuals
    .filter((residual) => residual.constraintIndex !== null && !residual.satisfied)
    .map((residual) => residual.constraintIndex!)
  const closureConflict = residuals.some((residual) => residual.type === 'coincident-closure' && !residual.satisfied)
  const { rows, variableCount } = jacobianRows(valid, points, fixed, coincidentClosure)
  const estimatedConstraintRank = matrixRank(rows, variableCount)
  const scalarConstraintCount = scalarCount(valid, coincidentClosure, points.length)
  const redundantConstraintCount = Math.max(0, scalarConstraintCount - estimatedConstraintRank)
  const converged = invalid.length === 0 && residuals.every((residual) => residual.satisfied)
  const overconstrained = invalid.length > 0
    || conflictingConstraintIndices.length > 0
    || closureConflict
    || redundantConstraintCount > 0

  return {
    points,
    diagnostics: {
      converged,
      iterations,
      maxResidual,
      rmsResidual,
      residuals,
      invalidConstraints: invalid,
      conflictingConstraintIndices,
      closureConflict,
      estimatedDegreesOfFreedom: Math.max(0, variableCount - estimatedConstraintRank),
      estimatedConstraintRank,
      scalarConstraintCount,
      redundantConstraintCount,
      overconstrained,
      anchorIndex,
      fixedPointIndices: [...fixed].sort((a, b) => a - b),
    },
  }
}
