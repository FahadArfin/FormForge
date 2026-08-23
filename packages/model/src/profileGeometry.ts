export interface ProfilePoint {
  x: number
  y: number
}

export interface ProfileGeometrySettings {
  curveMode: 'polyline' | 'rounded' | 'spline'
  cornerRadius: number
  offset: number
  tension: number
  resolution: number
}

export type ProfileOrientation = 'counter-clockwise' | 'clockwise' | 'degenerate'

export type ProfileGeometryErrorCode =
  | 'INVALID_INPUT'
  | 'DEGENERATE_PROFILE'
  | 'PATHOLOGICAL_OFFSET'
  | 'OUTPUT_LIMIT'

export class ProfileGeometryError extends Error {
  constructor(
    readonly code: ProfileGeometryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ProfileGeometryError'
  }
}

export const MAX_PROFILE_SOURCE_POINTS = 1_024
export const MAX_PROFILE_SAMPLES = 4_096

const MAX_RESOLUTION = 64
const MIN_STABLE_OFFSET_FRACTION = 0.01

function point(x: number, y: number): ProfilePoint {
  return { x, y }
}

function add(a: ProfilePoint, b: ProfilePoint): ProfilePoint {
  return point(a.x + b.x, a.y + b.y)
}

function subtract(a: ProfilePoint, b: ProfilePoint): ProfilePoint {
  return point(a.x - b.x, a.y - b.y)
}

function scale(value: ProfilePoint, factor: number): ProfilePoint {
  return point(value.x * factor, value.y * factor)
}

function dot(a: ProfilePoint, b: ProfilePoint): number {
  return a.x * b.x + a.y * b.y
}

function cross(a: ProfilePoint, b: ProfilePoint): number {
  return a.x * b.y - a.y * b.x
}

function length(value: ProfilePoint): number {
  return Math.hypot(value.x, value.y)
}

function distanceSquared(a: ProfilePoint, b: ProfilePoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function normalize(value: ProfilePoint): ProfilePoint | undefined {
  const magnitude = length(value)
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) return undefined
  return scale(value, 1 / magnitude)
}

function leftNormal(value: ProfilePoint): ProfilePoint {
  return point(-value.y, value.x)
}

function rightNormal(value: ProfilePoint): ProfilePoint {
  return point(value.y, -value.x)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function profileScale(points: readonly ProfilePoint[]): number {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const current of points) {
    minX = Math.min(minX, current.x)
    minY = Math.min(minY, current.y)
    maxX = Math.max(maxX, current.x)
    maxY = Math.max(maxY, current.y)
  }
  return Math.max(1, Math.hypot(maxX - minX, maxY - minY))
}

function profileEpsilon(points: readonly ProfilePoint[]): number {
  return profileScale(points) * 1e-9
}

function assertFinitePoint(current: ProfilePoint, index: number): void {
  if (!Number.isFinite(current.x) || !Number.isFinite(current.y)) {
    throw new ProfileGeometryError('INVALID_INPUT', `Profile point ${index + 1} must have finite x and y coordinates.`)
  }
}

/** Removes adjacent duplicates and an optional repeated closing point. */
export function cleanClosedProfile(points: readonly ProfilePoint[], epsilon?: number): ProfilePoint[] {
  if (points.length > MAX_PROFILE_SOURCE_POINTS) {
    throw new ProfileGeometryError(
      'OUTPUT_LIMIT',
      `A profile may contain at most ${MAX_PROFILE_SOURCE_POINTS} source points; received ${points.length}.`,
    )
  }
  points.forEach(assertFinitePoint)
  if (points.length === 0) return []

  const tolerance = epsilon ?? profileEpsilon(points)
  const toleranceSquared = tolerance * tolerance
  const output: ProfilePoint[] = []
  for (const current of points) {
    const copy = point(current.x, current.y)
    if (output.length === 0 || distanceSquared(output[output.length - 1]!, copy) > toleranceSquared) output.push(copy)
  }
  while (output.length > 1 && distanceSquared(output[0]!, output[output.length - 1]!) <= toleranceSquared) output.pop()
  return output
}

