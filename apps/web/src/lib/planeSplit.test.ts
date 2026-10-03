import { describe, expect, it, vi } from 'vitest'
import { createDocument, vec3, type MeshPayload } from '@formforge/model'
import { createSplitDocument, splitDocumentSafely } from './planeSplit'

vi.mock('../geometry/evaluateSnapshot', () => ({ evaluateSnapshot: vi.fn() }))

const tetrahedron: MeshPayload = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]), triangleCount: 4, volume: 1 / 6 }
const parts = { positive: tetrahedron, negative: tetrahedron }
const options = { axis: 'z' as const, offset: 10, keep: 'both' as const }

describe('planar split replacement', () => {
  it('creates independent capped mesh nodes in world coordinates and preserves project identity', () => {
    const source = createDocument()
    source.sculptStrokes = [{ id: 'stroke', nodeId: source.nodes[0]!.id, mode: 'add', radius: 1, strength: 1, center: vec3(), createdAt: source.createdAt }]
    const replacement = createSplitDocument(source, parts, options)
    expect(replacement.id).toBe(source.id)
    expect(replacement.nodes).toHaveLength(2)
    expect(new Set(replacement.nodes.map(node => node.id)).size).toBe(2)
    expect(replacement.nodes.every(node => node.kind === 'mesh' && node.boolean === 'add' && !node.combined)).toBe(true)
    expect(replacement.nodes[0]!.transform).toEqual({ position: vec3(), rotation: vec3(), scale: vec3(1, 1, 1) })
    expect(replacement.nodes[0]!.mesh?.positions).toEqual(Array.from(tetrahedron.positions))
    expect(replacement.sculptStrokes).toEqual([])
    expect(source.sculptStrokes).toHaveLength(1)
    expect(replacement.revision).toBe(source.revision + 1)
  })
  it.each(['positive', 'negative'] as const)('keeps only the requested %s half', keep => {
    const replacement = createSplitDocument(createDocument(), parts, { ...options, keep })
    expect(replacement.nodes).toHaveLength(1)
    expect(replacement.nodes[0]!.name.toLowerCase()).toContain(keep)
  })
  it('refuses any locked node before starting evaluation', async () => {
    const current = createDocument(); current.nodes[0]!.locked = true
    const compute = vi.fn(async () => parts); const apply = vi.fn()
    await expect(splitDocumentSafely(() => current, options, apply, { compute })).rejects.toThrow(/unlock/i)
    expect(compute).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })
  it('never replaces edits made while evaluation or splitting is pending', async () => {
    let current = createDocument(); const apply = vi.fn()
    await expect(splitDocumentSafely(() => current, options, apply, { compute: async () => { current = { ...current, name: 'Newer work' }; return parts } })).rejects.toThrow(/changed/i)
    expect(apply).not.toHaveBeenCalled()
    expect(current.name).toBe('Newer work')
  })
  it('rejects results after changing the section plane or cancelling the operation', async () => {
    const current = createDocument(); const apply = vi.fn(); let samePlane = true
    await expect(splitDocumentSafely(() => current, options, apply, { isCurrent: () => samePlane, compute: async () => { samePlane = false; return parts } })).rejects.toThrow(/changed/i)
    const controller = new AbortController()
    await expect(splitDocumentSafely(() => current, options, apply, { signal: controller.signal, compute: async () => { controller.abort(); return parts } })).rejects.toMatchObject({ name: 'AbortError' })
    expect(apply).not.toHaveBeenCalled()
  })
  it('applies one complete replacement only after successful evaluation', async () => {
    const current = createDocument(); const apply = vi.fn()
    await splitDocumentSafely(() => current, options, apply, { compute: async () => parts })
    expect(apply).toHaveBeenCalledOnce()
    expect(apply.mock.calls[0]![0].nodes).toHaveLength(2)
  })
  it('accepts nonempty evaluated intersection geometry rather than inferring emptiness from source roles', () => {
    const source = createDocument(); source.nodes[0]!.boolean = 'intersect'
    expect(createSplitDocument(source, parts, options).nodes).toHaveLength(2)
  })
})
