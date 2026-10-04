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
    const active = client.evaluate(createDocument()).catch(error => error)
    const worker = TestWorker.instances.at(-1)!
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
    const active = client.evaluate(createDocument()).catch(error => error)
    const worker = TestWorker.instances.at(-1)!
    const queued = client.evaluate(createDocument()).catch(error => error)
    worker.onerror?.({ message: 'Worker could not load', preventDefault() {} } as ErrorEvent)
    expect((await active).message).toContain('Worker could not load')
    expect((await queued).message).toContain('Worker could not load')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it('can retry after a worker failure without a late event from the old worker cancelling the retry', async () => {
    const { GeometryClient } = await import('./client')
    const client = new GeometryClient()
    const failure = client.evaluate(createDocument()).catch(error => error)
    const old = TestWorker.instances.at(-1)!
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

it('starts no worker until needed, cancels obsolete work and allows retry', async () => {
  const { GeometryClient } = await import('./client')
  const client = new GeometryClient()
  expect(TestWorker.instances).toHaveLength(0)
  const obsolete = client.evaluate(createDocument()).catch(error => error)
  const old = TestWorker.instances.at(-1)!
  const latest = client.evaluate(createDocument(), { replaceActive: true }).catch(error => error)
  expect((await obsolete).name).toBe('AbortError')
  expect(old.terminate).toHaveBeenCalledOnce()
  client.cancel()
  expect((await latest).name).toBe('AbortError')
  const retry = client.evaluate(createDocument()).catch(error => error)
  expect(TestWorker.instances).toHaveLength(3)
  client.dispose(); await retry
})

it('terminates timed-out builds and retries with a fresh worker', async () => {
  vi.useFakeTimers()
  try {
    const { GeometryClient } = await import('./client')
    const client = new GeometryClient({ timeoutMs: 100 })
    const timed = client.evaluate(createDocument()).catch(error => error)
    const old = TestWorker.instances.at(-1)!
    await vi.advanceTimersByTimeAsync(101)
    expect((await timed).message).toMatch(/timed out/i)
    expect(old.terminate).toHaveBeenCalledOnce()
    const retry = client.evaluate(createDocument()).catch(error => error)
    expect(TestWorker.instances.at(-1)).not.toBe(old)
    client.dispose(); await retry
  } finally { vi.useRealTimers() }
})

it('evicts cached meshes by byte budget instead of retaining large models', async () => {
  const { GeometryClient } = await import('./client')
  const client = new GeometryClient({ cacheBytes: 16 })
  const doc = createDocument()
  const first = client.evaluate(doc)
  const worker = TestWorker.instances.at(-1)!
  const id = worker.postMessage.mock.calls[0]![0].id
  worker.onmessage!({data:{id,ok:true,positions:new Float32Array(9),indices:new Uint32Array(3),triangleCount:1,volume:0}} as MessageEvent)
  await first
  const next = client.evaluate(doc).catch(error => error)
  expect(worker.postMessage).toHaveBeenCalledTimes(2)
  client.dispose(); await next
})
it('counts a repeated snapshot only once in the cache budget',async()=>{
 const {GeometryClient}=await import('./client'),client=new GeometryClient({cacheBytes:60}),doc=createDocument()
 const first=client.evaluate(doc),second=client.evaluate(doc),worker=TestWorker.instances.at(-1)!
 const respond=(call:number)=>worker.onmessage!({data:{id:worker.postMessage.mock.calls[call]![0].id,ok:true,positions:new Float32Array(9),indices:new Uint32Array(3),triangleCount:1,volume:0}} as MessageEvent)
 respond(0);await first;respond(1);await second;await client.evaluate(doc)
 expect(worker.postMessage).toHaveBeenCalledTimes(2);client.dispose()
})