export function signedProfileArea(points: readonly ProfilePoint[]): number {
  if (points.length < 3) return 0
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    assertFinitePoint(current, index)
    twiceArea += current.x * next.y - next.x * current.y
  }
  return twiceArea / 2
}

export function getProfileOrientation(points: readonly ProfilePoint[]): ProfileOrientation {
  const area = signedProfileArea(points)
  const epsilonArea = profileScale(points) ** 2 * 1e-12
  if (Math.abs(area) <= epsilonArea) return 'degenerate'
  return area > 0 ? 'counter-clockwise' : 'clockwise'
}

/** Returns a copied, duplicate-free profile with the requested winding. */
export function normalizeProfileWinding(
  points: readonly ProfilePoint[],
  winding: Exclude<ProfileOrientation, 'degenerate'> = 'counter-clockwise',
): ProfilePoint[] {
  const cleaned = cleanClosedProfile(points)
  if (cleaned.length < 3 || getProfileOrientation(cleaned) === 'degenerate') {
    throw new ProfileGeometryError('DEGENERATE_PROFILE', 'A closed profile requires at least three non-collinear points.')
  }
  const shouldReverse =
    (winding === 'counter-clockwise' && signedProfileArea(cleaned) < 0) ||
    (winding === 'clockwise' && signedProfileArea(cleaned) > 0)
  return shouldReverse ? cleaned.reverse() : cleaned
}

function orientation(a: ProfilePoint, b: ProfilePoint, c: ProfilePoint): number {
  return cross(subtract(b, a), subtract(c, a))
}

function pointOnSegment(a: ProfilePoint, b: ProfilePoint, candidate: ProfilePoint, epsilon: number): boolean {
  return (
    Math.abs(orientation(a, b, candidate)) <= epsilon &&
    candidate.x >= Math.min(a.x, b.x) - epsilon &&
    candidate.x <= Math.max(a.x, b.x) + epsilon &&
    candidate.y >= Math.min(a.y, b.y) - epsilon &&
    candidate.y <= Math.max(a.y, b.y) + epsilon
  )
}

function segmentsIntersect(a: ProfilePoint, b: ProfilePoint, c: ProfilePoint, d: ProfilePoint, epsilon: number): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
      ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true
  return (
    pointOnSegment(a, b, c, epsilon) ||
    pointOnSegment(a, b, d, epsilon) ||
    pointOnSegment(c, d, a, epsilon) ||
    pointOnSegment(c, d, b, epsilon)
  )
}

export function isSimpleClosedProfile(points: readonly ProfilePoint[]): boolean {
  if (points.length < 3 || points.some((current) => !Number.isFinite(current.x) || !Number.isFinite(current.y))) return false
  const epsilon = profileEpsilon(points)
  const epsilonSquared = epsilon * epsilon
  for (let index = 0; index < points.length; index += 1) {
    if (distanceSquared(points[index]!, points[(index + 1) % points.length]!) <= epsilonSquared) return false
  }
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length
      if (first === second || firstNext === second || secondNext === first) continue
      if (segmentsIntersect(points[first]!, points[firstNext]!, points[second]!, points[secondNext]!, epsilon)) return false
    }
  }
  return getProfileOrientation(points) !== 'degenerate'
}

function intersectLines(
  firstPoint: ProfilePoint,
  firstDirection: ProfilePoint,
  secondPoint: ProfilePoint,
  secondDirection: ProfilePoint,
  epsilon: number,
): ProfilePoint | undefined {
  const denominator = cross(firstDirection, secondDirection)
  if (Math.abs(denominator) <= epsilon) return undefined
  const distance = cross(subtract(secondPoint, firstPoint), secondDirection) / denominator
  return add(firstPoint, scale(firstDirection, distance))
}

