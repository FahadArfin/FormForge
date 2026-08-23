import {
  MAX_PROFILE_SOURCE_POINTS,
  cleanClosedProfile,
  getProfileOrientation,
  isSimpleClosedProfile,
  normalizeProfileWinding,
  sampleClosedProfile,
  type ProfileGeometrySettings,
  type ProfilePoint,
} from './profileGeometry.js'

export type ProfileRecipeSpec =
  | { kind: 'circle'; width: number }
  | { kind: 'ellipse'; width: number; height: number }
  | { kind: 'regularPolygon'; width: number; height: number; sides: number }
  | { kind: 'star'; width: number; height: number; sides: number; innerRatio: number }
  | { kind: 'capsule'; width: number; height: number }
  | { kind: 'roundedRectangle'; width: number; height: number; cornerRadius: number }
  | { kind: 'gear'; width: number; height: number; teeth: number; innerRatio: number }

export interface ProfileRecipe {
  points: ProfilePoint[]
  settings: ProfileGeometrySettings
}

export type ProfileRecipeErrorCode =
  | 'INVALID_DIMENSION'
  | 'INVALID_COUNT'
  | 'INVALID_RATIO'
  | 'INVALID_RADIUS'
  | 'UNSAFE_OUTPUT'

export class ProfileRecipeError extends Error {
  constructor(
    readonly code: ProfileRecipeErrorCode,
    readonly field: string,
    message: string,
  ) {
    super(message)
    this.name = 'ProfileRecipeError'
  }
}

export const MIN_PROFILE_RECIPE_SIZE = 0.1
export const MAX_PROFILE_RECIPE_SIZE = 1_000_000
export const MIN_PROFILE_RECIPE_SIDES = 3
export const MAX_PROFILE_RECIPE_SIDES = 64
export const MIN_PROFILE_RECIPE_TEETH = 4
export const MAX_PROFILE_RECIPE_TEETH = 128

const CURVE_SEGMENTS = 48
const CAPSULE_CAP_SEGMENTS = 24

const POLYLINE_SETTINGS: ProfileGeometrySettings = {
  curveMode: 'polyline',
  cornerRadius: 0,
  offset: 0,
  tension: 0.5,
  resolution: 8,
}

function assertDimension(value: number, field: 'width' | 'height'): void {
  if (!Number.isFinite(value) || value < MIN_PROFILE_RECIPE_SIZE || value > MAX_PROFILE_RECIPE_SIZE) {
    throw new ProfileRecipeError(
      'INVALID_DIMENSION',
      field,
      `${field} must be finite and between ${MIN_PROFILE_RECIPE_SIZE} and ${MAX_PROFILE_RECIPE_SIZE} mm; received ${value}.`,
    )
  }
}

function assertCount(value: number, field: 'sides' | 'teeth', minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ProfileRecipeError(
      'INVALID_COUNT',
      field,
      `${field} must be a whole number between ${minimum} and ${maximum}; received ${value}.`,
    )
  }
}

function assertRatio(value: number, kind: 'star' | 'gear'): void {
  const minimum = kind === 'star' ? 0.1 : 0.35
  const maximum = kind === 'star' ? 0.9 : 0.95
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ProfileRecipeError(
      'INVALID_RATIO',
      'innerRatio',
      `${kind} innerRatio must be between ${minimum} and ${maximum}; received ${value}.`,
    )
  }
}

function ellipsePoints(width: number, height: number, segments = CURVE_SEGMENTS): ProfilePoint[] {
  const radiusX = width / 2
  const radiusY = height / 2
  return Array.from({ length: segments }, (_, index) => {
    const angle = index * Math.PI * 2 / segments
    return { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY }
  })
}

function radialPoints(width: number, height: number, count: number, radiusAt: (index: number) => number): ProfilePoint[] {
  const radiusX = width / 2
  const radiusY = height / 2
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count
    const radius = radiusAt(index)
    return { x: Math.cos(angle) * radiusX * radius, y: Math.sin(angle) * radiusY * radius }
  })
}

function fitToBounds(points: readonly ProfilePoint[], width: number, height: number): ProfilePoint[] {
  const minX = Math.min(...points.map((current) => current.x))
  const maxX = Math.max(...points.map((current) => current.x))
  const minY = Math.min(...points.map((current) => current.y))
  const maxY = Math.max(...points.map((current) => current.y))
  const currentWidth = maxX - minX
  const currentHeight = maxY - minY
  if (!(currentWidth > 0) || !(currentHeight > 0)) {
    throw new ProfileRecipeError('UNSAFE_OUTPUT', 'points', 'The requested recipe collapsed to a line or point.')
  }
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return points.map((current) => ({
    x: (current.x - centerX) * width / currentWidth,
    y: (current.y - centerY) * height / currentHeight,
  }))
}

