import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  terminated = false
  messages: { id: number }[] = []
  constructor() { TestWorker.instances.push(this) }
  postMessage(message: { id: number }) { this.messages.push(message) }
  terminate() { this.terminated = true }
  finish(triangleCount: number) {
    this.onmessage?.({ data: { id: this.messages.at(-1)!.id, ok: true, positions: new Float32Array(), indices: new Uint32Array(), volume: triangleCount, triangleCount } } as MessageEvent)
  }
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('isolated model evaluation', () => {
  it('evaluates independently of editor work and releases its worker after completion', async () => {
    const { geometryClient } = await import('./client')
    const { evaluateSnapshot } = await import('./evaluateSnapshot')
    const editorJob = geometryClient.evaluate(createDocument())
    const snapshotJob = evaluateSnapshot(createDocument())
    TestWorker.instances[1]!.finish(24)
    expect((await snapshotJob).triangleCount).toBe(24)
    expect(TestWorker.instances[1]!.terminated).toBe(true)
    expect(TestWorker.instances[0]!.terminated).toBe(false)
    TestWorker.instances[0]!.finish(12)
    expect((await editorJob).triangleCount).toBe(12)
  })

  it('cancels a snapshot immediately and releases its worker', async () => {
    const { evaluateSnapshot } = await import('./evaluateSnapshot')
    const controller = new AbortController()
    const job = evaluateSnapshot(createDocument(), controller.signal)
    const rejected = expect(job).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(TestWorker.instances.at(-1)!.terminated).toBe(true)
  })

  it('does not start evaluation for an already-cancelled request', async () => {
    const { evaluateSnapshot } = await import('./evaluateSnapshot')
    const workerCount = TestWorker.instances.length
    await expect(evaluateSnapshot(createDocument(), AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
    expect(TestWorker.instances).toHaveLength(workerCount)
  })

  it('rejects an unresponsive evaluation and releases its worker', async () => {
    const { evaluateSnapshot } = await import('./evaluateSnapshot')
    const job = evaluateSnapshot(createDocument())
    const rejected = expect(job).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(60_000)
    await rejected
    expect(TestWorker.instances.at(-1)!.terminated).toBe(true)
  })
})
