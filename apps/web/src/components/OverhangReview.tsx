import {useMemo} from 'react'
import {analyzeOverhangs} from '@/lib/overhangs'
import {MeshPreview} from './MeshPreview'
import type {MeshPayload} from '@formforge/model'
export function OverhangReview({mesh,threshold}:{mesh:MeshPayload;threshold:number}){
 const result=useMemo(()=>{try{return {data:analyzeOverhangs(mesh,threshold),error:''}}catch(e){return {data:null,error:(e as Error).message}}},[mesh,threshold])
 return <section className="overhang-review"><h3>Potential overhangs</h3>
  <MeshPreview mesh={mesh} warningIndices={result.data?.indices} label="Evaluated geometry with potential overhangs in orange"/>
  {result.error?<p role="alert">Overhang check unavailable: {result.error}</p>:<p role="status">{result.data!.faceCount.toLocaleString()} downward faces · {result.data!.area.toFixed(1)} mm² below {threshold}° from the bed.</p>}
  <p className="workflow-caption">Orange areas may need support or a different orientation. Bed-contact faces are excluded. Bridges, cooling, strength and local wall thickness still need slicer review.</p>
 </section>
}
