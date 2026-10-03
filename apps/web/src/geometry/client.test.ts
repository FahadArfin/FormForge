import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, type ModelDocument } from '@formforge/model'

class TestWorker {
  static latest: TestWorker
  onmessage: ((event: MessageEvent) => void) | null = null
  messages: { id: number; document: ModelDocument }[] = []

  constructor() { TestWorker.latest = this }
  postMessage(message: { id: number; document: ModelDocument }) { this.messages.push(message) }
  finish(triangleCount: number) {
    this.onmessage?.({ data: { id: this.messages.at(-1)!.id, ok: true, positions: new Float32Array(), indices: new Uint32Array(), volume: triangleCount, triangleCount } } as MessageEvent)
  }
}

beforeEach(() => { vi.resetModules(); vi.stubGlobal('Worker', TestWorker) })
afterEach(() => vi.unstubAllGlobals())

describe('geometry snapshot cache', () => {
  it('reuses evaluated geometry for the identical immutable snapshot', async () => {
    const { geometryClient } = await import('./client')
    const document = createDocument()
    const evaluated = geometryClient.evaluate(document)
    TestWorker.latest.finish(12)
    const mesh = await evaluated
    expect(await geometryClient.evaluate(document)).toBe(mesh)
    expect(TestWorker.latest.messages).toHaveLength(1)
  })

  it('evaluates imported geometry independently when id, revision, and edit time are unchanged', async () => {
    const { geometryClient } = await import('./client')
    const document = createDocument()
    const first = geometryClient.evaluate(document)
    TestWorker.latest.finish(12)
    await first
    const imported = structuredClone(document)
    imported.nodes[0]!.parameters.width = 64
    expect([imported.id, imported.revision, imported.updatedAt]).toEqual([document.id, document.revision, document.updatedAt])

    const second = geometryClient.evaluate(imported)
    expect(TestWorker.latest.messages).toHaveLength(2)
    expect(TestWorker.latest.messages[1]!.document.nodes[0]!.parameters.width).toBe(64)
    TestWorker.latest.finish(24)
    expect((await second).triangleCount).toBe(24)
  })
})