function rawOffsetProfile(points: readonly ProfilePoint[], offset: number): ProfilePoint[] {
  if (offset === 0) return points.map((current) => point(current.x, current.y))
  const epsilon = profileEpsilon(points)
  const maximumMiter = Math.max(Math.abs(offset) * 8, profileScale(points) * 1e-7)
  const output: ProfilePoint[] = []

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    const incoming = normalize(subtract(current, previous))
    const outgoing = normalize(subtract(next, current))
    if (!incoming || !outgoing) continue
    const incomingNormal = rightNormal(incoming)
    const outgoingNormal = rightNormal(outgoing)
    const firstLinePoint = add(current, scale(incomingNormal, offset))
    const secondLinePoint = add(current, scale(outgoingNormal, offset))
    let candidate = intersectLines(firstLinePoint, incoming, secondLinePoint, outgoing, epsilon)

    if (!candidate) {
      const averageNormal = normalize(add(incomingNormal, outgoingNormal)) ?? incomingNormal
      const denominator = dot(averageNormal, incomingNormal)
      const distance = Math.abs(denominator) > 1e-6 ? offset / denominator : offset
      candidate = add(current, scale(averageNormal, distance))
    }

    const displacement = subtract(candidate, current)
    const displacementLength = length(displacement)
    if (displacementLength > maximumMiter) candidate = add(current, scale(displacement, maximumMiter / displacementLength))
    output.push(candidate)
  }
  return output
}

function offsetCandidateIsStable(candidate: readonly ProfilePoint[], sourceArea: number, offset: number): boolean {
  if (!isSimpleClosedProfile(candidate)) return false
  const candidateArea = signedProfileArea(candidate)
  const tolerance = Math.max(1, Math.abs(sourceArea)) * 1e-9
  if (candidateArea <= tolerance) return false
  if (offset > 0 && candidateArea + tolerance < sourceArea) return false
  if (offset < 0 && candidateArea - tolerance > sourceArea) return false
  return true
}

/** Positive distances offset outwards; negative distances offset inwards. */
export function offsetClosedProfile(points: readonly ProfilePoint[], offset: number): ProfilePoint[] {
  const source = normalizeProfileWinding(points)
  if (!Number.isFinite(offset)) throw new ProfileGeometryError('INVALID_INPUT', 'Profile offset must be finite.')
  if (offset === 0) return source
  const diagonal = profileScale(source)
  if (Math.abs(offset) > diagonal * 4) {
    throw new ProfileGeometryError(
      'PATHOLOGICAL_OFFSET',
      `Offset ${offset} is too large for a profile whose bounding diagonal is ${diagonal}.`,
    )
  }

  const sourceArea = signedProfileArea(source)
  const exact = rawOffsetProfile(source, offset)
  if (offsetCandidateIsStable(exact, sourceArea, offset)) return exact

  let low = 0
  let high = 1
  let best = source
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const fraction = (low + high) / 2
    const candidate = rawOffsetProfile(source, offset * fraction)
    if (offsetCandidateIsStable(candidate, sourceArea, offset)) {
      low = fraction
      best = candidate
    } else {
      high = fraction
    }
  }
  if (low < MIN_STABLE_OFFSET_FRACTION) {
    throw new ProfileGeometryError('PATHOLOGICAL_OFFSET', `Offset ${offset} collapses or self-intersects this profile.`)
  }
  return best
}

function safeResolution(requested: number, pointCount: number): number {
  if (!Number.isFinite(requested)) throw new ProfileGeometryError('INVALID_INPUT', 'Profile resolution must be finite.')
  const rounded = clamp(Math.round(requested), 1, MAX_RESOLUTION)
  return Math.max(1, Math.min(rounded, Math.floor(MAX_PROFILE_SAMPLES / Math.max(1, pointCount))))
}

function appendUnique(output: ProfilePoint[], candidate: ProfilePoint, epsilonSquared: number): void {
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return
  if (output.length === 0 || distanceSquared(output[output.length - 1]!, candidate) > epsilonSquared) output.push(candidate)
}

