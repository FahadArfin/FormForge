import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function WorkspaceDialog({ title, description, onClose, children, className = '' }: { title: string; description?: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingId = useId(), descriptionId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    return () => { dialog.close(); if (previous?.isConnected && !previous.closest('[hidden], [inert]')) previous.focus() }
  }, [])
  return <dialog ref={ref} className={`workspace-dialog ${className}`} aria-labelledby={headingId} aria-describedby={description ? descriptionId : undefined} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-inner">
      <header className="dialog-heading"><div><h2 id={headingId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button className="studio-icon" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></header>
      {children}
    </div>
  </dialog>
}
