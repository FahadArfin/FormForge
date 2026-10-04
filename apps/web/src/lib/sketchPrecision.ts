import {sampleClosedProfile,solveSketchConstraints,type SketchConstraint,type ProfilePoint} from '@formforge/model'

export function snapSketchPoint(point:ProfilePoint,previous:ProfilePoint|undefined,increment:number|null,axisLock:boolean) {
 const next={...point},labels:string[]=[]
 if(increment&&Number.isFinite(increment)&&increment>0){next.x=Math.round(next.x/increment)*increment;next.y=Math.round(next.y/increment)*increment;labels.push(`grid ${increment} mm`)}
 if(previous&&axisLock){if(Math.abs(point.x-previous.x)>=Math.abs(point.y-previous.y)){next.y=previous.y;labels.unshift('Horizontal')}else{next.x=previous.x;labels.unshift('Vertical')}}
 return {point:next,label:labels.join(' · ')||'Free placement'}
}

export function constraintReferences(rule:SketchConstraint,count:number) {
 const refs=[rule.a,rule.b].filter(i=>Number.isInteger(i)&&i>=0&&i<count)
 const edges=['equal','parallel','perpendicular','angle'].includes(rule.type)?refs:[]
 return {points:[...new Set(edges.length?edges.flatMap(i=>[i,(i+1)%count]):refs)],edges}
}

export function resizeSketchEdge(points:readonly ProfilePoint[],edge:number,length:number,constraints:readonly SketchConstraint[]) {
 if(!Number.isInteger(edge)||edge<0||edge>=points.length||!Number.isFinite(length)||length<=0||length>100000)throw new Error('Enter an edge length above 0 and at most 100,000 mm.')
 const end=(edge+1)%points.length
 const next=constraints.filter(c=>!(c.type==='distance'&&((c.a===edge&&c.b===end)||(c.b===edge&&c.a===end))))
 next.push({type:'distance',a:edge,b:end,value:length})
 const solved=solveSketchConstraints(points,next,{anchorIndex:edge})
 if(!solved.diagnostics.converged||solved.diagnostics.invalidConstraints.length)throw new Error('That length conflicts with existing rules. Change or remove the conflicting rule first.')
 sampleClosedProfile(solved.points,{curveMode:'polyline',cornerRadius:0,offset:0,tension:0.5,resolution:8})
 return {points:solved.points,constraints:next}
}
