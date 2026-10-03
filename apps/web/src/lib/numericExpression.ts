type Quantity = { value: number; dimension: boolean }
const units: Record<string, { factor: number; kind: 'length' | 'angle' }> = {
  mm: { factor: 1, kind: 'length' }, cm: { factor: 10, kind: 'length' }, m: { factor: 1000, kind: 'length' }, in: { factor: 25.4, kind: 'length' },
  deg: { factor: 1, kind: 'angle' }, '°': { factor: 1, kind: 'angle' }, rad: { factor: 180 / Math.PI, kind: 'angle' },
}

/** A small arithmetic grammar, never JavaScript evaluation. Lengths resolve to mm, angles to degrees. */
export function parseNumericExpression(source: string, suffix?: string): number {
  if (!source.trim() || source.length > 256) throw new Error('Enter a number or expression (up to 256 characters).')
  const kind = suffix === 'mm' ? 'length' : suffix === '°' ? 'angle' : null
  let index = 0
  const skip = () => { while (/\s/.test(source[index] ?? '') && index < source.length) index++ }
  const fail = (): never => { throw new Error('Use numbers, +, −, *, /, and parentheses.') }
  const finite = (value: number) => { if (!Number.isFinite(value)) throw new Error('The result must be finite; division by zero is not allowed.'); return value }
  const primary = (depth: number): Quantity => {
    if (depth > 24) throw new Error('This expression has too many nested operations.')
    skip()
    if (source[index] === '+' || source[index] === '-') {
      const sign = source[index++] === '-' ? -1 : 1
      const result = primary(depth + 1)
      return { ...result, value: sign * result.value }
    }
    let result: Quantity
    if (source[index] === '(') {
      index++; result = sum(depth + 1); skip()
      if (source[index++] !== ')') return fail()
    } else {
      // A numeric fraction directly followed by a unit is one quantity: 1/2 in.
      // This does not change unit binding for additions such as 2 + 1 in.
      const fraction = /^((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?=\s*(?:mm|cm|in|deg|rad|m|°))/i.exec(source.slice(index))
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(source.slice(index))
      if (!number) return fail()
      index += (fraction ?? number)[0].length
      result = { value: fraction ? finite(Number(fraction[1]) / Number(fraction[2])) : finite(Number(number[0])), dimension: false }
    }
    skip()
    const unitText = /^(mm|cm|in|deg|rad|m|°)/i.exec(source.slice(index))
    if (unitText) {
      const unit = units[unitText[0].toLowerCase()]!
      if (unit.kind !== kind || result.dimension) throw new Error('That unit is not valid here.')
      index += unitText[0].length
      result = { value: finite(result.value * unit.factor), dimension: true }
    }
    return result
  }
  const product = (depth: number): Quantity => {
    let left = primary(depth)
    skip()
    while (source[index] === '*' || source[index] === '/') {
      const operator = source[index++]
      const right = primary(depth)
      if ((operator === '*' && left.dimension && right.dimension) || (operator === '/' && !left.dimension && right.dimension)) throw new Error('Use a scalar to multiply or divide a dimension.')
      left = { value: finite(operator === '*' ? left.value * right.value : left.value / right.value), dimension: operator === '/' && right.dimension ? false : left.dimension || right.dimension }
      skip()
    }
    return left
  }
  const sum = (depth: number): Quantity => {
    let left = product(depth)
    skip()
    while (source[index] === '+' || source[index] === '-') {
      const operator = source[index++]
      const right = product(depth)
      // A bare additive term uses the field's canonical unit.
      left = { value: finite(left.value + (operator === '+' ? right.value : -right.value)), dimension: left.dimension || right.dimension }
      skip()
    }
    return left
  }
  const result = sum(0)
  skip()
  if (index !== source.length) return fail()
  return finite(result.value)
}
