// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WorkspaceDialog } from './WorkspaceDialog'
it('associates its description and restores focus after closing', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  const trigger = document.createElement('button'), host = document.createElement('div')
  document.body.append(trigger, host); trigger.focus()
  const root = createRoot(host)
  await act(async () => root.render(<WorkspaceDialog title="Recovery copies" description="Open a separate copy." onClose={vi.fn()}><button data-initial-focus>Open copy</button></WorkspaceDialog>))
  const dialog = host.querySelector('dialog')!
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Recovery copies')
  expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('Open a separate copy.')
  expect(document.activeElement?.textContent).toBe('Open copy')
  await act(async () => root.unmount()); expect(document.activeElement).toBe(trigger)
  trigger.remove(); host.remove()
})
