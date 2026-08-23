import { describe, expect, it } from 'vitest'
import {
  ParameterExpressionError,
  buildParameterDependencyGraph,
  convertCanonicalParameterValue,
  convertParameterValueToCanonical,
  evaluateParameters,
  getParameterDependencies,
  parseParameterExpression,
  type ParameterDefinition,
} from './parameters.js'

const parameter = (overrides: Partial<ParameterDefinition> & Pick<ParameterDefinition, 'id' | 'name'>): ParameterDefinition => ({
  expression: '',
  unit: 'mm',
  value: 0,
  ...overrides,
})

function expectParameterError(action: () => unknown, code: ParameterExpressionError['code'], message: RegExp): ParameterExpressionError {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(ParameterExpressionError)
    const parameterError = error as ParameterExpressionError
    expect(parameterError.code).toBe(code)
    expect(parameterError.message).toMatch(message)
    return parameterError
  }
  throw new Error(`Expected ${code} to be thrown`)
}

describe('parameter expression parsing', () => {
  it('parses precedence, parentheses, unary operators and scientific notation without eval', () => {
    const result = evaluateParameters([
      parameter({ id: 'result', name: 'result', expression: '-(2 + 3) * +4 + 1e2 / 5' }),
    ])

    expect(result.get('RESULT')?.value).toBe(0)
    expect(parseParameterExpression('1 + 2 * 3')).toMatchObject({ kind: 'binary', operator: '+' })
  })

  it('supports Unicode identifiers and bracketed references for friendly names', () => {
    const definitions = [
      parameter({ id: 'wall', name: 'Wall Thickness', value: 1.2 }),
      parameter({ id: 'scale', name: 'échelle', value: 2 }),
      parameter({ id: 'total', name: 'Total', expression: '[Wall Thickness] * échelle' }),
    ]

    expect(evaluateParameters(definitions).get('total')?.canonicalValue).toBeCloseTo(2.4)
    expect(getParameterDependencies('[Wall Thickness] + wall_2 + [Wall Thickness]')).toEqual(['Wall Thickness', 'wall_2'])
  })

  it.each([
    ['', /empty/],
    ['1 +', /expected a number/],
    ['(1 + 2', /expected \)/],
    ['1 2', /expected an operator/],
    ['2e+', /exponent requires/],
    ['[Wall', /missing closing/],
    ['1 $ 2', /unexpected character/],
  ])('rejects malformed expression %j with a useful position', (expression, message) => {
    const error = expectParameterError(() => parseParameterExpression(expression, 'Width'), 'SYNTAX_ERROR', message)
    expect(error.parameterName).toBe('Width')
    expect(error.position).toBeTypeOf('number')
  })
})

describe('parameter unit conversion', () => {
  it('normalizes all supported length units to millimetres', () => {
    expect(convertParameterValueToCanonical(1, 'mm')).toBe(1)
    expect(convertParameterValueToCanonical(1, 'cm')).toBe(10)
    expect(convertParameterValueToCanonical(1, 'm')).toBe(1_000)
    expect(convertParameterValueToCanonical(1, 'in')).toBe(25.4)
    expect(convertCanonicalParameterValue(25.4, 'in')).toBeCloseTo(1)
  })

  it('normalizes angles to radians and converts them back for display', () => {
    expect(convertParameterValueToCanonical(180, 'deg')).toBeCloseTo(Math.PI)
    expect(convertParameterValueToCanonical(Math.PI, 'rad')).toBeCloseTo(Math.PI)
    expect(convertCanonicalParameterValue(Math.PI / 2, 'deg')).toBeCloseTo(90)
  })

  it('evaluates references in the destination parameter unit', () => {
    const result = evaluateParameters([
      parameter({ id: 'width', name: 'Width', unit: 'cm', value: 2 }),
      parameter({ id: 'half-mm', name: 'Half mm', unit: 'mm', expression: 'Width / 2' }),
      parameter({ id: 'half-in', name: 'Half in', unit: 'in', expression: 'Width / 2' }),
      parameter({ id: 'turn', name: 'Turn', unit: 'deg', value: 180 }),
      parameter({ id: 'half-turn', name: 'Half turn', unit: 'rad', expression: 'Turn / 2' }),
    ])

    expect(result.get('Width')).toMatchObject({ value: 2, canonicalValue: 20, canonicalUnit: 'mm' })
    expect(result.get('Half mm')).toMatchObject({ value: 10, canonicalValue: 10 })
    expect(result.get('Half in')?.canonicalValue).toBeCloseTo(10)
    expect(result.get('Half turn')?.value).toBeCloseTo(Math.PI / 2)
    expect(result.get('Half turn')?.canonicalValue).toBeCloseTo(Math.PI / 2)
  })

  it('rejects references across length and angle dimensions', () => {
    const error = expectParameterError(
      () =>
        evaluateParameters([
          parameter({ id: 'width', name: 'Width', unit: 'mm', value: 20 }),
          parameter({ id: 'angle', name: 'Angle', unit: 'deg', expression: 'Width / 2' }),
        ]),
      'UNIT_MISMATCH',
      /cannot reference.*Width/i,
    )
    expect(error.referenceName).toBe('Width')
  })
})

