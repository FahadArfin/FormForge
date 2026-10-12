import { nanoid } from 'nanoid'
import { evaluateParameters, parseModelDocument, type ModelDocument, type ModelNode, type ParameterBindingTarget, type ParameterDefinition, type ParameterVariant } from '@formforge/model'
import { getParameterTargetInfo, readParameterTarget, resolveDocumentParameterBindings, writeParameterTarget } from './modelParameters'

export const PARAMETER_PRESET_MAX_BYTES = 1024 * 1024
const FORMAT = 'printlab-parameter-presets'
type PortableParameter = Omit<ParameterDefinition, 'id'>
type PortableVariant = { name: string; parameters: PortableParameter[] }
export interface ParameterPresetReview { source: ModelDocument; variants: ParameterVariant[] }

function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}: expected an object.`)
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(record, key))) throw new Error(`Invalid ${label}: missing or unexpected fields.`)
  return record
}
function text(value: unknown, max: number, label: string, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && (!value.trim() || value !== value.trim()))) throw new Error(`Invalid ${label}: use ${empty ? '0' : '1'}–${max} characters${empty ? '' : ' without surrounding spaces'}.`)
  return value
}
function array(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new Error(`${label} must contain 1–${max} entries.`)
  return value
}
function unique(names: string[], label: string) {
  const seen = new Set<string>()
  for (const name of names) { const key = name.toLowerCase(); if (seen.has(key)) throw new Error(`Duplicate ${label}: “${name}”.`); seen.add(key) }
}
function parsePresets(content: string): PortableVariant[] {
  if (content.length > PARAMETER_PRESET_MAX_BYTES || new TextEncoder().encode(content).byteLength > PARAMETER_PRESET_MAX_BYTES) throw new Error('Preset files must be at most 1 MiB.')
  let data: unknown
  try { data = JSON.parse(content) } catch { throw new Error('This file is not valid preset JSON.') }
  const root = object(data, ['format', 'version', 'variants'], 'preset file')
  if (root.format !== FORMAT || root.version !== 1) throw new Error('Unsupported preset format or version. Use PrintLab parameter presets version 1.')
  const variants = array(root.variants, 24, 'Presets').map(raw => {
    const variant = object(raw, ['name', 'parameters'], 'preset')
    const name = text(variant.name, 64, 'preset name')
    const parameters = array(variant.parameters, 256, 'Parameters').map(rawParameter => {
      const parameter = object(rawParameter, ['name', 'expression', 'unit', 'value'], 'parameter')
      const parameterName = text(parameter.name, 128, 'parameter name')
      const expression = text(parameter.expression, 256, 'parameter expression', true)
      if (!['mm', 'cm', 'm', 'in', 'deg', 'rad'].includes(parameter.unit as string)) throw new Error(`Unsupported unit for “${parameterName}”.`)
      if (typeof parameter.value !== 'number' || !Number.isFinite(parameter.value)) throw new Error(`Parameter “${parameterName}” must have a finite value.`)
      return { name: parameterName, expression, unit: parameter.unit as ParameterDefinition['unit'], value: parameter.value }
    })
    unique(parameters.map(parameter => parameter.name), 'parameter name')
    evaluateParameters(parameters.map((parameter, index) => ({ ...parameter, id: `preset-${index}` })))
    return { name, parameters }
  })
  unique(variants.map(variant => variant.name), 'preset name')
  return variants
}

/** Only saved parameter data is portable; project IDs, geometry and metadata are omitted. */
export function serializeParameterPresets(document: ModelDocument): string {
  if (!document.parameterVariants?.length) throw new Error('Save at least one parameter variant before exporting saved presets.')
  const content = JSON.stringify({ format: FORMAT, version: 1, variants: document.parameterVariants.map(variant => ({
    name: variant.name,
    parameters: variant.parameters.map(({ name, expression, unit, value }) => ({ name, expression, unit, value })),
  })) }, null, 2)
  parsePresets(content)
  return content
}

// Matches mesh-import coordinate limits and the existing precision-transform envelope.
// An analytical radius avoids allocating preview meshes for every imported preset.
function validateResolvedGeometryRange(node: ModelNode) {
  const { position, rotation, scale } = node.transform
  if (Object.values(position).some(value => !Number.isFinite(value) || Math.abs(value) > 1e6)
    || Object.values(rotation).some(value => !Number.isFinite(value) || Math.abs(value) > 1e7)
    || Object.values(scale).some(value => !Number.isFinite(value) || Math.abs(value) < 0.0001 || Math.abs(value) > 10000)) {
    throw new Error(`Preset exceeds supported position, rotation or scale limits on “${node.name}”.`)
  }
  const p = node.parameters
  // Covers the box/loft half-extents and radial primitives, including torus/spring wire.
  let radius = Math.hypot(Math.max(p.width, p.topWidth) / 2, Math.max(p.depth, p.topDepth) / 2, p.height / 2, p.radius + Math.max(0.5, p.radiusTop))
  if (node.kind === 'mesh' && node.mesh) {
    radius = 0
    for (let index = 0; index < node.mesh.positions.length; index += 3) radius = Math.max(radius, Math.hypot(node.mesh.positions[index]!, node.mesh.positions[index + 1]!, node.mesh.positions[index + 2]!))
  } else if ((node.kind === 'extrude' || node.kind === 'revolve') && node.profile?.length) {
    let profileRadius = 0
    for (const point of node.profile) profileRadius = Math.max(profileRadius, Math.hypot(point.x, point.y))
    // Allow a conservative margin for sampled spline/rounding/offset profile operations.
    if (node.profileSettings?.curveMode === 'spline') profileRadius *= 4
    profileRadius += 4 * (Math.abs(node.profileSettings?.offset ?? 0) + (node.profileSettings?.cornerRadius ?? 0))
    radius = Math.hypot(profileRadius, node.kind === 'extrude' ? p.height / 2 : 0)
  }
  if (node.deformation?.kind === 'taper') radius *= 1 + Math.abs(node.deformation.amount) / 100
  if (node.deformation?.kind === 'bend') radius += Math.abs(node.deformation.amount) * 0.2
  const extent = radius * Math.max(...Object.values(scale).map(Math.abs)) + Math.max(...Object.values(position).map(Math.abs))
  if (!Number.isFinite(extent) || extent > 1e7) throw new Error(`Preset exceeds the supported 10 km geometry range on “${node.name}” after scaling or deformation.`)
}
function validateBindings(document: ModelDocument, parameters: ParameterDefinition[]) {
  const candidate = { ...document, namedParameters: parameters }
  const reserved = new Set(parameters.map(parameter => parameter.name.toLowerCase()))
  for (const node of document.nodes) {
    for (const [key, expression] of Object.entries(node.parameterBindings ?? {})) {
      const target = key as ParameterBindingTarget
      let name = '__preset_binding'
      while (reserved.has(name.toLowerCase())) name += '_'
      let id = '__preset_binding'
      while (parameters.some(parameter => parameter.id.toLowerCase() === id.toLowerCase())) id += '_'
      const binding = evaluateParameters([...parameters, { id, name, expression: expression!, unit: getParameterTargetInfo(target).unit, value: readParameterTarget(node, target) }]).get(name)!
      if (!Number.isFinite(binding.value) || Math.abs(binding.value) > 1e7) throw new Error(`Preset exceeds the supported range for ${target} on “${node.name}” (maximum magnitude 10,000,000 ${getParameterTargetInfo(target).unit}).`)
      if (readParameterTarget(writeParameterTarget(node, target, binding.value), target) !== binding.value) throw new Error(`Preset produces an invalid ${target} dimension on “${node.name}”.`)
    }
  }
  const resolved = resolveDocumentParameterBindings(candidate)
  const errors = Object.values(resolved.errors)
  if (errors.length) throw new Error(errors[0])
  parseModelDocument(resolved.document)
  for (const node of resolved.document.nodes) {
    if (Object.keys(node.parameterBindings ?? {}).length || node.faceAttachment) validateResolvedGeometryRange(node)
  }
}

export function previewParameterPresets(content: string, document: ModelDocument): ParameterPresetReview {
  const portable = parsePresets(content)
  if (!document.namedParameters.length || document.namedParameters.length > 256) throw new Error('The target project needs 1–256 named parameters.')
  unique(document.namedParameters.map(parameter => parameter.name), 'target parameter name')
  if ((document.parameterVariants?.length ?? 0) + portable.length > 24) throw new Error('A project can store at most 24 presets. Remove saved variants first.')
  const existingNames = new Set((document.parameterVariants ?? []).map(variant => variant.name.toLowerCase()))
  const variants = portable.map(variant => {
    if (existingNames.has(variant.name.toLowerCase())) throw new Error(`Preset “${variant.name}” already exists. Rename or remove the saved variant first.`)
    if (variant.parameters.length !== document.namedParameters.length) throw new Error(`Preset “${variant.name}” must contain exactly the target project's parameters.`)
    const parameters = variant.parameters.map(parameter => {
      const target = document.namedParameters.find(item => item.name === parameter.name)
      if (!target) throw new Error(`Parameter “${parameter.name}” has no exact name match in this project.`)
      if (target.unit !== parameter.unit) throw new Error(`Parameter “${parameter.name}” uses ${parameter.unit}; the target unit is ${target.unit}. Units must match exactly.`)
      return { ...parameter, id: target.id }
    })
    validateBindings(document, parameters)
    return { id: nanoid(), name: variant.name, parameters }
  })
  return { source: document, variants }
}

export function addParameterPresets(document: ModelDocument, review: ParameterPresetReview): ModelDocument {
  if (document !== review.source) throw new Error('The project changed. Choose the file and review the presets again.')
  const next = { ...document, parameterVariants: [...document.parameterVariants ?? [], ...review.variants], revision: document.revision + 1, updatedAt: new Date().toISOString() }
  parseModelDocument(next)
  return next
}
