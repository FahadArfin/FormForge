export type ParameterUnit = 'mm' | 'cm' | 'm' | 'in' | 'deg' | 'rad'

export type CanonicalParameterUnit = 'mm' | 'rad'

export type ParameterDimension = 'length' | 'angle'

export interface ParameterDefinition {
  id: string
  name: string
  expression: string
  unit: ParameterUnit
  value: number
}

export type ParameterExpressionNode =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'reference'; readonly name: string }
  | { readonly kind: 'unary'; readonly operator: '+' | '-'; readonly operand: ParameterExpressionNode }
  | {
      readonly kind: 'binary'
      readonly operator: '+' | '-' | '*' | '/'
      readonly left: ParameterExpressionNode
      readonly right: ParameterExpressionNode
    }

export interface EvaluatedParameter extends ParameterDefinition {
  /** The resolved value expressed in this parameter's declared unit. */
  value: number
  /** The resolved value in millimetres for lengths or radians for angles. */
  canonicalValue: number
  canonicalUnit: CanonicalParameterUnit
  dimension: ParameterDimension
  dependencies: readonly string[]
}

export interface ParameterDependencyGraph {
  /** Dependencies keyed by the parameter's declared (trimmed) name. */
  dependencies: ReadonlyMap<string, readonly string[]>
  /** Reverse edges keyed by the parameter's declared (trimmed) name. */
  dependents: ReadonlyMap<string, readonly string[]>
  /** A dependency-first order suitable for evaluation. */
  order: readonly string[]
}

export interface ParameterEvaluationResult {
  parameters: readonly EvaluatedParameter[]
  graph: ParameterDependencyGraph
  /** Canonical values keyed by each parameter's declared (trimmed) name. */
  values: Readonly<Record<string, number>>
  /** Finds an evaluated parameter by name without case sensitivity. */
  get(name: string): EvaluatedParameter | undefined
}

export type ParameterErrorCode =
  | 'INVALID_DEFINITION'
  | 'DUPLICATE_ID'
  | 'DUPLICATE_NAME'
  | 'SYNTAX_ERROR'
  | 'UNKNOWN_REFERENCE'
  | 'CYCLE'
  | 'UNIT_MISMATCH'
  | 'DIVISION_BY_ZERO'
  | 'NON_FINITE_RESULT'

export interface ParameterExpressionErrorDetails {
  parameterId?: string
  parameterName?: string
  referenceName?: string
  position?: number
  cycle?: readonly string[]
}

export class ParameterExpressionError extends Error {
  readonly code: ParameterErrorCode
  readonly parameterId?: string
  readonly parameterName?: string
  readonly referenceName?: string
  readonly position?: number
  readonly cycle?: readonly string[]

  constructor(code: ParameterErrorCode, message: string, details: ParameterExpressionErrorDetails = {}) {
    super(message)
    this.name = 'ParameterExpressionError'
    this.code = code
    this.parameterId = details.parameterId
    this.parameterName = details.parameterName
    this.referenceName = details.referenceName
    this.position = details.position
    this.cycle = details.cycle
  }
}

interface UnitInfo {
  readonly dimension: ParameterDimension
  readonly canonicalUnit: CanonicalParameterUnit
  readonly scaleToCanonical: number
}

const UNIT_INFO: Readonly<Record<ParameterUnit, UnitInfo>> = {
  mm: { dimension: 'length', canonicalUnit: 'mm', scaleToCanonical: 1 },
  cm: { dimension: 'length', canonicalUnit: 'mm', scaleToCanonical: 10 },
  m: { dimension: 'length', canonicalUnit: 'mm', scaleToCanonical: 1_000 },
  in: { dimension: 'length', canonicalUnit: 'mm', scaleToCanonical: 25.4 },
  deg: { dimension: 'angle', canonicalUnit: 'rad', scaleToCanonical: Math.PI / 180 },
  rad: { dimension: 'angle', canonicalUnit: 'rad', scaleToCanonical: 1 },
}

type TokenKind = 'number' | 'reference' | '+' | '-' | '*' | '/' | '(' | ')' | 'eof'