function capsulePoints(width: number, height: number): ProfilePoint[] {
  if (Math.abs(width - height) <= Math.max(width, height) * 1e-12) return ellipsePoints(width, height)
  const output: ProfilePoint[] = []
  if (width > height) {
    const radius = height / 2
    const centerX = (width - height) / 2
    for (let index = 0; index <= CAPSULE_CAP_SEGMENTS; index += 1) {
      const angle = -Math.PI / 2 + Math.PI * index / CAPSULE_CAP_SEGMENTS
      output.push({ x: centerX + Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    }
    for (let index = 0; index <= CAPSULE_CAP_SEGMENTS; index += 1) {
      const angle = Math.PI / 2 + Math.PI * index / CAPSULE_CAP_SEGMENTS
      output.push({ x: -centerX + Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    }
  } else {
    const radius = width / 2
    const centerY = (height - width) / 2
    for (let index = 0; index <= CAPSULE_CAP_SEGMENTS; index += 1) {
      const angle = Math.PI * index / CAPSULE_CAP_SEGMENTS
      output.push({ x: Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius })
    }
    for (let index = 0; index <= CAPSULE_CAP_SEGMENTS; index += 1) {
      const angle = Math.PI + Math.PI * index / CAPSULE_CAP_SEGMENTS
      output.push({ x: Math.cos(angle) * radius, y: -centerY + Math.sin(angle) * radius })
    }
  }
  return cleanClosedProfile(output)
}

function roundedRectangleRecipe(width: number, height: number, cornerRadius: number): ProfileRecipe {
  if (!Number.isFinite(cornerRadius) || cornerRadius < 0) {
    throw new ProfileRecipeError('INVALID_RADIUS', 'cornerRadius', `cornerRadius must be a finite non-negative number; received ${cornerRadius}.`)
  }
  const clampedRadius = Math.min(cornerRadius, width / 2, height / 2)
  return {
    points: [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 },
    ],
    settings: { ...POLYLINE_SETTINGS, curveMode: clampedRadius > 0 ? 'rounded' : 'polyline', cornerRadius: clampedRadius },
  }
}

function validateRecipe(recipe: ProfileRecipe): ProfileRecipe {
  let points = normalizeProfileWinding(cleanClosedProfile(recipe.points))
  if (points.length > MAX_PROFILE_SOURCE_POINTS || !isSimpleClosedProfile(points)) {
    throw new ProfileRecipeError('UNSAFE_OUTPUT', 'points', 'The requested recipe did not produce a safe simple outline.')
  }
  if (getProfileOrientation(points) !== 'counter-clockwise' || points.some((current) => !Number.isFinite(current.x) || !Number.isFinite(current.y))) {
    throw new ProfileRecipeError('UNSAFE_OUTPUT', 'points', 'The requested recipe produced invalid or inconsistently wound points.')
  }

  // Validate that the settings and control points are accepted by the shared
  // runtime sampler as well as by this recipe kernel.
  const sampled = sampleClosedProfile(points, recipe.settings)
  if (!isSimpleClosedProfile(sampled)) {
    throw new ProfileRecipeError('UNSAFE_OUTPUT', 'settings', 'The requested recipe settings produced an unstable sampled outline.')
  }
  if (getProfileOrientation(points) === 'clockwise') points = points.reverse()
  return { points, settings: { ...recipe.settings } }
}

export function createProfileRecipe(spec: ProfileRecipeSpec): ProfileRecipe {
  assertDimension(spec.width, 'width')
  if (spec.kind !== 'circle') assertDimension(spec.height, 'height')

  let recipe: ProfileRecipe
  switch (spec.kind) {
    case 'circle':
      recipe = { points: ellipsePoints(spec.width, spec.width), settings: { ...POLYLINE_SETTINGS } }
      break
    case 'ellipse':
      recipe = { points: ellipsePoints(spec.width, spec.height), settings: { ...POLYLINE_SETTINGS } }
      break
    case 'regularPolygon':
      assertCount(spec.sides, 'sides', MIN_PROFILE_RECIPE_SIDES, MAX_PROFILE_RECIPE_SIDES)
      recipe = {
        points: fitToBounds(radialPoints(spec.width, spec.height, spec.sides, () => 1), spec.width, spec.height),
        settings: { ...POLYLINE_SETTINGS },
      }
      break
    case 'star':
      assertCount(spec.sides, 'sides', MIN_PROFILE_RECIPE_SIDES, MAX_PROFILE_RECIPE_SIDES)
      assertRatio(spec.innerRatio, 'star')
      recipe = {
        points: fitToBounds(
          radialPoints(spec.width, spec.height, spec.sides * 2, (index) => index % 2 === 0 ? 1 : spec.innerRatio),
          spec.width,
          spec.height,
        ),
        settings: { ...POLYLINE_SETTINGS },
      }
      break
    case 'capsule':
      recipe = { points: capsulePoints(spec.width, spec.height), settings: { ...POLYLINE_SETTINGS } }
      break
    case 'roundedRectangle':
      recipe = roundedRectangleRecipe(spec.width, spec.height, spec.cornerRadius)
      break
    case 'gear':
      assertCount(spec.teeth, 'teeth', MIN_PROFILE_RECIPE_TEETH, MAX_PROFILE_RECIPE_TEETH)
      assertRatio(spec.innerRatio, 'gear')
      recipe = {
        points: fitToBounds(
          radialPoints(spec.width, spec.height, spec.teeth * 4, (index) => index % 4 === 1 || index % 4 === 2 ? 1 : spec.innerRatio),
          spec.width,
          spec.height,
        ),
        settings: { ...POLYLINE_SETTINGS },
      }
      break
  }
  return validateRecipe(recipe)
}
