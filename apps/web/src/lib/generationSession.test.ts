import { describe, expect, it } from 'vitest'
import { createGenerationSession } from './generationSession'

describe('generation destination safety', () => {
  it('allows a result only while its original project and session remain active', () => {
    const session = createGenerationSession('project-a')
    expect(session.isCurrent('project-a')).toBe(true)
    session.cancel()
    expect(session.signal.aborted).toBe(true)
    expect(session.isCurrent('project-a')).toBe(false)
  })

  it('cannot revive a pending result by switching away and then back to the original project', () => {
    const session = createGenerationSession('project-a')
    expect(session.isCurrent('project-b')).toBe(false)
    expect(session.isCurrent('project-a')).toBe(false)
    expect(session.signal.aborted).toBe(true)
  })

  it('keeps a cancelled request invalid when a new request starts in the same project', () => {
    const previous = createGenerationSession('project-a')
    previous.cancel()
    const next = createGenerationSession('project-a')
    expect(previous.isCurrent('project-a')).toBe(false)
    expect(next.isCurrent('project-a')).toBe(true)
  })
})