interface Token {
  readonly kind: TokenKind
  readonly position: number
  readonly value?: number | string
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function isIdentifierStart(character: string): boolean {
  return /[\p{L}_]/u.test(character)
}

function isIdentifierPart(character: string): boolean {
  return /[\p{L}\p{N}_]/u.test(character)
}

function syntaxError(expression: string, position: number, reason: string, parameterName?: string): ParameterExpressionError {
  const owner = parameterName ? ` for parameter "${parameterName}"` : ''
  return new ParameterExpressionError(
    'SYNTAX_ERROR',
    `Invalid parameter expression${owner} at character ${position + 1}: ${reason}. Expression: "${expression}"`,
    { parameterName, position },
  )
}

function tokenize(expression: string, parameterName?: string): Token[] {
  const tokens: Token[] = []
  let position = 0

  while (position < expression.length) {
    const character = expression[position]!
    if (/\s/u.test(character)) {
      position += 1
      continue
    }

    if ('+-*/()'.includes(character)) {
      tokens.push({ kind: character as TokenKind, position })
      position += 1
      continue
    }

    if (character === '[') {
      const start = position
      const close = expression.indexOf(']', position + 1)
      if (close < 0) {
        throw syntaxError(expression, start, 'missing closing ] for a parameter reference', parameterName)
      }
      const name = expression.slice(position + 1, close).trim()
      if (!name) {
        throw syntaxError(expression, start, 'an empty bracketed parameter reference is not allowed', parameterName)
      }
      tokens.push({ kind: 'reference', position: start, value: name })
      position = close + 1
      continue
    }

    if (/\d/u.test(character) || (character === '.' && /\d/u.test(expression[position + 1] ?? ''))) {
      const start = position
      while (/\d/u.test(expression[position] ?? '')) position += 1
      if (expression[position] === '.') {
        position += 1
        while (/\d/u.test(expression[position] ?? '')) position += 1
      }
      if (expression[position] === 'e' || expression[position] === 'E') {
        const exponentPosition = position
        position += 1
        if (expression[position] === '+' || expression[position] === '-') position += 1
        const exponentStart = position
        while (/\d/u.test(expression[position] ?? '')) position += 1
        if (exponentStart === position) {
          throw syntaxError(expression, exponentPosition, 'the exponent requires at least one digit', parameterName)
        }
      }
      const source = expression.slice(start, position)
      const value = Number(source)
      if (!Number.isFinite(value)) {
        throw syntaxError(expression, start, `"${source}" is not a finite number`, parameterName)
      }
      tokens.push({ kind: 'number', position: start, value })
      continue
    }

    if (isIdentifierStart(character)) {
      const start = position
      position += 1
      while (isIdentifierPart(expression[position] ?? '')) position += 1
      tokens.push({ kind: 'reference', position: start, value: expression.slice(start, position) })
      continue
    }

    throw syntaxError(expression, position, `unexpected character "${character}"`, parameterName)
  }

  tokens.push({ kind: 'eof', position: expression.length })
  return tokens
}

class ExpressionParser {
  private index = 0

  constructor(
    private readonly expression: string,
    private readonly tokens: readonly Token[],
    private readonly parameterName?: string,
  ) {}

  parse(): ParameterExpressionNode {
    if (this.peek().kind === 'eof') {
      throw syntaxError(this.expression, 0, 'the expression is empty', this.parameterName)
    }
    const result = this.parseAdditive()
    const remainder = this.peek()
    if (remainder.kind !== 'eof') {
      throw syntaxError(this.expression, remainder.position, `expected an operator but found ${this.describe(remainder)}`, this.parameterName)
    }
    return result
  }

  private parseAdditive(): ParameterExpressionNode {
    let left = this.parseMultiplicative()
    while (this.peek().kind === '+' || this.peek().kind === '-') {
      const operator = this.consume().kind as '+' | '-'
      left = { kind: 'binary', operator, left, right: this.parseMultiplicative() }
    }
    return left
  }

