import { describe, expect, it } from 'vitest'
import { createDocument, createNode, parseModelDocument } from '@formforge/model'
import { addParameterPresets, previewParameterPresets, serializeParameterPresets } from './parameterPresetExchange'

function fixture() {
  const node = createNode('box'); node.parameterBindings = { width: 'Width' }
  return { ...createDocument(), nodes: [node], namedParameters: [
    { id: 'target-w', name: 'Width', expression: '', unit: 'mm' as const, value: 10 },
    { id: 'target-h', name: 'Height', expression: '', unit: 'mm' as const, value: 15 },
  ] }
}
function payload() { return { format: 'printlab-parameter-presets', version: 1, variants: [{ name: 'Large', parameters: [
  { name: 'Height', expression: 'Width * 2', unit: 'mm', value: 1 },
  { name: 'Width', expression: '', unit: 'mm', value: 30 },
] }] } }
const encoded = () => JSON.stringify(payload())

describe('portable parameter presets', () => {
  it('remaps by exact name and unit, preserves formulas and metadata, and persists fresh IDs', () => {
    const target = fixture(), review = previewParameterPresets(encoded(), target)
    const next = addParameterPresets(target, review)
    expect(next.parameterVariants![0]!.parameters).toEqual([
      { id: 'target-h', name: 'Height', expression: 'Width * 2', unit: 'mm', value: 1 },
      { id: 'target-w', name: 'Width', expression: '', unit: 'mm', value: 30 },
    ])
    expect(next.nodes).toBe(target.nodes); expect(next.namedParameters).toBe(target.namedParameters)
    expect(next.id).toBe(target.id); expect(next.revision).toBe(target.revision + 1)
    expect(parseModelDocument(next).parameterVariants).toEqual(next.parameterVariants)
    const exported = JSON.parse(serializeParameterPresets(next))
    expect(exported).toEqual(payload())
    expect(serializeParameterPresets(next)).not.toContain(target.id)
    const second = previewParameterPresets(serializeParameterPresets(next), fixture())
    expect(second.variants[0]!.id).not.toBe(review.variants[0]!.id)
  })
  it('exports saved values only and rejects export with no saved variants', () => {
    const target = fixture()
    expect(() => serializeParameterPresets(target)).toThrow(/saved/i)
    const next = addParameterPresets(target, previewParameterPresets(encoded(), target))
    next.namedParameters[0]!.value = 99
    expect(JSON.parse(serializeParameterPresets(next)).variants[0].parameters[1].value).toBe(30)
  })
  it.each(['missing', 'extra', 'case', 'unit'])('rejects %s target parameter mismatch', kind => {
    const input = payload()
    if (kind === 'missing') input.variants[0]!.parameters.pop()
    if (kind === 'extra') input.variants[0]!.parameters.push({ name: 'Extra', expression: '', unit: 'mm', value: 1 })
    if (kind === 'case') input.variants[0]!.parameters[1]!.name = 'width'
    if (kind === 'unit') input.variants[0]!.parameters[1]!.unit = 'cm'
    expect(() => previewParameterPresets(JSON.stringify(input), fixture())).toThrow(/parameter|unit/i)
  })
  it.each(['cycle', 'unknown', 'script', 'zero', 'negative dimension', 'angle'])('rejects unsafe %s formulas or dimensions', kind => {
    const input = payload(), parameters = input.variants[0]!.parameters
    if (kind === 'cycle') parameters[1]!.expression = 'Height'
    if (kind === 'unknown') parameters[1]!.expression = 'Absent + 1'
    if (kind === 'script') parameters[1]!.expression = 'globalThis.alert(1)'
    if (kind === 'zero') parameters[1]!.expression = '1 / 0'
    if (kind === 'negative dimension') parameters[1]!.expression = '-1'
    const target = fixture()
    if (kind === 'angle') { parameters[0]!.unit = 'deg'; target.namedParameters[1]!.unit = 'deg' as 'mm' }
    expect(() => previewParameterPresets(JSON.stringify(input), target)).toThrow()
  })
  it('rejects duplicate preset and parameter names and existing conflicts atomically', () => {
    const target = fixture(), input = payload()
    input.variants.push({ ...input.variants[0]!, name: 'large' })
    expect(() => previewParameterPresets(JSON.stringify(input), target)).toThrow(/duplicate/i)
    input.variants.pop(); input.variants[0]!.parameters[1]!.name = 'Height'
    expect(() => previewParameterPresets(JSON.stringify(input), target)).toThrow(/duplicate/i)
    const next = addParameterPresets(target, previewParameterPresets(encoded(), target))
    expect(() => previewParameterPresets(encoded(), next)).toThrow(/already|exists|conflict/i)
    expect(target.parameterVariants).toBeUndefined()
  })
  it.each(['root', 'variant', 'parameter', 'prototype', 'version', 'nonfinite'])('rejects malformed %s fields', kind => {
    const input: any = payload()
    if (kind === 'root') input.nodes = []
    if (kind === 'variant') input.variants[0].id = 'source-id'
    if (kind === 'parameter') input.variants[0].parameters[0].code = 'alert(1)'
    if (kind === 'prototype') Object.defineProperty(input.variants[0], '__proto__', { value: {}, enumerable: true })
    if (kind === 'version') input.version = 2
    if (kind === 'nonfinite') input.variants[0].parameters[0].value = Infinity
    expect(() => previewParameterPresets(JSON.stringify(input), fixture())).toThrow()
  })
  it('enforces byte, variant and parameter bounds and rejects stale reviews', () => {
    const target = fixture(), input = payload()
    expect(() => previewParameterPresets(' '.repeat(1024 * 1024 + 1), target)).toThrow(/1 MiB/i)
    input.variants = Array.from({ length: 25 }, (_, i) => ({ ...input.variants[0]!, name: `Preset ${i}` }))
    expect(() => previewParameterPresets(JSON.stringify(input), target)).toThrow(/24/)
    input.variants = [payload().variants[0]!]
    input.variants[0]!.parameters = Array.from({ length: 257 }, (_, i) => ({ name: `P${i}`, expression: '', unit: 'mm', value: 1 }))
    expect(() => previewParameterPresets(JSON.stringify(input), target)).toThrow(/256/)
    const review = previewParameterPresets(encoded(), target)
    expect(() => addParameterPresets({ ...target, name: 'Changed' }, review)).toThrow(/changed|review/i)
  })
})

