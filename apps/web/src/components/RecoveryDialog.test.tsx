// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {createDocument} from '@formforge/model'
import {RecoveryDialog} from './RecoveryDialog'
vi.mock('@/lib/db',()=>({listAutomaticRecovery:vi.fn(async()=>[{id:'a',document:{...createDocument('Bracket'),revision:3},createdAt:'2026-10-12T00:00:00Z'},{id:'b',document:{...createDocument('Bracket'),revision:2},createdAt:'2026-10-11T00:00:00Z'}])}))
it('identifies recovery actions by project and revision',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true};HTMLDialogElement.prototype.close=function(){this.open=false}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(<RecoveryDialog onClose={vi.fn()} onOpen={vi.fn()}/>))
 const labels=[...host.querySelectorAll('.recovery-list button')].map(b=>b.getAttribute('aria-label'))
 expect(labels).toEqual(['Open separate copy of Bracket, revision 3','Download backup of Bracket, revision 3','Open separate copy of Bracket, revision 2','Download backup of Bracket, revision 2'])
 expect(host.querySelector('dialog')?.classList.contains('recovery-dialog')).toBe(true)
 await act(async()=>root.unmount());host.remove()
})