  private parseMultiplicative(): ParameterExpressionNode {
    let left = this.parseUnary()
    while (this.peek().kind === '*' || this.peek().kind === '/') {
      const operator = this.consume().kind as '*' | '/'
      left = { kind: 'binary', operator, left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): ParameterExpressionNode {
    if (this.peek().kind === '+' || this.peek().kind === '-') {
      const operator = this.consume().kind as '+' | '-'
      return { kind: 'unary', operator, operand: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): ParameterExpressionNode {
    const token = this.consume()
    if (token.kind === 'number') return { kind: 'number', value: token.value as number }
    if (token.kind === 'reference') return { kind: 'reference', name: token.value as string }
    if (token.kind === '(') {
      const expression = this.parseAdditive()
      const close = this.consume()
      if (close.kind !== ')') {
        throw syntaxError(this.expression, close.position, `expected ) but found ${this.describe(close)}`, this.parameterName)
      }
      return expression
    }
    throw syntaxError(this.expression, token.position, `expected a number, parameter name, or ( but found ${this.describe(token)}`, this.parameterName)
  }

  private peek(): Token {
    return this.tokens[this.index]!
  }

  private consume(): Token {
    const token = this.peek()
    this.index += 1
    return token
  }

  private describe(token: Token): string {
    if (token.kind === 'eof') return 'the end of the expression'
    if (token.kind === 'number' || token.kind === 'reference') return `"${String(token.value)}"`
    return `"${token.kind}"`
  }
}

export function parseParameterExpression(expression: string, parameterName?: string): ParameterExpressionNode {
  return new ExpressionParser(expression, tokenize(expression, parameterName), parameterName).parse()
}

function collectDependencies(node: ParameterExpressionNode, output: string[], seen: Set<string>): void {
  if (node.kind === 'reference') {
    const normalized = normalizeName(node.name)
    if (!seen.has(normalized)) {
      seen.add(normalized)
      output.push(node.name.trim())
    }
    return
  }
  if (node.kind === 'unary') {
    collectDependencies(node.operand, output, seen)
    return
  }
  if (node.kind === 'binary') {
    collectDependencies(node.left, output, seen)
    collectDependencies(node.right, output, seen)
  }
}

export function getParameterDependencies(expression: string, parameterName?: string): readonly string[] {
  const output: string[] = []
  collectDependencies(parseParameterExpression(expression, parameterName), output, new Set<string>())
  return Object.freeze(output)
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new ParameterExpressionError('INVALID_DEFINITION', `${label} must be a finite number.`)
  }
}

export function convertParameterValueToCanonical(value: number, unit: ParameterUnit): number {
  assertFinite(value, 'Parameter value')
  return value * UNIT_INFO[unit].scaleToCanonical
}

export function convertCanonicalParameterValue(value: number, unit: ParameterUnit): number {
  assertFinite(value, 'Canonical parameter value')
  return value / UNIT_INFO[unit].scaleToCanonical
}

interface PreparedParameter {
  readonly definition: ParameterDefinition
  readonly normalizedName: string
  readonly ast?: ParameterExpressionNode
  readonly dependencyNames: readonly string[]
  readonly dependencyKeys: readonly string[]
}

interface PreparedModel {
  readonly entries: readonly PreparedParameter[]
  readonly byName: ReadonlyMap<string, PreparedParameter>
  readonly order: readonly PreparedParameter[]
  readonly graph: ParameterDependencyGraph
}

function validateUnit(unit: string, definition: ParameterDefinition): asserts unit is ParameterUnit {
  if (!Object.hasOwn(UNIT_INFO, unit)) {
    throw new ParameterExpressionError(
      'INVALID_DEFINITION',
      `Parameter "${definition.name}" has unsupported unit "${unit}". Use mm, cm, m, in, deg, or rad.`,
      { parameterId: definition.id, parameterName: definition.name },
    )
  }
}

function prepareParameters(definitions: readonly ParameterDefinition[]): PreparedModel {
  const nameKeys = new Map<string, ParameterDefinition>()
  const idKeys = new Map<string, ParameterDefinition>()
  const entries: PreparedParameter[] = []

  for (const source of definitions) {
    const id = source.id.trim()
    const name = source.name.trim()
    if (!id || !name) {
      throw new ParameterExpressionError(
        'INVALID_DEFINITION',
        `Every parameter requires a non-empty id and name; received id "${source.id}" and name "${source.name}".`,
        { parameterId: source.id, parameterName: source.name },
      )
    }
    if (!Number.isFinite(source.value)) {
      throw new ParameterExpressionError('INVALID_DEFINITION', `Parameter "${name}" has a non-finite fallback value.`, {
        parameterId: id,
        parameterName: name,
      })
    }
    validateUnit(source.unit, source)

    const idKey = id.toLowerCase()
    const previousId = idKeys.get(idKey)
    if (previousId) {
      throw new ParameterExpressionError(
        'DUPLICATE_ID',
        `Duplicate parameter id "${id}" is used by both "${previousId.name.trim()}" and "${name}".`,
        { parameterId: id, parameterName: name },
      )
    }
    idKeys.set(idKey, source)

    const normalizedName = normalizeName(name)
    const previousName = nameKeys.get(normalizedName)
    if (previousName) {
      throw new ParameterExpressionError(
        'DUPLICATE_NAME',
        `Duplicate parameter name "${name}" conflicts with "${previousName.name.trim()}"; names are case-insensitive.`,
        { parameterId: id, parameterName: name },
      )
    }
    nameKeys.set(normalizedName, source)

    const expression = source.expression.trim()
    const ast = expression ? parseParameterExpression(expression, name) : undefined
    const dependencyNames: string[] = []
    if (ast) collectDependencies(ast, dependencyNames, new Set<string>())

    entries.push({
      definition: { ...source, id, name },
      normalizedName,
      ast,
      dependencyNames: Object.freeze(dependencyNames),
      dependencyKeys: Object.freeze(dependencyNames.map(normalizeName)),
    })
  }

  const byName = new Map(entries.map((entry) => [entry.normalizedName, entry]))
  for (const entry of entries) {
    entry.dependencyNames.forEach((referenceName, index) => {
      const referenceKey = entry.dependencyKeys[index]!
      if (!byName.has(referenceKey)) {
        throw new ParameterExpressionError(
          'UNKNOWN_REFERENCE',
          `Parameter "${entry.definition.name}" references unknown parameter "${referenceName}".`,
          { parameterId: entry.definition.id, parameterName: entry.definition.name, referenceName },
        )
      }
    })
  }

  const state = new Map<string, 'visiting' | 'visited'>()
  const stack: PreparedParameter[] = []
  const order: PreparedParameter[] = []

  const visit = (entry: PreparedParameter): void => {
    const existing = state.get(entry.normalizedName)
    if (existing === 'visited') return
    if (existing === 'visiting') {
      const start = stack.findIndex((item) => item.normalizedName === entry.normalizedName)
      const cycleEntries = [...stack.slice(Math.max(0, start)), entry]
      const cycle = cycleEntries.map((item) => item.definition.name)
      throw new ParameterExpressionError('CYCLE', `Parameter dependency cycle detected: ${cycle.join(' -> ')}.`, {
        parameterId: entry.definition.id,
        parameterName: entry.definition.name,
        cycle,
      })
    }

    state.set(entry.normalizedName, 'visiting')
    stack.push(entry)
    for (const dependencyKey of entry.dependencyKeys) visit(byName.get(dependencyKey)!)
    stack.pop()
    state.set(entry.normalizedName, 'visited')
    order.push(entry)
  }

  entries.forEach(visit)

  const dependencies = new Map<string, readonly string[]>()
  const mutableDependents = new Map<string, string[]>()
  entries.forEach((entry) => {
    dependencies.set(
      entry.definition.name,
      Object.freeze(entry.dependencyKeys.map((key) => byName.get(key)!.definition.name)),
    )
    mutableDependents.set(entry.definition.name, [])
  })
  entries.forEach((entry) => {
    for (const dependencyKey of entry.dependencyKeys) {
      mutableDependents.get(byName.get(dependencyKey)!.definition.name)!.push(entry.definition.name)
    }
  })
  const dependents = new Map<string, readonly string[]>()
  mutableDependents.forEach((value, key) => dependents.set(key, Object.freeze(value)))

  return {
    entries: Object.freeze(entries),
    byName,
    order: Object.freeze(order),
    graph: {
      dependencies,
      dependents,
      order: Object.freeze(order.map((entry) => entry.definition.name)),
    },
  }
}

export function buildParameterDependencyGraph(definitions: readonly ParameterDefinition[]): ParameterDependencyGraph {
  return prepareParameters(definitions).graph
}

function evaluateExpression(
  node: ParameterExpressionNode,
  owner: PreparedParameter,
  preparedByName: ReadonlyMap<string, PreparedParameter>,
  canonicalValues: ReadonlyMap<string, number>,
): number {
  if (node.kind === 'number') return node.value
  if (node.kind === 'reference') {
    const referenced = preparedByName.get(normalizeName(node.name))!
    const ownerUnit = UNIT_INFO[owner.definition.unit]
    const referencedUnit = UNIT_INFO[referenced.definition.unit]
    if (ownerUnit.dimension !== referencedUnit.dimension) {
      throw new ParameterExpressionError(
        'UNIT_MISMATCH',
        `Parameter "${owner.definition.name}" (${ownerUnit.dimension}) cannot reference "${referenced.definition.name}" (${referencedUnit.dimension}).`,
        {
          parameterId: owner.definition.id,
          parameterName: owner.definition.name,
          referenceName: referenced.definition.name,
        },
      )
    }
    return convertCanonicalParameterValue(canonicalValues.get(referenced.normalizedName)!, owner.definition.unit)
  }
  if (node.kind === 'unary') {
    const value = evaluateExpression(node.operand, owner, preparedByName, canonicalValues)
    return node.operator === '-' ? -value : value
  }

  const left = evaluateExpression(node.left, owner, preparedByName, canonicalValues)
  const right = evaluateExpression(node.right, owner, preparedByName, canonicalValues)
  switch (node.operator) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      if (right === 0) {
        throw new ParameterExpressionError('DIVISION_BY_ZERO', `Parameter "${owner.definition.name}" divides by zero.`, {
          parameterId: owner.definition.id,
          parameterName: owner.definition.name,
        })
      }
      return left / right
  }
}

export function evaluateParameters(definitions: readonly ParameterDefinition[]): ParameterEvaluationResult {
  const prepared = prepareParameters(definitions)
  const canonicalValues = new Map<string, number>()
  const evaluatedByName = new Map<string, EvaluatedParameter>()

  for (const entry of prepared.order) {
    const displayValue = entry.ast
      ? evaluateExpression(entry.ast, entry, prepared.byName, canonicalValues)
      : entry.definition.value
    const canonicalValue = displayValue * UNIT_INFO[entry.definition.unit].scaleToCanonical
    if (!Number.isFinite(displayValue) || !Number.isFinite(canonicalValue)) {
      throw new ParameterExpressionError(
        'NON_FINITE_RESULT',
        `Parameter "${entry.definition.name}" produced a non-finite result.`,
        { parameterId: entry.definition.id, parameterName: entry.definition.name },
      )
    }
    canonicalValues.set(entry.normalizedName, canonicalValue)
    const unitInfo = UNIT_INFO[entry.definition.unit]
    evaluatedByName.set(entry.normalizedName, {
      ...entry.definition,
      value: displayValue,
      canonicalValue,
      canonicalUnit: unitInfo.canonicalUnit,
      dimension: unitInfo.dimension,
      dependencies: Object.freeze(entry.dependencyKeys.map((key) => prepared.byName.get(key)!.definition.name)),
    })
  }

  const parameters = Object.freeze(prepared.entries.map((entry) => evaluatedByName.get(entry.normalizedName)!))
  const values = Object.create(null) as Record<string, number>
  parameters.forEach((parameter) => {
    values[parameter.name] = parameter.canonicalValue
  })
  Object.freeze(values)

  return {
    parameters,
    graph: prepared.graph,
    values,
    get(name: string): EvaluatedParameter | undefined {
      return evaluatedByName.get(normalizeName(name))
    },
  }
}
