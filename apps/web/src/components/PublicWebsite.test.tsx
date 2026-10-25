// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,expect,it} from 'vitest'
import {PublicWebsite} from './PublicWebsite'
import {TemplatePage} from './TemplatePage'
import {templateCatalog} from '@/lib/templateCatalog'
beforeEach(()=>{localStorage.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})})
it('offers three clear home destinations and genuine editable Community starters',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(<PublicWebsite/>))
 expect([...host.querySelectorAll('.home-destinations a')].map(a=>a.getAttribute('href'))).toEqual(['#community','#studio','#projects'])
 const previews=[...host.querySelectorAll<HTMLAnchorElement>('.home-design')]
 expect(previews).toHaveLength(3)
 for(const preview of previews){
  const template=templateCatalog.find(item=>preview.hash===`#community?model=starter-${item.id}`)
  expect(template).toBeDefined();expect(preview.textContent).toContain(template!.name)
  expect(preview.querySelector('img')?.getAttribute('src')).toBe(`/templates/${template!.id}.svg`)
 }
 expect(host.textContent).toContain('Editable starters by PrintLab')
 expect(host.querySelector('h1')?.textContent).toBe('What will you make today?')
 expect(host.querySelector('.public-workflow,.public-storage,.public-library,.public-hero-model')).toBeNull()
 await act(async()=>root.unmount());host.remove()
})
it('preserves searchable templates, uniquely named actions and the interactive demo off Home',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(<PublicWebsite templatesOnly/>))
 expect(host.querySelector('.home-destinations')).toBeNull()
 const actions=host.querySelectorAll('.template-open');expect(actions.length).toBeGreaterThan(1)
 expect(new Set([...actions].map(a=>a.getAttribute('aria-label'))).size).toBe(actions.length)
 expect(host.querySelector('input[type="search"]')).not.toBeNull()
 expect([...host.querySelectorAll('button')].some(button=>button.textContent?.includes('Try the interactive demo'))).toBe(true)
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
