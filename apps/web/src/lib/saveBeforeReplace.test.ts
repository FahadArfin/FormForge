import { describe, expect, it, vi } from 'vitest'
import { saveBeforeReplace } from './saveBeforeReplace'

describe('saving before replacing a project', () => {
  it('keeps the open document when persistence fails', async () => {
    const current = {}; const replace = vi.fn()
    expect(await saveBeforeReplace(() => current, async () => false, replace)).toBe('failed')
    expect(replace).not.toHaveBeenCalled()
  })
  it('does not overwrite edits or another project opened during the save', async () => {
    let current = {}; const replace = vi.fn()
    expect(await saveBeforeReplace(() => current, async () => { current = {}; return true }, replace)).toBe('changed')
    expect(replace).not.toHaveBeenCalled()
  })
  it('continues only after a successful save of the current document', async () => {
    const current = {}; const replace = vi.fn()
    expect(await saveBeforeReplace(() => current, async () => true, replace)).toBe('continued')
    expect(replace).toHaveBeenCalledOnce()
  })
  it('does not apply an older import if a newer file was chosen during saving', async () => {
    const current = {}; let importGeneration = 1; const replace = vi.fn()
    const result = await saveBeforeReplace(() => current, async () => { importGeneration = 2; return true }, replace, () => importGeneration === 1)
    expect(result).toBe('changed')
    expect(replace).not.toHaveBeenCalled()
  })
})
