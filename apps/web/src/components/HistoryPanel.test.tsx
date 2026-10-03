// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import type { ProjectVersion } from '@/lib/db'
import { HistoryPanel } from './HistoryPanel'

const boundary = vi.hoisted(() => ({ state: {} as Record<string, unknown>, listVersions: vi.fn() }))
vi.mock('@/lib/db', () => ({ listVersions: boundary.listVersions, saveVersion: vi.fn() }))
vi.mock('@/store/editor', () => ({ useEditor: Object.assign((selector: (state: Record<string, unknown>) => unknown) => selector(boundary.state), { getState: () => boundary.state }) }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  boundary.listVersions.mockReset()
  boundary.state = { document: createDocument(), importDocument: vi.fn(), setNotice: vi.fn() }
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('checkpoint list', () => {
  it('ignores an older project’s late response after the active project changes', async () => {
    let finishOld!: (versions: ProjectVersion[]) => void
    boundary.listVersions.mockImplementationOnce(() => new Promise<ProjectVersion[]>((resolve) => { finishOld = resolve }))
    await act(async () => root.render(<HistoryPanel />))
    const next = createDocument()
    boundary.state.document = next
    boundary.listVersions.mockResolvedValueOnce([{ id: 'new', projectId: next.id, document: next, label: 'Current project checkpoint', createdAt: next.createdAt }])
    await act(async () => root.render(<HistoryPanel />))
    await act(async () => finishOld([{ id: 'old', projectId: 'old', document: next, label: 'Wrong project checkpoint', createdAt: next.createdAt }]))
    expect(host.textContent).toContain('Current project checkpoint')
    expect(host.textContent).not.toContain('Wrong project checkpoint')
  })

  it('shows a recoverable storage error instead of claiming there are no checkpoints', async () => {
    boundary.listVersions.mockRejectedValueOnce(new Error('Storage unavailable'))
    await act(async () => root.render(<HistoryPanel />))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Storage unavailable')
    expect(host.textContent).not.toContain('No checkpoints yet')
    boundary.listVersions.mockResolvedValueOnce([])
    const retry = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Retry'))!
    await act(async () => retry.click())
    expect(host.textContent).toContain('No checkpoints yet')
  })
})
