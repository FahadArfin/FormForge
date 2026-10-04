// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { PrintPanel } from './PrintPanel'
import { FitCalibrationPanel } from './FitCalibrationPanel'
vi.mock('./OverhangReview',()=>({OverhangReview:()=>null}))
it('keeps one material and calibration panel across revisions and preserves a threshold draft',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),doc=createDocument()
 useEditor.setState({document:doc,mesh:null,meshDocument:null,geometryStatus:'idle'})
 await act(async()=>root.render(<PrintPanel/>))
 for(let revision=1;revision<=3;revision++)await act(async()=>useEditor.setState({document:{...doc,revision}}))
 expect([...host.querySelectorAll('h3')].filter(h=>h.textContent==='Material and cost')).toHaveLength(1)
 expect([...host.querySelectorAll('h3')].filter(h=>h.textContent==='Fit calibration')).toHaveLength(1)
 const field=host.querySelector<HTMLInputElement>('[aria-label="Overhang threshold, degrees from bed (degrees)"]')!
 await act(async()=>{field.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'60');field.dispatchEvent(new Event('input',{bubbles:true}))})
 expect(useEditor.getState().document.printer.overhangAngle).toBe(45)
 expect(field.value).toBe('60')
 await act(async()=>root.unmount());host.remove()
})
it('disables calibration writes when existing saved results are unreadable',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const key='formforge.fit-calibrations.v1',raw='[{"id":"preserve-this","fit":null}]'
 localStorage.setItem(key,raw)
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(<FitCalibrationPanel/>))
 const save=[...host.querySelectorAll('button')].find(b=>b.textContent==='Save measured result')!
 expect(save.disabled).toBe(true)
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 expect(localStorage.getItem(key)).toBe(raw)
 expect(host.textContent).toContain('They have not been replaced')
 await act(async()=>root.unmount());host.remove();localStorage.removeItem(key)
})