describe('parameter dependency evaluation', () => {
  it('builds a dependency graph and evaluates in topological rather than declaration order', () => {
    const definitions = [
      parameter({ id: 'outer', name: 'Outer', expression: 'Inner + Wall * 2' }),
      parameter({ id: 'wall', name: 'Wall', value: 1.6 }),
      parameter({ id: 'inner', name: 'Inner', expression: 'Nozzle * 3' }),
      parameter({ id: 'nozzle', name: 'Nozzle', value: 0.4 }),
    ]
    const graph = buildParameterDependencyGraph(definitions)
    const result = evaluateParameters(definitions)

    expect(graph.order.indexOf('Nozzle')).toBeLessThan(graph.order.indexOf('Inner'))
    expect(graph.order.indexOf('Wall')).toBeLessThan(graph.order.indexOf('Outer'))
    expect(graph.dependencies.get('Outer')).toEqual(['Inner', 'Wall'])
    expect(graph.dependents.get('Nozzle')).toEqual(['Inner'])
    expect(result.get('outer')?.value).toBeCloseTo(4.4)
    expect(result.values.Outer).toBeCloseTo(4.4)
    expect(result.parameters.map((item) => item.name)).toEqual(definitions.map((item) => item.name))
  })

  it('uses the literal value when expression is blank and does not mutate definitions', () => {
    const definitions = [parameter({ id: 'width', name: ' Width ', unit: 'cm', value: 3, expression: '   ' })]
    const snapshot = structuredClone(definitions)
    const result = evaluateParameters(definitions)

    expect(result.get('width')).toMatchObject({ name: 'Width', value: 3, canonicalValue: 30 })
    expect(definitions).toEqual(snapshot)
  })

  it('resolves names case-insensitively and reports duplicate names case-insensitively', () => {
    expect(
      evaluateParameters([
        parameter({ id: 'width', name: 'Width', value: 8 }),
        parameter({ id: 'half', name: 'Half', expression: 'width / 2' }),
      ]).get('HALF')?.value,
    ).toBe(4)

    expectParameterError(
      () =>
        evaluateParameters([
          parameter({ id: 'one', name: 'Width', value: 8 }),
          parameter({ id: 'two', name: ' width ', value: 9 }),
        ]),
      'DUPLICATE_NAME',
      /case-insensitive/i,
    )
  })

  it('rejects duplicate ids and unknown references with owner details', () => {
    expectParameterError(
      () =>
        evaluateParameters([
          parameter({ id: 'same', name: 'Width', value: 8 }),
          parameter({ id: 'SAME', name: 'Height', value: 9 }),
        ]),
      'DUPLICATE_ID',
      /Duplicate parameter id/i,
    )

    const unknown = expectParameterError(
      () => evaluateParameters([parameter({ id: 'outer', name: 'Outer', expression: 'Missing + 2' })]),
      'UNKNOWN_REFERENCE',
      /Outer.*Missing/,
    )
    expect(unknown.parameterName).toBe('Outer')
    expect(unknown.referenceName).toBe('Missing')
  })

  it('detects direct and multi-parameter cycles and reports the full path', () => {
    const self = expectParameterError(
      () => evaluateParameters([parameter({ id: 'a', name: 'A', expression: 'A + 1' })]),
      'CYCLE',
      /A -> A/,
    )
    expect(self.cycle).toEqual(['A', 'A'])

    const cycle = expectParameterError(
      () =>
        evaluateParameters([
          parameter({ id: 'a', name: 'A', expression: 'B + 1' }),
          parameter({ id: 'b', name: 'B', expression: 'C + 1' }),
          parameter({ id: 'c', name: 'C', expression: 'A + 1' }),
        ]),
      'CYCLE',
      /A -> B -> C -> A/,
    )
    expect(cycle.cycle).toEqual(['A', 'B', 'C', 'A'])
  })

  it('rejects division by zero, including zero produced by another expression', () => {
    const error = expectParameterError(
      () =>
        evaluateParameters([
          parameter({ id: 'zero', name: 'Zero', expression: '3 - 3' }),
          parameter({ id: 'bad', name: 'Bad', expression: '10 / Zero' }),
        ]),
      'DIVISION_BY_ZERO',
      /Bad.*zero/i,
    )
    expect(error.parameterName).toBe('Bad')
  })

  it('rejects empty definitions, non-finite values and non-finite arithmetic', () => {
    expectParameterError(
      () => evaluateParameters([parameter({ id: '', name: 'Width', value: 1 })]),
      'INVALID_DEFINITION',
      /non-empty id/,
    )
    expectParameterError(
      () => evaluateParameters([parameter({ id: 'width', name: 'Width', value: Number.NaN })]),
      'INVALID_DEFINITION',
      /non-finite fallback/,
    )
    expectParameterError(
      () => evaluateParameters([parameter({ id: 'huge', name: 'Huge', expression: '1e308 * 1e308' })]),
      'NON_FINITE_RESULT',
      /non-finite result/,
    )
  })
})
