import {useEffect,useMemo,useState} from 'react'
import type {MeshPayload} from '@formforge/model'
import {createStarter} from '@/lib/starters'
import {evaluateSnapshot} from '@/geometry/evaluateSnapshot'
import {meshBounds} from '@/lib/importReview'
import {MeshPreview} from './MeshPreview'
import {WorkspaceDialog} from './WorkspaceDialog'
export function PublicDemo({onClose}:{onClose:()=>void}){
 const [diameter,setDiameter]=useState(30),[mesh,setMesh]=useState<MeshPayload|null>(null),[error,setError]=useState('')
 const doc=useMemo(()=>{const d=createStarter('washer');d.nodes[0]!.parameters.radius=diameter/2;return d},[diameter])
 useEffect(()=>{const c=new AbortController();setMesh(null);setError('');void evaluateSnapshot(doc,c.signal).then(m=>{if(!c.signal.aborted)setMesh(m)}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[doc])
 const size=mesh?meshBounds(mesh).size:null
 return <WorkspaceDialog title="Try a real editable part" description="Change a dimension and inspect the rebuilt solid. This demonstration does not change your projects." onClose={onClose}>
  <ol className="demo-steps"><li>Choose a template</li><li>Set its dimensions</li><li>Inspect the solid</li><li>Open the studio to export</li></ol>
  <label className="cad-select-label">Outer diameter<select value={diameter} onChange={e=>setDiameter(Number(e.target.value))}>{[20,30,40,50].map(v=><option key={v} value={v}>{v} mm</option>)}</select></label>
  {error?<p role="alert">{error}</p>:mesh?<MeshPreview mesh={mesh} label="Live washer with an 8 mm bore"/>:<p role="status">Building your dimension change…</p>}
  {size&&<p role="status">{size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} mm · 8 mm bore</p>}
  <p>Studio templates begin at their example dimensions. You can change them using the same editable shapes.</p>
  <a className="public-primary" href="#studio?starter=washer" onClick={onClose}>Open washer template</a>
 </WorkspaceDialog>
}