function sampleRoundedProfile(points: readonly ProfilePoint[], cornerRadius: number, requestedResolution: number): ProfilePoint[] {
  if (!(cornerRadius > 0)) return points.map((current) => point(current.x, current.y))
  const resolution = safeResolution(requestedResolution, points.length)
  const epsilon = profileEpsilon(points)
  const epsilonSquared = epsilon * epsilon
  const output: ProfilePoint[] = []

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    const towardPrevious = normalize(subtract(previous, current))
    const towardNext = normalize(subtract(next, current))
    const incoming = normalize(subtract(current, previous))
    const outgoing = normalize(subtract(next, current))
    if (!towardPrevious || !towardNext || !incoming || !outgoing) continue

    const previousLength = length(subtract(previous, current))
    const nextLength = length(subtract(next, current))
    const angle = Math.acos(clamp(dot(towardPrevious, towardNext), -1, 1))
    const tangentFactor = Math.tan(angle / 2)
    if (!(angle > 1e-5) || !(Math.PI - angle > 1e-5) || !(tangentFactor > 1e-8)) {
      appendUnique(output, current, epsilonSquared)
      continue
    }

    const maximumTangentDistance = Math.min(previousLength, nextLength) * 0.45
    const tangentDistance = Math.min(cornerRadius / tangentFactor, maximumTangentDistance)
    if (!(tangentDistance > epsilon)) {
      appendUnique(output, current, epsilonSquared)
      continue
    }
    const start = add(current, scale(towardPrevious, tangentDistance))
    const end = add(current, scale(towardNext, tangentDistance))
    const turn = cross(incoming, outgoing)
    const startNormal = turn >= 0 ? leftNormal(incoming) : rightNormal(incoming)
    const endNormal = turn >= 0 ? leftNormal(outgoing) : rightNormal(outgoing)
    const center = intersectLines(start, startNormal, end, endNormal, epsilon)
    if (!center) {
      appendUnique(output, current, epsilonSquared)
      continue
    }

    const radius = length(subtract(start, center))
    if (!(radius > epsilon) || !Number.isFinite(radius)) {
      appendUnique(output, current, epsilonSquared)
      continue
    }
    let startAngle = Math.atan2(start.y - center.y, start.x - center.x)
    let endAngle = Math.atan2(end.y - center.y, end.x - center.x)
    if (turn >= 0) {
      while (endAngle <= startAngle) endAngle += Math.PI * 2
    } else {
      while (endAngle >= startAngle) endAngle -= Math.PI * 2
    }
    let sweep = endAngle - startAngle
    if (Math.abs(sweep) > Math.PI) sweep += sweep > 0 ? -Math.PI * 2 : Math.PI * 2
    const segmentCount = Math.max(1, Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * resolution))
    for (let segment = 0; segment <= segmentCount; segment += 1) {
      const angleAtSegment = startAngle + sweep * (segment / segmentCount)
      appendUnique(output, point(center.x + Math.cos(angleAtSegment) * radius, center.y + Math.sin(angleAtSegment) * radius), epsilonSquared)
      if (output.length >= MAX_PROFILE_SAMPLES) break
    }
  }
  return cleanSampledProfile(output)
}

