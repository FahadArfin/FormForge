import {
  evaluateParameters,
  type ModelDocument,
  type ModelNode,
  type ParameterBindingTarget,
  type ParameterDefinition,
  type ParameterEvaluationResult,
  type ParameterUnit,
} from '@formforge/model'

export const parameterTargets: ReadonlyArray<{
  target: ParameterBindingTarget
  label: string
  unit: Extract<ParameterUnit, 'mm' | 'deg'>
}> = [
  { target: 'width', label: 'Width', unit: 'mm' },
  { target: 'depth', label: 'Depth', unit: 'mm' },
  { target: 'height', label: 'Height', unit: 'mm' },
  { target: 'radius', label: 'Radius', unit: 'mm' },
  { target: 'radiusTop', label: 'Secondary radius', unit: 'mm' },
  { target: 'fillet', label: 'Fillet', unit: 'mm' },
  { target: 'topWidth', label: 'Top width', unit: 'mm' },
  { target: 'topDepth', label: 'Top depth', unit: 'mm' },
  { target: 'wall', label: 'Wall thickness', unit: 'mm' },
  { target: 'positionX', label: 'Position X', unit: 'mm' },
  { target: 'positionY', label: 'Position Y', unit: 'mm' },
  { target: 'positionZ', label: 'Position Z', unit: 'mm' },
  { target: 'twist', label: 'Twist', unit: 'deg' },
  { target: 'rotationX', label: 'Rotation X', unit: 'deg' },
  { target: 'rotationY', label: 'Rotation Y', unit: 'deg' },
  { target: 'rotationZ', label: 'Rotation Z', unit: 'deg' },
]

const infoByTarget = new Map(parameterTargets.map((entry) => [entry.target, entry]))

export function getParameterTargetInfo(target: ParameterBindingTarget) {
  return infoByTarget.get(target)!
}

export function readParameterTarget(node: ModelNode, target: ParameterBindingTarget): number {
  if (target === 'positionX') return node.transform.position.x
  if (target === 'positionY') return node.transform.position.y
  if (target === 'positionZ') return node.transform.position.z
  if (target === 'rotationX') return node.transform.rotation.x
  if (target === 'rotationY') return node.transform.rotation.y
  if (target === 'rotationZ') return node.transform.rotation.z
  return node.parameters[target]
}

function clampTargetValue(target: ParameterBindingTarget, value: number) {
  if (['positionX', 'positionY', 'positionZ', 'rotationX', 'rotationY', 'rotationZ', 'twist'].includes(target)) return value
  if (['radiusTop', 'fillet', 'wall'].includes(target)) return Math.max(0, value)
  return Math.max(0.1, value)
}

export function writeParameterTarget(node: ModelNode, target: ParameterBindingTarget, value: number): ModelNode {
  const next = clampTargetValue(target, value)
  if (target === 'positionX' || target === 'positionY' || target === 'positionZ') {
    const axis = target.at(-1)!.toLowerCase() as 'x' | 'y' | 'z'
    return { ...node, transform: { ...node.transform, position: { ...node.transform.position, [axis]: next } } }
  }
  if (target === 'rotationX' || target === 'rotationY' || target === 'rotationZ') {
    const axis = target.at(-1)!.toLowerCase() as 'x' | 'y' | 'z'
    return { ...node, transform: { ...node.transform, rotation: { ...node.transform.rotation, [axis]: next } } }
  }
  return { ...node, parameters: { ...node.parameters, [target]: next } }
}

export function evaluateNamedParameters(definitions: readonly ParameterDefinition[]): ParameterEvaluationResult {
  return evaluateParameters(definitions)
}

export interface ResolvedDocumentParameters {
  document: ModelDocument
  errors: Readonly<Record<string, string>>
  evaluation?: ParameterEvaluationResult
}

export function resolveDocumentParameterBindings(document: ModelDocument): ResolvedDocumentParameters {
  let evaluation: ParameterEvaluationResult
  try {
    evaluation = evaluateNamedParameters(document.namedParameters)
  } catch (error) {
    return {
      document,
      errors: { parameters: error instanceof Error ? error.message : 'Could not evaluate named parameters.' },
    }
  }

  const errors: Record<string, string> = {}
  const reserved = new Set(document.namedParameters.map((definition) => definition.name.trim().toLowerCase()))
  const nodes = document.nodes.map((source) => {
    let node = source
    for (const [rawTarget, rawExpression] of Object.entries(source.parameterBindings ?? {})) {
      const target = rawTarget as ParameterBindingTarget
      const expression = rawExpression?.trim()
      if (!expression || !infoByTarget.has(target)) continue
      let temporaryName = `__${source.id}_${target}`.replace(/[^\p{L}\p{N}_]/gu, '_')
      while (reserved.has(temporaryName.toLowerCase())) temporaryName = `_${temporaryName}`
      try {
        const binding = evaluateParameters([
          ...document.namedParameters,
          {
            id: `binding:${source.id}:${target}`,
            name: temporaryName,
            expression,
            unit: getParameterTargetInfo(target).unit,
            value: readParameterTarget(node, target),
          },
        ]).get(temporaryName)
        if (binding) node = writeParameterTarget(node, target, binding.value)
      } catch (error) {
        errors[`${source.id}:${target}`] = error instanceof Error ? error.message : 'Invalid parameter binding.'
      }
    }
    return node
  })

  return { document: { ...document, nodes }, errors, evaluation }
}
