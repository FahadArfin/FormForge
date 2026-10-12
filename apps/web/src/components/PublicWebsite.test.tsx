// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,expect,it} from 'vitest'
import {PublicWebsite} from './PublicWebsite'
import {TemplatePage} from './TemplatePage'
import {templateCatalog} from '@/lib/templateCatalog'
beforeEach(()=>{localStorage.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})})
it('opens Engineering AI and names every repeated template action',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(<PublicWebsite/>))
 expect(host.querySelector('a[href="#studio?workspace=engineering"]')?.textContent).toContain('Design with AI')
 const actions=host.querySelectorAll('.template-open');expect(actions.length).toBeGreaterThan(1)
 expect(new Set([...actions].map(a=>a.getAttribute('aria-label'))).size).toBe(actions.length)
 await act(async()=>root.unmount());host.remove()
})
it('starts template detail in persisted dark appearance and keeps public surfaces synchronized',async()=>{
 localStorage.setItem('formforge-theme','dark')
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(<><TemplatePage template={templateCatalog[0]!}/><PublicWebsite templatesOnly/></>))
 expect([...host.querySelectorAll('.public-site')].every(el=>el.getAttribute('data-appearance')==='dark')).toBe(true)
 expect(host.querySelector('.public-brand .brand-mark')).not.toBeNull()
 const skip=host.querySelector<HTMLAnchorElement>('.skip-link')!
 await act(async()=>skip.click());expect(document.activeElement?.id).toBe('public-main')
 await act(async()=>host.querySelector<HTMLButtonElement>('.appearance-toggle')!.click())
 expect(localStorage.getItem('formforge-theme')).toBe('light')
 expect([...host.querySelectorAll('.public-site')].every(el=>el.getAttribute('data-appearance')==='light')).toBe(true)
 await act(async()=>root.unmount());host.remove()
})
