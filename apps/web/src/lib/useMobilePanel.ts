import { useEffect, useRef, useState } from 'react'

/** Give the responsive drawer modal keyboard behavior without changing the desktop panels. */
export function useMobilePanel(panel: 'tools' | 'inspector' | 'assistant' | null, close: () => void, contentKey?: string) {
  const closeRef = useRef(close); closeRef.current = close
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width: 980px)').matches)
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 980px)')
    const update=()=>setCompact(media.matches)
    media.addEventListener('change',update);update()
    return()=>media.removeEventListener('change',update)
  },[])
  useEffect(() => {
    if (!panel || !compact) return
    const drawer = document.querySelector<HTMLElement>(panel === 'tools' ? '.toolbox' : panel === 'assistant' ? '.engineering-assistant' : '.inspector')
    if (!drawer) return
    const previous = document.activeElement as HTMLElement | null
    const background = [...document.querySelectorAll<HTMLElement>(`.app-navigation, .studio-header, .engineering-modebar, .workflow-guide, .skip-link, .statusbar, .viewport-wrap, ${panel === 'tools' ? '.inspector, .engineering-assistant' : panel === 'assistant' ? '.toolbox, .inspector' : '.toolbox, .engineering-assistant'}`)]
    const inert = background.map(element => element.inert)
    background.forEach(element => { element.inert = true })
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true')
    const controls = () => [...drawer.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex="0"]')]
      .filter(element => !element.matches(':disabled') && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0)
    controls()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current() }
      if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items.at(-1)
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      background.forEach((element, index) => { element.inert = inert[index]! })
      drawer.removeAttribute('role'); drawer.removeAttribute('aria-modal')
      if (previous?.isConnected && !previous.closest('[inert], [hidden]')) previous.focus()
    }
  }, [panel, contentKey, compact])
}
