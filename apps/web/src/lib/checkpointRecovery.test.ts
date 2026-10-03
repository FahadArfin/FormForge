import { describe, expect, it } from 'vitest'
import { createDocument, type ModelDocument } from '@formforge/model'
import { restoreCheckpointSafely } from './checkpointRecovery'
import type { ProjectVersion } from './db'

function fixture() {
  const current = createDocument()
  current.name = 'Work after checkpoint'
  current.revision = 8
  const version: ProjectVersion = { id: 'checkpoint', projectId: current.id, document: { ...structuredClone(current), name: 'Earlier version', revision: 3 }, label: 'First draft', createdAt: current.createdAt }
  let active = current
  const stored: ModelDocument[] = []
  return { current, version, stored, getActive: () => active, apply: (value: ModelDocument) => { active = value }, saveRecovery: async (value: ModelDocument) => { stored.push(structuredClone(value)) } }
}

describe('checkpoint restoration', () => {
  it('preserves current edits durably before replacing them with the checkpoint', async () => {
    const test = fixture()
    await restoreCheckpointSafely(test.version, test.getActive, test.saveRecovery, test.apply)
    expect(test.stored[0]?.name).toBe('Work after checkpoint')
    expect(test.getActive().name).toBe('Earlier version')
    expect(test.getActive().id).toBe(test.current.id)
    expect(test.getActive().revision).toBe(9)
    expect(test.version.document.revision).toBe(3)
  })

  it('keeps the current document intact when saving its recovery checkpoint fails', async () => {
    const test = fixture()
    await expect(restoreCheckpointSafely(test.version, test.getActive, async () => { throw new Error('Storage full') }, test.apply)).rejects.toThrow('Storage full')
    expect(test.getActive()).toBe(test.current)
  })

  it('does not replace newer edits made while the recovery write is pending', async () => {
    const test = fixture()
    let finish!: () => void
    const saving = new Promise<void>((resolve) => { finish = resolve })
    const restoration = restoreCheckpointSafely(test.version, test.getActive, async () => { await saving }, test.apply)
    const newer = { ...test.current, name: 'Typed during save', revision: 9 }
    test.apply(newer)
    finish()
    await expect(restoration).rejects.toThrow('changed')
    expect(test.getActive()).toBe(newer)
  })

  it('cannot apply another project’s checkpoint or save a misleading recovery entry', async () => {
    const test = fixture()
    test.version.projectId = 'another-project'
    await expect(restoreCheckpointSafely(test.version, test.getActive, test.saveRecovery, test.apply)).rejects.toThrow('different project')
    expect(test.stored).toHaveLength(0)
    expect(test.getActive()).toBe(test.current)
  })
})