it('rejects multibyte files over the byte limit, existing capacity overflow and malformed JSON', () => {
  const target = fixture()
  expect(() => previewParameterPresets('é'.repeat(600000), target)).toThrow(/1 MiB/)
  expect(() => previewParameterPresets('{', target)).toThrow(/JSON/)
  const full = { ...target, parameterVariants: Array.from({ length: 24 }, (_, i) => ({ id: `v${i}`, name: `Existing ${i}`, parameters: target.namedParameters })) }
  expect(() => previewParameterPresets(encoded(), full)).toThrow(/24/)
})

it('accepts 24 presets of 256 parameters at the supported boundary', () => {
  const target = { ...createDocument(), namedParameters: Array.from({ length: 256 }, (_, i) => ({ id: `target-${i}`, name: `P${i}`, unit: 'mm' as const, expression: '', value: 1 })) }
  const parameters = target.namedParameters.map(({ name, unit, expression, value }) => ({ name, unit, expression, value }))
  const content = JSON.stringify({ format: 'printlab-parameter-presets', version: 1, variants: Array.from({ length: 24 }, (_, i) => ({ name: `Preset ${i}`, parameters })) })
  const next = addParameterPresets(target, previewParameterPresets(content, target))
  expect(next.parameterVariants).toHaveLength(24)
  expect(next.parameterVariants![23]!.parameters).toHaveLength(256)
})

it.each(['formula', 'saved value', 'unit conversion', 'position', 'scale', 'scaled extent'])('rejects unsafe bound %s before preview', kind => {
  const target = fixture(), input = payload(), width = input.variants[0]!.parameters[1]!
  if (kind === 'formula') width.expression = '1e100'
  if (kind === 'saved value') width.value = 1e100
  if (kind === 'unit conversion') { width.value = 1e6; width.unit = 'm'; target.namedParameters[0]!.unit = 'm' as 'mm' }
  if (kind === 'position') { target.nodes[0]!.parameterBindings = { positionX: 'Width' }; width.expression = '1e100' }
  if (kind === 'scale') target.nodes[0]!.transform.scale.x = 1e100
  if (kind === 'scaled extent') { width.value = 1e6; target.nodes[0]!.transform.scale.x = 100 }
  expect(() => previewParameterPresets(JSON.stringify(input), target)).toThrow(/range|limit|10 km/)
  expect(target.parameterVariants).toBeUndefined()
})

it('allows very large unused parameters and safe scaled bindings without clipping values', () => {
  const target = fixture(), input = payload()
  input.variants[0]!.parameters[0]!.expression = '1e100'
  target.nodes[0]!.transform.scale.x = 2
  const review = previewParameterPresets(JSON.stringify(input), target)
  expect(review.variants[0]!.parameters[0]!.expression).toBe('1e100')
  expect(review.variants[0]!.parameters[1]!.value).toBe(30)
})
