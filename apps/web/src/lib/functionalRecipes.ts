import {createNode,vec3,type ModelNode} from '@formforge/model'
export type FunctionalRecipe='enclosure'|'bracket'|'adapter'|'snapfit'
export interface RecipeDimensions {width:number;depth:number;height:number;wall:number;clearance:number}
export function functionalRecipe(kind:FunctionalRecipe,p:RecipeDimensions):ModelNode[]{
 const {width:w,depth:d,height:h,wall:t,clearance:c}=p
 if(!Object.values(p).every(Number.isFinite)||w<10||d<10||h<5||Math.max(w,d,h)>300||t<0.6||t>10||c<0||c>2||Math.min(w,d,h)<=t*3)throw new Error('Use sizes 10–300 mm (height ≥5), wall 0.6–10 mm, clearance 0–2 mm, and at least three wall thicknesses across each size.')
 const nodes:ModelNode[]=[];let group=crypto.randomUUID()
 const box=(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,cut=false)=>{const n=createNode('box',cut?'cut':'add',vec3(x,y,z));n.name=name;n.parameters={...n.parameters,width:sx,depth:sy,height:sz};n.combined=true;n.groupId=group;nodes.push(n);return n}
 const cylinder=(name:string,x:number,y:number,z:number,r:number,length:number,cut=false)=>{const n=createNode('cylinder',cut?'cut':'add',vec3(x,y,z));n.name=name;n.parameters={...n.parameters,radius:r,height:length,segments:48};n.combined=true;n.groupId=group;nodes.push(n);return n}
 if(kind==='enclosure'){
  if(w<30||d<30||h<12||t>Math.min(w,d)/8)throw new Error('Enclosures need width/depth ≥30 mm, height ≥12 mm and room for mounting bosses.')
  box('Enclosure shell',0,0,h/2,w,d,h);box('Enclosure cavity',0,0,t+(h-t+2)/2,w-2*t,d-2*t,h-t+2,true)
  const r=Math.max(3,t*1.5);for(const x of [-1,1])for(const y of [-1,1]){const bx=x*(w/2-t-r*0.8),by=y*(d/2-t-r*0.8);cylinder('Mounting boss',bx,by,(h-3)/2,r,h-3);cylinder('Boss pilot hole',bx,by,h/2,Math.max(1,r-t),h+2,true)}
  group=crypto.randomUUID();const x=w+10;box('Enclosure lid',x,0,t/2,w,d,t);const lw=w-2*t-c,ld=d-2*t-c;if(Math.min(lw,ld)<=2*t)throw new Error('Clearance leaves no room for the lid lip.');box('Lid locating lip',x,0,t+1.5,lw,ld,3);box('Lid lip cavity',x,0,t+2,lw-2*t,ld-2*t,4,true)
 }else if(kind==='bracket'){
  const holeRadius=Math.max(1.5,t);if(w/4-holeRadius<1||d/2-holeRadius<1||h*0.35-holeRadius<1||h*0.65-holeRadius<t)throw new Error('Bracket holes need at least 1 mm of edge and web margin. Increase sizes or reduce wall thickness.')
  box('Bracket foot',0,0,t/2,w,d,t);box('Bracket upright',0,d/2-t/2,h/2,w,t,h)
  for(const x of [-w/4,w/4]){cylinder('Foot mounting hole',x,0,t/2,Math.max(1.5,t),t+2,true);const n=cylinder('Upright mounting hole',x,d/2-t/2,h*0.65,Math.max(1.5,t),t+2,true);n.transform.rotation.x=90}
 }else if(kind==='adapter'){
  const r1=w/2,r2=d/2,slope=(r2-r1)/h, radialWall=t*Math.sqrt(1+slope*slope)
  if(Math.min(r1-radialWall-slope,r2-radialWall+slope)<=0.5)throw new Error('Adapter bore is too narrow for that taper and wall.')
  const n=cylinder('Tapered adapter outer',0,0,h/2,r1,h);n.kind='cone';n.parameters.radiusTop=r2
  const bore=cylinder('Tapered adapter bore',0,0,h/2,r1-radialWall-slope,h+2,true);bore.kind='cone';bore.parameters.radiusTop=r2-radialWall+slope
 }else{
  const beam=Math.max(15,w*0.6),bw=Math.max(5,d*0.2),undercut=Math.min(1.5,t*0.6)
  box('Snap anchor',-beam/2,0,3,t*3,bw*2,6);box('Snap cantilever',0,0,t/2,beam,bw,t);box('Snap hook',beam/2-t/2,0,t+undercut/2,t,bw,undercut)
  group=crypto.randomUUID();const x=beam+15;box('Snap catch body',x,0,(t*3)/2,t*6,bw+4*t,t*3);box('Snap catch slot',x,0,(t+c)/2,t*6+2,bw+2*c,t+c,true);box('Snap catch relief',x+t,0,t*2,t*2,bw+2*c,t*2+2,true)
 }
 return nodes
}
