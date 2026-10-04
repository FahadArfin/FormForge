import { describe, expect, it } from 'vitest'
import { createDocument, vec3 } from './defaults.js'
import { parseModelDocument } from './schema.js'

const annotation = { id: 'circle', label: 'Bore diameter', kind: 'diameter', points: [vec3(5, 0, 0), vec3(0, 5, 0), vec3(-5, 0, 0)], geometryKey: 'sample', visible: true }

describe('saved dimension annotations', () => {
  it('roundtrips three-point diameter annotations in the existing document version', () => {
    const saved = parseModelDocument({ ...createDocument(), annotations: [annotation] })
    expect(saved.annotations).toEqual([annotation])
    expect(saved.schemaVersion).toBe(1)
  })

  it('preserves old distance/angle annotations and documents without annotations', () => {
    expect(parseModelDocument(createDocument()).annotations).toBeUndefined()
    const annotations = [
      { ...annotation, kind: 'distance', points: [vec3(), vec3(10, 0, 0)] },
      { ...annotation, id: 'angle', kind: 'angle', points: [vec3(1, 0, 0), vec3(), vec3(0, 1, 0)] },
    ]
    expect(parseModelDocument({ ...createDocument(), annotations }).annotations).toEqual(annotations)
  })

  it('refuses invalid circle picks in imported projects', () => {
    const badPoints = [
      [vec3(), vec3(1, 0, 0)],
      [vec3(), vec3(), vec3(1, 1, 0)],
      [vec3(), vec3(1, 0, 0), vec3(2, 0, 0)],
      [vec3(), vec3(1, 0, 0), vec3(2, 1e-8, 0)],
      [vec3(NaN, 0, 0), vec3(1, 1, 0), vec3(2, 0, 0)],
      [vec3(1e300, 0, 0), vec3(1, 1, 0), vec3(2, 0, 0)],
      [vec3(-1e6, 0, 0), vec3(0, 100, 0), vec3(1e6, 0, 0)],
    ]
    for (const points of badPoints) expect(() => parseModelDocument({ ...createDocument(), annotations: [{ ...annotation, points }] })).toThrow()
  })
})
