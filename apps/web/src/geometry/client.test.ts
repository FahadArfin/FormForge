import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { TestWorker.instances.push(this) }
}
beforeEach(() => { vi.resetModules(); TestWorker.instances = []; vi.stubGlobal('Worker', TestWorker) })
afterEach(() => vi.unstubAllGlobals())

describe('isolated geometry client lifecycle', () => {
  it('cancels active and queued evaluations when disposed and refuses new work', async () => {
    const { GeometryClient } = await import('./client')
    const client = new GeometryClient()
    const worker = TestWorker.instances.at(-1)!
    const active = client.evaluate(createDocument()).catch(error => error)
    const queued = client.evaluate(createDocument()).catch(error => error)
    client.dispose()
    expect((await active).name).toBe('AbortError')
    expect((await queued).name).toBe('AbortError')
    expect(worker.terminate).toHaveBeenCalledOnce()
    await expect(client.evaluate(createDocument())).rejects.toThrow()
  })
  it('rejects pending evaluations when the worker fails instead of waiting forever', async () => {
    const { GeometryClient } = await import('./client')
    const client = new GeometryClient()
    const worker = TestWorker.instances.at(-1)!
    const active = client.evaluate(createDocument()).catch(error => error)
    const queued = client.evaluate(createDocument()).catch(error => error)
    worker.onerror?.({ message: 'Worker could not load', preventDefault() {} } as ErrorEvent)
    expect((await active).message).toContain('Worker could not load')
    expect((await queued).message).toContain('Worker could not load')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it('can retry after a worker failure without a late event from the old worker cancelling the retry', async () => {
    const { GeometryClient } = await import('./client')
    const client = new GeometryClient()
    const old = TestWorker.instances.at(-1)!
    const failure = client.evaluate(createDocument()).catch(error => error)
    const lateError = old.onerror!
    lateError({ message: 'Old worker failed', preventDefault() {} } as ErrorEvent)
    expect((await failure).message).toContain('Old worker failed')
    const retry = client.evaluate(createDocument()).catch(error => error)
    const fresh = TestWorker.instances.at(-1)!
    lateError({ message: 'Late stale failure', preventDefault() {} } as ErrorEvent)
    const id = fresh.postMessage.mock.calls[0]![0].id
    fresh.onmessage!({ data: { id, ok: true, positions: new Float32Array([1, 2, 3]), indices: new Uint32Array(), triangleCount: 0, volume: 0 } } as MessageEvent)
    expect((await retry).positions).toEqual(new Float32Array([1, 2, 3]))
    client.dispose()
  })
})
