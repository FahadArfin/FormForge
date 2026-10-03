import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument, type ModelDocument } from '@formforge/model'
import { createProjectPersistence, type ProjectSaveState } from './projectPersistence'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

afterEach(() => vi.useRealTimers())

describe('project persistence', () => {
  it('debounces edits without losing the previous project when the user switches projects', async () => {
    vi.useFakeTimers()
    const write = vi.fn(async (_document: ModelDocument) => undefined)
    const persistence = createProjectPersistence(write, vi.fn())
    const first = createDocument('First')
    const latest = { ...first, name: 'Renamed first', revision: 1 }
    const second = createDocument('Second')

    persistence.schedule(first)
    await vi.advanceTimersByTimeAsync(200)
    persistence.schedule(latest)
    persistence.schedule(second)
    await vi.advanceTimersByTimeAsync(500)

    expect(write.mock.calls.map(([document]) => document.name)).toEqual(['Renamed first', 'Second'])
    expect(write.mock.calls[0]![0]).not.toBe(latest)
  })

  it('serializes writes and leaves newer edits saving when an older write finishes', async () => {
    const firstWrite = deferred()
    const secondWrite = deferred()
    const write = vi.fn().mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise)
    const updates: { document: ModelDocument; state: ProjectSaveState }[] = []
    const persistence = createProjectPersistence(write, (document, state) => updates.push({ document, state }))
    const first = createDocument()
    const latest = { ...first, name: 'Latest changes', revision: 1 }

    const firstSave = persistence.saveNow(first)
    await Promise.resolve()
    const latestSave = persistence.saveNow(latest)
    expect(write).toHaveBeenCalledTimes(1)
    firstWrite.resolve()
    await firstSave
    await Promise.resolve()
    expect(updates.at(-1)?.state.saveStatus).toBe('saving')
    expect(write.mock.calls[1]![0].name).toBe('Latest changes')
    secondWrite.resolve()
    await latestSave
    expect(updates.at(-1)?.document).toBe(latest)
    expect(updates.at(-1)?.state).toMatchObject({ saveStatus: 'saved', saveError: null })
    expect(updates.at(-1)?.state.lastSavedAt).toEqual(expect.any(String))
  })

  it('reports autosave errors and permits a successful manual retry', async () => {
    vi.useFakeTimers()
    const write = vi.fn().mockRejectedValueOnce(new Error('Device storage is full')).mockResolvedValueOnce(undefined)
    const onState = vi.fn()
    const persistence = createProjectPersistence(write, onState)
    const document = createDocument()
    persistence.schedule(document)
    await vi.advanceTimersByTimeAsync(500)
    expect(onState).toHaveBeenLastCalledWith(document, { saveStatus: 'error', saveError: 'Device storage is full', lastSavedAt: null })

    await persistence.saveNow(document)
    expect(onState).toHaveBeenLastCalledWith(document, { saveStatus: 'saved', saveError: null, lastSavedAt: expect.any(String) })
  })

  it('ignores an obsolete failure while a newer snapshot is being saved', async () => {
    const oldWrite = deferred()
    const newWrite = deferred()
    const write = vi.fn().mockReturnValueOnce(oldWrite.promise).mockReturnValueOnce(newWrite.promise)
    const onState = vi.fn()
    const persistence = createProjectPersistence(write, onState)
    const document = createDocument()
    const oldSave = persistence.saveNow(document)
    const failedSave = expect(oldSave).rejects.toThrow('Old request failed')
    await Promise.resolve()
    const updated = { ...document, revision: 1 }
    const newSave = persistence.saveNow(updated)
    oldWrite.reject(new Error('Old request failed'))
    await failedSave
    expect(onState.mock.calls.some(([, state]) => state.saveStatus === 'error')).toBe(false)
    newWrite.resolve()
    await newSave
    expect(onState.mock.calls.at(-1)?.[1].saveStatus).toBe('saved')
  })

  it('manual save replaces the delayed write and rejects truthfully on failure', async () => {
    vi.useFakeTimers()
    const write = vi.fn().mockRejectedValue(new Error('Database unavailable'))
    const onState = vi.fn()
    const persistence = createProjectPersistence(write, onState)
    const document = createDocument()
    persistence.schedule(document)
    await expect(persistence.saveNow(document)).rejects.toThrow('Database unavailable')
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).toHaveBeenCalledTimes(1)
    expect(onState.mock.calls.at(-1)?.[1].saveStatus).toBe('error')
  })

  it('cancels an unsent autosave before deleting a project', async () => {
    vi.useFakeTimers()
    const document = createDocument()
    const saved = new Map([[document.id, document]])
    const write = vi.fn(async (snapshot: ModelDocument) => { saved.set(snapshot.id, snapshot) })
    const persistence = createProjectPersistence(write, vi.fn())
    persistence.schedule(document)
    await persistence.remove(document.id, async () => { saved.delete(document.id) })
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).not.toHaveBeenCalled()
    expect(saved.has(document.id)).toBe(false)
  })

  it('drains in-flight and queued saves before erasing, without showing a stale saved status', async () => {
    const pendingWrite = deferred()
    const document = createDocument()
    const saved = new Map<string, ModelDocument>()
    const events: string[] = []
    const onState = vi.fn()
    const write = vi.fn(async (snapshot: ModelDocument) => {
      await pendingWrite.promise
      saved.set(snapshot.id, snapshot)
      events.push('write')
    })
    const persistence = createProjectPersistence(write, onState)
    const firstSave = persistence.saveNow(document)
    await Promise.resolve()
    const latestSave = persistence.saveNow({ ...document, revision: document.revision + 1 })
    const removal = persistence.remove(document.id, async () => { saved.delete(document.id); events.push('delete') })
    expect(events).toEqual([])
    pendingWrite.resolve()
    await Promise.all([firstSave, latestSave, removal])
    expect(events).toEqual(['write', 'write', 'delete'])
    expect(saved.has(document.id)).toBe(false)
    expect(onState.mock.calls.some(([, state]) => state.saveStatus === 'saved')).toBe(false)
  })

  it('blocks new writes while a project is being deleted', async () => {
    vi.useFakeTimers()
    const pendingDelete = deferred()
    const write = vi.fn(async (_document: ModelDocument) => undefined)
    const document = createDocument()
    const persistence = createProjectPersistence(write, vi.fn())
    const removal = persistence.remove(document.id, () => pendingDelete.promise)
    persistence.schedule(document)
    await expect(persistence.saveNow(document)).rejects.toThrow('being deleted')
    pendingDelete.resolve()
    await removal
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).not.toHaveBeenCalled()
  })
})
