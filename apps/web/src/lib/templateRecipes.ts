import {createDocument,createNode,evaluateParameters,mapParameterReferences,parseParameterExpression,type ModelDocument,type ModelNode,type ParameterBindingTarget} from '@formforge/model'
import {resolveDocumentParameterBindings} from './modelParameters'
import {templateCatalog,type StarterId} from './templateCatalog'
type Field={key:string;label:string;value:number;min:number;max:number;step?:number}
const f=(key:string,label:string,value:number,min=1,max=300,step=.1):Field=>({key,label,value,min,max,step})
export const templateFields:Record<StarterId,Field[]>={
 washer:[f('outer','Outer diameter',30,3),f('bore','Bore diameter',8,1),f('thickness','Thickness',5,.6,100)],
 tray:[f('width','Outside width',80,10),f('depth','Outside depth',60,10),f('height','Outside height',15,5),f('wall','Wall thickness',2,.6,10),f('floor','Floor thickness',2,.6,10)],
 'cable-guide':[f('width','Plate width',60,10),f('depth','Plate depth',20,10),f('thickness','Plate thickness',4,1,20),f('diameter','Opening diameter',6,1,60),f('spacing','Opening spacing',20,2,100)],
 enclosure:[f('width','Outside width',80,30),f('depth','Outside depth',50,30),f('height','Outside height',25,12),f('wall','Wall and floor',2,.6,5),f('clearance','Lid clearance (diametral)',.2,0,2,.05)],
 bracket:[f('width','Bracket width',80,10),f('depth','Foot depth',50,10),f('height','Upright height',25,8),f('wall','Plate thickness',2,1,10),f('diameter','Mounting hole diameter',4,1,20)],
 adapter:[f('inlet','Lower outside diameter',80,10),f('outlet','Upper outside diameter',50,10),f('height','Adapter height',25,5),f('wall','Radial wall thickness',2,.6,10)],
 snapfit:[f('length','Beam length',48,20,120),f('width','Beam width',10,5,30),f('wall','Beam thickness',2,.6,4),f('clearance','Catch clearance',.2,0,2,.05),f('hook','Hook height',1.2,.3,3)],
 coupon:[f('diameter','Nominal pin diameter',4,1,6),f('start','First diametral clearance',.1,0,1,.05),f('step','Clearance increment',.1,.05,.4,.05),f('thickness','Strip thickness',3,2,10),f('pin_height','Pin height',8,3,30)],
}
export function templateDefaults(id:StarterId){return Object.fromEntries(templateFields[id].map(x=>[x.key,x.value]))}
export function templateValues(doc:ModelDocument):Record<string,number>{
 const id=doc.template?.id as StarterId;if(!templateFields[id])return {}
 const evaluated=evaluateParameters(doc.namedParameters)
 return Object.fromEntries(templateFields[id].map(f=>[f.key,evaluated.get(doc.namedParameters.find(p=>p.id===`recipe:${f.key}`)?.name??f.key)?.canonicalValue??f.value]))
}
function useRecipeNames(source:ModelDocument,target:ModelDocument):ModelDocument{
 // Recipe IDs remain stable when the user gives a reusable dimension a clearer name.
 const names=source.namedParameters.map(p=>({from:p.name,to:target.namedParameters.find(t=>t.id===p.id)?.name??p.name}))
 const rewrite=(expression:string)=>mapParameterReferences(expression,Object.fromEntries(names.map(n=>[n.from,n.to])))
 return {...source,namedParameters:source.namedParameters.map(p=>({...p,name:names.find(n=>n.from===p.name)!.to})),nodes:source.nodes.map(n=>({...n,parameterBindings:Object.fromEntries(Object.entries(n.parameterBindings??{}).map(([key,value])=>[key,rewrite(value!)]))}))}
}
export function validateTemplate(id:StarterId,v:Record<string,number>){
 for(const field of templateFields[id])if(!Number.isFinite(v[field.key])||v[field.key]!<field.min||v[field.key]!>field.max)throw new Error(`${field.label} must be ${field.min}–${field.max} mm.`)
 const n=(key:string)=>v[key]!
 if(id==='washer'&&n('outer')-n('bore')<1.2)throw new Error('Leave at least 0.6 mm of material around the bore.')
 if(['tray','enclosure'].includes(id)&&(Math.min(n('width'),n('depth'))<=n('wall')*4+2||n('height')<=(v.floor??n('wall'))+1))throw new Error('Increase the outside size or reduce the wall and floor thickness.')
 if(id==='enclosure'&&(Math.min(n('width'),n('depth'))<n('wall')*8+8||n('height')<n('wall')+5))throw new Error('Leave room for the mounting bosses and lid lip.')
 if(id==='cable-guide'&&(n('spacing')<n('diameter')+1||n('width')<2*n('spacing')+n('diameter')+2||n('depth')<n('diameter')+2))throw new Error('Leave at least 1 mm around each opening and between openings.')
 if(id==='bracket'&&(n('width')/4<n('diameter')/2+1||n('depth')/2<n('diameter')/2+n('wall')+1||n('height')*.35<n('diameter')/2+1||n('height')*.65<n('wall')+n('diameter')/2+1))throw new Error('Increase bracket dimensions or reduce hole diameter to keep edge and web margins.')
 if(id==='adapter'&&Math.min(n('inlet'),n('outlet'))<=2*n('wall')+2)throw new Error('The adapter wall leaves no usable bore.')
 if(id==='snapfit'&&n('clearance')>=n('hook'))throw new Error('Catch clearance must be smaller than the hook height.')
 if(id==='coupon'&&n('start')+4*n('step')>3)throw new Error('Final coupon clearance must be at most 3 mm.')
}
type Bindings=Partial<Record<ParameterBindingTarget,string>>
export function createTemplateDocument(id:StarterId,values=templateDefaults(id)):ModelDocument{
 validateTemplate(id,values)
 const doc=createDocument(),nodes:ModelNode[]=[];let group=crypto.randomUUID()
 const shape=(kind:ModelNode['kind'],name:string,cut:boolean,bindings:Bindings)=>{
  const node=createNode(kind,cut?'cut':'add');node.name=name;node.combined=true;node.groupId=group;node.parameterBindings=bindings;node.parameters.segments=64;nodes.push(node);return node
 }
 const box=(name:string,cut:boolean,w:string,d:string,h:string,x='0',y='0',z=`(${h})/2`)=>shape('box',name,cut,{width:w,depth:d,height:h,positionX:x,positionY:y,positionZ:z})
 const cylinder=(name:string,cut:boolean,diameter:string,h:string,x='0',y='0',z=`(${h})/2`)=>shape('cylinder',name,cut,{radius:`(${diameter})/2`,height:h,positionX:x,positionY:y,positionZ:z})
 if(id==='washer'){cylinder('Spacer outer',false,'outer','thickness');cylinder('Spacer bore',true,'bore','thickness+2','0','0','thickness/2')}
 if(id==='tray'){box('Tray outer',false,'width','depth','height');box('Tray cavity',true,'width-2*wall','depth-2*wall','height-floor+2','0','0','floor+(height-floor+2)/2')}
 if(id==='cable-guide'){box('Cable plate',false,'width','depth','thickness');for(const x of ['-spacing','0','spacing'])cylinder('Cable opening',true,'diameter','thickness+2',x,'0','thickness/2')}
 if(id==='enclosure'){
  box('Enclosure shell',false,'width','depth','height');box('Enclosure cavity',true,'width-2*wall','depth-2*wall','height-wall+2','0','0','wall+(height-wall+2)/2')
  for(const x of [-1,1])for(const y of [-1,1]){const px=`${x}*(width/2-wall-2.4)`,py=`${y}*(depth/2-wall-2.4)`;cylinder('Mounting boss',false,'6','height-3',px,py);cylinder('Boss pilot hole',true,'2','height+2',px,py,'height/2')}
  group=crypto.randomUUID();box('Enclosure lid',false,'width','depth','wall','width+10');box('Lid locating lip',false,'width-2*wall-clearance','depth-2*wall-clearance','3','width+10','0','wall+1.5');box('Lid lip cavity',true,'width-4*wall-clearance','depth-4*wall-clearance','4','width+10','0','wall+2')
 }
 if(id==='bracket'){
  box('Bracket foot',false,'width','depth','wall');box('Bracket upright',false,'width','wall','height','0','depth/2-wall/2')
  for(const x of ['-width/4','width/4']){cylinder('Foot mounting hole',true,'diameter','wall+2',x,'0','wall/2');const n=cylinder('Upright mounting hole',true,'diameter','wall+2',x,'depth/2-wall/2','height*.65');n.transform.rotation.x=90}
 }
 if(id==='adapter'){
  shape('cone','Tapered adapter outer',false,{radius:'inlet/2',radiusTop:'outlet/2',height:'height',positionZ:'height/2'})
  shape('cone','Tapered adapter bore',true,{radius:'inlet/2-wall-(outlet-inlet)/(2*height)',radiusTop:'outlet/2-wall+(outlet-inlet)/(2*height)',height:'height+2',positionZ:'height/2'})
  if(Math.min(values.inlet!/2-values.wall!-(values.outlet!-values.inlet!)/(2*values.height!),values.outlet!/2-values.wall!+(values.outlet!-values.inlet!)/(2*values.height!))<=0)throw new Error('The taper is too steep for this wall. Increase height or opening size.')
 }
 if(id==='snapfit'){
  box('Snap anchor',false,'wall*3','width*2','6','-length/2');box('Snap cantilever',false,'length','width','wall');box('Snap hook',false,'wall','width','hook','length/2-wall/2','0','wall+hook/2')
  group=crypto.randomUUID();box('Snap catch body',false,'wall*6','width+4*wall','wall*3','length+15');box('Snap catch slot',true,'wall*6+2','width+2*clearance','wall+clearance','length+15');box('Snap catch relief',true,'wall*2','width+2*clearance','wall*2+2','length+15+wall','0','wall*2')
 }
 if(id==='coupon'){
  const pitch='(diameter+start+4*step+4)',w=`5*${pitch}+2`
  box('Fit-test hole strip',false,w,'14','thickness')
  for(let i=0;i<5;i++)cylinder(`Hole ${i+1}: clearance ${+(values.start!+i*values.step!).toFixed(3)} mm`,true,`diameter+start+${i}*step`,'thickness+.2',`(${i}-2)*${pitch}`,'0','thickness/2')
  group=crypto.randomUUID();box('Gauge handle',false,'12','12','thickness',`-(${w})/2+6`,'27');cylinder('Gauge pin',false,'diameter','pin_height',`-(${w})/2+6`,'27','thickness+pin_height/2')
 }
 const namedParameters=templateFields[id].map(f=>({id:`recipe:${f.key}`,name:f.key,expression:String(values[f.key]),value:values[f.key]!,unit:'mm' as const}))
 const resolved=resolveDocumentParameterBindings({...doc,name:templateCatalog.find(t=>t.id===id)!.name,nodes,namedParameters,template:{id,version:1,nodeIds:nodes.map(n=>n.id)}})
 if(Object.keys(resolved.errors).length)throw new Error(Object.values(resolved.errors)[0])
 return resolved.document
}
export function templateLinkIssue(doc:ModelDocument):string|null{
 const id=doc.template?.id as StarterId;if(!templateFields[id])return 'This project has no supported template recipe.'
 let expected:ModelDocument;try{expected=useRecipeNames(createTemplateDocument(id,templateValues(doc)),doc)}catch(e){return (e as Error).message}
 if(doc.template!.nodeIds.length!==expected.nodes.length)return 'Template source shapes changed. Continue with shape editing or undo the change.'
 for(const [i,nodeId] of doc.template!.nodeIds.entries()){
  const node=doc.nodes.find(n=>n.id===nodeId),original=expected.nodes[i]
  const equivalent=(a:string|undefined,b:string|undefined)=>{try{return !!a&&!!b&&JSON.stringify(parseParameterExpression(a),(_key,value)=>typeof value==='string'?value.toLowerCase():value)===JSON.stringify(parseParameterExpression(b),(_key,value)=>typeof value==='string'?value.toLowerCase():value)}catch{return false}}
  if(!node||!original||node.kind!==original.kind||node.boolean!==original.boolean||(Object.keys(node.parameterBindings??{}).filter(k=>!k.startsWith("position")).length!==Object.keys(original.parameterBindings??{}).filter(k=>!k.startsWith("position")).length||Object.entries(original.parameterBindings??{}).some(([key,value])=>!key.startsWith("position")&&!equivalent(node.parameterBindings?.[key as ParameterBindingTarget],value)))||node.mesh||(node.deformation?.kind&&node.deformation.kind!=='none'))return 'Template links changed. Undo the advanced edit or keep editing shapes; linked customization is paused.'
  if(node.locked)return 'Unlock template shapes before changing their dimensions.'
  if(Object.values(node.transform.rotation).some((v,j)=>Math.abs(v-Object.values(original.transform.rotation)[j]!)>.001)||Object.values(node.transform.scale).some(v=>Math.abs(v-1)>.001))return 'Template shapes were transformed. Undo the transform to use linked dimensions, or continue with shape editing.'
 }
 return null
}
export function applyTemplateDimensions(doc:ModelDocument,values:Record<string,number>):ModelDocument{
 const issue=templateLinkIssue(doc);if(issue)throw new Error(issue)
 const id=doc.template!.id as StarterId;validateTemplate(id,values)
 const generated=useRecipeNames(createTemplateDocument(id,values),doc),original=useRecipeNames(createTemplateDocument(id,templateValues(doc)),doc),byId=new Map(doc.template!.nodeIds.map((id,i)=>[id,i]))
 const nodes=doc.nodes.map(node=>{const index=byId.get(node.id);if(index===undefined)return node;const replacement=generated.nodes[index]!,before=original.nodes[index]!,bindings={...replacement.parameterBindings},position={...replacement.transform.position}
  for(const axis of ['x','y','z'] as const){const offset=node.transform.position[axis]-before.transform.position[axis];position[axis]+=offset;const key=`position${axis.toUpperCase()}` as ParameterBindingTarget;if(node.parameterBindings?.[key])bindings[key]=node.parameterBindings[key];else if(Math.abs(offset)>.00001)bindings[key]=`(${bindings[key]??0}) + (${offset})`}
  return {...node,parameters:replacement.parameters,parameterBindings:bindings,transform:{...replacement.transform,position},name:replacement.name}
 })
 const parameterNames=new Set(generated.namedParameters.map(p=>p.name.trim().toLowerCase()))
 const resolved=resolveDocumentParameterBindings({...doc,nodes,namedParameters:[...doc.namedParameters.filter(p=>!parameterNames.has(p.name.trim().toLowerCase())&&!generated.namedParameters.some(g=>g.id===p.id)),...generated.namedParameters],revision:doc.revision+1,updatedAt:new Date().toISOString()});if(Object.keys(resolved.errors).length)throw new Error(Object.values(resolved.errors)[0]);return resolved.document
}