function sampleCardinalProfile(points: readonly ProfilePoint[], tension: number, requestedResolution: number): ProfilePoint[] {
  const resolution = Math.max(2, safeResolution(requestedResolution, points.length))
  const epsilonSquared = profileEpsilon(points) ** 2
  const output: ProfilePoint[] = []
  const tangentScale = (1 - clamp(tension, 0, 1)) / 2

  for (let index = 0; index < points.length; index += 1) {
    const p0 = points[(index - 1 + points.length) % points.length]!
    const p1 = points[index]!
    const p2 = points[(index + 1) % points.length]!
    const p3 = points[(index + 2) % points.length]!
    const m1 = scale(subtract(p2, p0), tangentScale)
    const m2 = scale(subtract(p3, p1), tangentScale)

    for (let sample = 0; sample < resolution; sample += 1) {
      const t = sample / resolution
      const t2 = t * t
      const t3 = t2 * t
      const h00 = 2 * t3 - 3 * t2 + 1
      const h10 = t3 - 2 * t2 + t
      const h01 = -2 * t3 + 3 * t2
      const h11 = t3 - t2
      appendUnique(
        output,
        point(
          h00 * p1.x + h10 * m1.x + h01 * p2.x + h11 * m2.x,
          h00 * p1.y + h10 * m1.y + h01 * p2.y + h11 * m2.y,
        ),
        epsilonSquared,
      )
      if (output.length >= MAX_PROFILE_SAMPLES) break
    }
  }
  return cleanSampledProfile(output)
}

function cleanSampledProfile(points: readonly ProfilePoint[]): ProfilePoint[] {
  if (points.length === 0) return []
  const epsilon = profileEpsilon(points)
  const epsilonSquared = epsilon * epsilon
  const output: ProfilePoint[] = []
  for (const current of points) appendUnique(output, current, epsilonSquared)
  while (output.length > 1 && distanceSquared(output[0]!, output[output.length - 1]!) <= epsilonSquared) output.pop()
  if (output.length > MAX_PROFILE_SAMPLES) output.length = MAX_PROFILE_SAMPLES
  return output
}

function stableSplineProfile(points: readonly ProfilePoint[], tension: number, resolution: number): ProfilePoint[] {
  const initialTension = clamp(tension, 0, 1)
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    const candidateTension = initialTension + (1 - initialTension) * (attempt / 8)
    const candidate = sampleCardinalProfile(points, candidateTension, resolution)
    if (isSimpleClosedProfile(candidate)) return candidate
  }
  return points.map((current) => point(current.x, current.y))
}

function validateSettings(settings: ProfileGeometrySettings): void {
  if (!['polyline', 'rounded', 'spline'].includes(settings.curveMode)) {
    throw new ProfileGeometryError('INVALID_INPUT', `Unsupported profile curve mode "${String(settings.curveMode)}".`)
  }
  for (const [name, value] of Object.entries(settings)) {
    if (name !== 'curveMode' && !Number.isFinite(value)) {
      throw new ProfileGeometryError('INVALID_INPUT', `Profile setting "${name}" must be finite.`)
    }
  }
}

/**
 * Samples a closed profile as an implicit-loop polygon. The first point is not
 * repeated at the end. Output is finite, duplicate-free and counter-clockwise.
 */
export function sampleClosedProfile(
  points: readonly ProfilePoint[],
  settings: ProfileGeometrySettings,
): ProfilePoint[] {
  validateSettings(settings)
  const source = normalizeProfileWinding(points)
  if (!isSimpleClosedProfile(source)) {
    throw new ProfileGeometryError('INVALID_INPUT', 'The source profile must be a simple, non-self-intersecting polygon.')
  }
  const offsetProfile = offsetClosedProfile(source, settings.offset)
  const resolution = safeResolution(settings.resolution, offsetProfile.length)
  let sampled: ProfilePoint[]
  switch (settings.curveMode) {
    case 'polyline':
      sampled = offsetProfile
      break
    case 'rounded':
      sampled = sampleRoundedProfile(offsetProfile, Math.max(0, settings.cornerRadius), resolution)
      if (!isSimpleClosedProfile(sampled)) sampled = offsetProfile
      break
    case 'spline':
      sampled = stableSplineProfile(offsetProfile, settings.tension, resolution)
      break
  }

  sampled = cleanSampledProfile(sampled)
  if (sampled.length < 3 || !isSimpleClosedProfile(sampled)) {
    throw new ProfileGeometryError('DEGENERATE_PROFILE', 'Profile sampling did not produce a stable closed polygon.')
  }
  if (signedProfileArea(sampled) < 0) sampled.reverse()
  return sampled
}
