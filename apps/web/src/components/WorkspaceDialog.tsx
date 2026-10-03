import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function WorkspaceDialog({ title, description, onClose, children, className = '' }: { title: string; description?: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className={`workspace-dialog ${className}`} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-inner">
      <header className="dialog-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="studio-icon" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></header>
      {children}
    </div>
  </dialog>
}
