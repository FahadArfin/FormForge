import { nanoid } from 'nanoid'
import { parseModelDocument, type ModelDocument, type ParameterVariant } from '@formforge/model'
import { resolveDocumentParameterBindings } from './modelParameters'

function assertResolved(document: ModelDocument) {
  const resolved = resolveDocumentParameterBindings(document)
  const errors = Object.values(resolved.errors)
  if (errors.length) throw new Error(errors[0])
  return resolved.document
}

export function captureParameterVariant(document: ModelDocument, name: string): ParameterVariant {
  if (!name.trim() || name.trim().length > 64) throw new Error('Name this variant using 1–64 characters.')
  if (!document.namedParameters.length) throw new Error('Add named parameters before saving a variant.')
  if ((document.parameterVariants?.length ?? 0) >= 24) throw new Error('A project can store up to 24 variants.')
  if (document.parameterVariants?.some(v => v.name.toLowerCase() === name.trim().toLowerCase())) throw new Error('Choose a different variant name.')
  assertResolved(document)
  const variant = { id: nanoid(), name: name.trim(), parameters: structuredClone(document.namedParameters) }
  parseModelDocument({ ...document, parameterVariants: [...document.parameterVariants ?? [], variant] })
  return variant
}

export function variantMatches(document: ModelDocument, variant: ParameterVariant) {
  return document.namedParameters.length === variant.parameters.length && variant.parameters.every(saved => {
    const current = document.namedParameters.find(p => p.id === saved.id)
    return current && current.name === saved.name && current.value === saved.value && current.expression === saved.expression && current.unit === saved.unit
  })
}

export function applyParameterVariant(document: ModelDocument, variant: ParameterVariant): ModelDocument {
  if (document.nodes.some(node => node.locked && Object.keys(node.parameterBindings ?? {}).length)) throw new Error('Unlock shapes with parameter bindings before applying a variant.')
  if (document.sculptStrokes.length) throw new Error('Parameter variants cannot reshape a model with retained volume strokes. Export and reimport its evaluated mesh first.')
  if (variant.parameters.length !== document.namedParameters.length || variant.parameters.some(saved => !document.namedParameters.some(p => p.id === saved.id && p.name === saved.name))) throw new Error('The parameter list has changed. Save a new variant for the current parameter names.')
  const parsed = parseModelDocument({ ...document, parameterVariants: [variant], namedParameters: structuredClone(variant.parameters) })
  const resolved = assertResolved({ ...parsed, parameterVariants: document.parameterVariants })
  return { ...resolved, revision: document.revision + 1, updatedAt: new Date().toISOString() }
}
