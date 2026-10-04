import type {ProfilePoint} from '@formforge/model'
export type SketchPick={kind:'point'|'edge';index:number}

export function SketchCanvas({points,sampledPoints,selection=[],onSelect,conflictPoints=[],conflictEdges=[],disabled=false,mode='both'}:{points:readonly ProfilePoint[];sampledPoints?:readonly ProfilePoint[];selection?:readonly SketchPick[];onSelect:(pick:SketchPick)=>void;conflictPoints?:readonly number[];conflictEdges?:readonly number[];disabled?:boolean;mode?:'both'|'point'|'edge'}) {
 if(!points.length)return null
 const all=[...points,...(sampledPoints??[])],xs=all.map(p=>p.x),ys=all.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
 const scale=Math.min(256/Math.max(maxX-minX,1),170/Math.max(maxY-minY,1)),cx=(minX+maxX)/2,cy=(minY+maxY)/2
 const pos=(p:ProfilePoint)=>({x:160+(p.x-cx)*scale,y:115-(p.y-cy)*scale})
 const path=(sampledPoints?.length?sampledPoints:points).map(p=>{const q=pos(p);return `${q.x},${q.y}`}).join(' ')
 const active=(kind:SketchPick['kind'],index:number)=>selection.some(p=>p.kind===kind&&p.index===index)
 const pick=(target:EventTarget|null,kind:SketchPick['kind'],index:number)=>{if(!disabled&&!(target instanceof Element&&target.closest('fieldset:disabled')))onSelect({kind,index})}
 const key=(event:React.KeyboardEvent,kind:SketchPick['kind'],index:number)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();pick(event.target,kind,index)}}
 return <div className="sketch-canvas"><svg viewBox="0 0 320 230" aria-label="Select sketch points and edges" role="group">
  <polygon points={path} className="sketch-outline"/>
  {points.length<=128&&points.map((p,index)=>{const a=pos(p),b=pos(points[(index+1)%points.length]!),selected=active('edge',index);return mode!=='point'&&<g key={`e${index}`} role="button" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-pressed={selected} aria-label={`Edge ${index+1}, ${Math.hypot(p.x-points[(index+1)%points.length]!.x,p.y-points[(index+1)%points.length]!.y).toFixed(2)} mm${conflictEdges.includes(index)?', conflicting rule':''}`} onClick={e=>pick(e.target,'edge',index)} onKeyDown={e=>key(e,'edge',index)} className={`sketch-edge ${selected?'selected':''} ${conflictEdges.includes(index)?'conflict':''}`}><line className="sketch-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y}/><line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/><text x={(a.x+b.x)/2} y={(a.y+b.y)/2-7}>E{index+1}</text></g>})}
  {points.length<=128&&mode!=='edge'&&points.map((p,index)=>{const q=pos(p);return <g key={`p${index}`} role="button" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-pressed={active('point',index)} aria-label={`Point ${index+1}, X ${p.x.toFixed(2)}, Y ${p.y.toFixed(2)} mm${conflictPoints.includes(index)?', conflicting rule':''}`} onClick={e=>pick(e.target,'point',index)} onKeyDown={e=>key(e,'point',index)} className={`sketch-point ${active('point',index)?'selected':''} ${conflictPoints.includes(index)?'conflict':''}`}><circle className="sketch-hit" cx={q.x} cy={q.y} r="15"/><circle cx={q.x} cy={q.y} r="7"/><text x={q.x+10} y={q.y-9}>P{index+1}</text></g>})}
 </svg><p className="workflow-caption">{points.length>128?'Use the numbered control point fields for this detailed outline.':'Select a point or edge. Keyboard: Tab to a handle, then Enter. Coordinates and lengths are in mm.'}</p></div>
}
