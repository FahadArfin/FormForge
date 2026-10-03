import { describe, expect, it } from 'vitest'
import { parseNumericExpression } from './numericExpression'

describe('bounded numeric expressions', () => {
  it('supports precedence, signed numbers, parentheses and scientific notation', () => {
    expect(parseNumericExpression('-(2 + 3) * 4 / 2')).toBe(-10)
    expect(parseNumericExpression('1e2 / 4')).toBe(25)
  })
  it('converts explicit length units to millimeters, including inch fractions', () => {
    expect(parseNumericExpression('1/2 in', 'mm')).toBe(12.7)
    expect(parseNumericExpression('(1 + 0.5) cm', 'mm')).toBe(15)
    expect(parseNumericExpression('1 in + 2 mm', 'mm')).toBeCloseTo(27.4)
    expect(parseNumericExpression('1 in / 2', 'mm')).toBeCloseTo(12.7)
    expect(parseNumericExpression('0.02 m', 'mm')).toBe(20)
    expect(parseNumericExpression('25.4 / 2', 'mm')).toBe(12.7)
    expect(parseNumericExpression('2 + 1 in', 'mm')).toBeCloseTo(27.4)
    expect(parseNumericExpression('10 + 5 cm', 'mm')).toBe(60)
    expect(parseNumericExpression('1/2 in + 1 mm', 'mm')).toBeCloseTo(13.7)
  })
  it('supports angles without accepting length in a scale or angle field', () => {
    expect(parseNumericExpression('3.141592653589793 rad', '°')).toBeCloseTo(180)
    expect(parseNumericExpression('90 deg', '°')).toBe(90)
    expect(() => parseNumericExpression('1 in')).toThrow()
    expect(() => parseNumericExpression('1 mm', '°')).toThrow()
    expect(() => parseNumericExpression('1 deg', 'mm')).toThrow()
    expect(() => parseNumericExpression('2 mm * 3 mm', 'mm')).toThrow()
  })
  it('rejects invalid, unbounded and executable input', () => {
    for (const text of ['', '1 / 0', '1e309', '1 +', '2 3', 'Math.random()', 'alert(1)', '2**3', '('.repeat(40) + '1' + ')'.repeat(40), '1'.repeat(257)]) {
      expect(() => parseNumericExpression(text, 'mm'), text).toThrow()
    }
  })
})
