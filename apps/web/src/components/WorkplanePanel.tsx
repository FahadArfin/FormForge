import { useState } from 'react'
import { useEditor } from '@/store/editor'
import { axisWorkplane } from '@/lib/workplanes'
import { NumberInput } from './NumberInput'

export function WorkplanePanel() {
  const doc=useEditor(s=>s.document), tool=useEditor(s=>s.tool)
  const [axis,setAxis]=useState<'xy'|'xz'|'yz'>('xy'), [offset,setOffset]=useState(0)
  const busy=tool==='place'||tool==='draw-profile'
  return <section className="workflow-card"><h3>Workplane</h3><p>New shapes and drawn profiles follow this plane. Picked planes stay fixed when the original face changes.</p>
    <p><strong>Active: {doc.workplane?.name ?? 'XY'}</strong></p>
    <label className="cad-select-label">Plane<select value={axis} onChange={e=>setAxis(e.target.value as typeof axis)}><option value="xy">XY · top</option><option value="xz">XZ · front</option><option value="yz">YZ · side</option></select></label>
    <NumberInput label="Plane offset" suffix="mm" value={offset} onChange={setOffset}/>
    <div className="workflow-actions"><button className="workflow-action" disabled={busy} onClick={()=>{ const s=useEditor.getState(); s.dispatch({type:'replace-document',document:{...s.document,workplane:axisWorkplane(axis,offset),revision:s.document.revision+1,updatedAt:new Date().toISOString()}}); s.setNotice('Workplane updated. New shapes and sketches follow it.') }}>Set workplane</button><button className="workflow-action secondary" disabled={busy} onClick={()=>useEditor.getState().setTool('pick-workplane')}>Pick a face</button></div>
    <button className="workflow-text-action" onClick={()=>window.dispatchEvent(new CustomEvent('formforge:view',{detail:{view:'workplane'}}))}>Look straight at plane</button>
    {tool==='pick-workplane'&&<p role="status">Click a flat face in the canvas. Esc cancels.</p>}
    {busy&&<p>Finish the current placement or sketch before changing its plane.</p>}
  </section>
}
