import { describe, expect, it } from 'vitest'
import { createDocument, createNode, parseModelDocument } from '@formforge/model'
import { applyParameterVariant, captureParameterVariant, variantMatches } from './parameterVariants'

function fixture() {
  const node = createNode('box'); node.parameterBindings = { width: 'Width' }
  return { ...createDocument(), nodes: [node], namedParameters: [{ id: 'w', name: 'Width', expression: '', unit: 'mm' as const, value: 20 }] }
}
describe('saved parameter variants', () => {
  it('round trips through project parsing and restores a bound dimension', () => {
    const original = fixture()
    const variant = captureParameterVariant(original, 'Small')
    const saved = parseModelDocument({ ...original, parameterVariants: [variant] })
    expect(saved.parameterVariants).toHaveLength(1)
    const larger = { ...saved, namedParameters: saved.namedParameters.map(p => ({ ...p, value: 40 })) }
    expect(variantMatches(larger, variant)).toBe(false)
    const applied = applyParameterVariant(larger, variant)
    expect(applied.nodes[0]!.parameters.width).toBe(20)
    expect(variantMatches(applied, variant)).toBe(true)
    expect(larger.namedParameters[0]!.value).toBe(40)
  })
  it('accepts legacy projects and rejects incompatible or unsafe variants', () => {
    const original = fixture(); const variant = captureParameterVariant(original, 'Small')
    expect(parseModelDocument(original).parameterVariants ?? []).toEqual([])
    expect(() => captureParameterVariant(original, ' ')).toThrow()
    expect(() => captureParameterVariant({ ...original, namedParameters: [] }, 'Empty')).toThrow()
    expect(() => applyParameterVariant({ ...original, namedParameters: [] }, variant)).toThrow(/changed/i)
    expect(() => applyParameterVariant({ ...original, namedParameters: original.namedParameters.map(p => ({ ...p, name: 'Renamed' })) }, variant)).toThrow(/changed/i)
    expect(() => applyParameterVariant({ ...original, nodes: original.nodes.map(n => ({ ...n, locked: true })) }, variant)).toThrow(/unlock/i)
  })
  it('preserves expressions and rejects broken parameter dependencies', () => {
    const original = fixture()
    original.namedParameters[0]!.expression = '10 + 10'
    const variant = captureParameterVariant(original, 'Formula')
    expect(variant.parameters[0]!.expression).toBe('10 + 10')
    variant.parameters[0]!.expression = 'Unknown + 1'
    expect(() => applyParameterVariant(original, variant)).toThrow()
  })
})
