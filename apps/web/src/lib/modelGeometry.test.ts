import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createNode, vec3, type ModelDocument } from '@formforge/model'
import { nodeWorldBounds } from './modelGeometry'

afterEach(() => vi.unstubAllGlobals())

describe('preview and evaluated capsule bounds', () => {
  it('places an oversized-radius capsule on the plate in both preview and the export mesh', async () => {
    const node = createNode('capsule', 'add', vec3())
    node.parameters = { ...node.parameters, radius: 12, height: 18 }
    node.transform.position.z -= nodeWorldBounds(node).min.z
    const document = { ...createDocument(), nodes: [node] }
    const worker = { postMessage: vi.fn(), onmessage: null as null | ((event: { data: { id: number; document: ModelDocument } }) => Promise<void>) }
    vi.stubGlobal('self', worker)
    await import('../geometry/geometry.worker')
    await worker.onmessage!({ data: { id: 1, document } })
    const result = worker.postMessage.mock.calls[0]![0] as { ok: boolean; error?: string; positions: Float32Array }
    expect(result.ok, result.error).toBe(true)
    const z = Array.from(result.positions).filter((_, index) => index % 3 === 2)
    expect(Math.min(...z)).toBeCloseTo(0, 5)
    expect(Math.max(...z)).toBeCloseTo(18, 5)
    expect(nodeWorldBounds(node).min.z).toBeCloseTo(0, 5)
    expect(nodeWorldBounds(node).max.z).toBeCloseTo(18, 5)
  })
})
