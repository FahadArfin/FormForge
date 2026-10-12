import {createNode,parseModelDocument,evaluateParameters,engineeringOperationSchema,rackDimensionsSchema,type EngineeringOperation,type ModelDocument,type RackDimensions,type ModelNode, type ParameterBindingTarget} from '@formforge/model'
import {resolveDocumentParameterBindings,getParameterTargetInfo} from './modelParameters'
import {createAttachedHole} from './attachedHoles'
import {patternAssembly} from './assemblyTools'
import {evaluateSnapshot} from '../geometry/evaluateSnapshot'
import {getPlatePlacementTarget,placeDocumentFromMesh} from './platePlacement'
import {splitDocumentSafely} from './planeSplit'
import {Euler,Quaternion,Vector3,MathUtils} from 'three'
import {rotateTransform} from './workplanes'
import {modelTransformMatrix} from './modelTransforms'

export const engineeringPrimitiveFields:Record<ModelNode['kind'],readonly string[]>={
 box:['width','depth','height'],roundedBox:['width','depth','height','fillet','segments'],
 cylinder:['radius','height','segments'],sphere:['radius','segments'],cone:['radius','radiusTop','height','segments'],
 tube:['radius','radiusTop','height','segments'],gear:['radius','radiusTop','height','count'],
 loft:['width','depth','height','topWidth','topDepth','twist','count','segments'],spring:['radius','radiusTop','height','count','segments'],
 torus:['radius','radiusTop','segments'],capsule:['radius','height','segments'],wedge:['width','depth','height'],
 star:['radius','radiusTop','height','segments'],extrude:['height'],revolve:['segments'],mesh:[],
}
function validateRequestedFields(kind:ModelNode['kind'],parameters:object|undefined,bindings:object|undefined){
 for(const key of Object.keys(parameters??{}))if(!engineeringPrimitiveFields[kind].includes(key))throw new Error('Unsupported '+kind+' parameter: '+key+'. It does not affect this primitive geometry.')
 for(const key of Object.keys(bindings??{}))if(!engineeringPrimitiveFields[kind].includes(key)&&!/^position[XYZ]$|^rotation[XYZ]$/.test(key))throw new Error('Unsupported '+kind+' binding: '+key+'. It does not affect this primitive geometry.')
}

export function resolveEngineeringDocument(doc:ModelDocument,checkPrimitiveDimensions=true):ModelDocument{
 const parsed=parseModelDocument(doc)
 if(new Set(parsed.nodes.map(n=>n.id)).size!==parsed.nodes.length)throw new Error('Feature IDs must be unique; duplicate IDs are unsupported.')
 for(const node of parsed.nodes)for(const [key,expression] of Object.entries(node.parameterBindings??{})){
  const target=key as ParameterBindingTarget,info=getParameterTargetInfo(target)
  let name='__engineering_binding';while(parsed.namedParameters.some(p=>p.name.toLowerCase()===name))name+='_'
  const value=evaluateParameters([...parsed.namedParameters,{id:name,name,expression:expression!,unit:info.unit,value:0}]).get(name)!.value
  if(!Number.isFinite(value)||(['width','depth','height','radius','topWidth','topDepth'].includes(key)&&value<.1)||(['fillet','wall','radiusTop'].includes(key)&&value<0))throw new Error('Binding dimensions must be positive and must not require clamping.')
 }
 const result=resolveDocumentParameterBindings(parsed)
 if(Object.keys(result.errors).length)throw new Error(Object.values(result.errors).join('; '))
 for(const n of result.document.nodes)for(const key of ['width','depth','height','radius'] as const)if(n.parameters[key]<=0)throw new Error('Feature dimensions must be positive.')
 if(checkPrimitiveDimensions)for(const node of result.document.nodes.filter(n=>!n.suppressed)){
  const p=node.parameters,min=Math.min(p.width,p.depth,p.height)
  if(node.kind==='roundedBox'&&(p.fillet<.01||2*p.fillet>min-.01+1e-9))throw new Error('Rounded-box radius must be at least 0.01 mm and leave a 0.01 mm core in every dimension; the kernel would otherwise clamp it.')
  if(node.kind==='tube'&&(p.radiusTop<=0||p.radiusTop>p.radius*.9))throw new Error('Tube bore radius must be positive and no greater than 90% of the outer radius; the kernel would otherwise clamp it.')
  if(node.kind==='spring'&&p.radiusTop<.25)throw new Error('Spring wire radius must be at least 0.25 mm; the kernel would otherwise clamp it.')
  if(node.kind==='gear'&&(p.radiusTop>p.radius*.96||p.radiusTop<=Math.max(.8,Math.min(p.radiusTop*.38,p.radius*.3))||p.count<6||p.count>96))throw new Error('Gear root radius must leave material around its derived bore and stay within 96% of the outer radius; use 6–96 teeth to avoid clamping.')
  if(node.kind==='capsule'&&p.radius>p.height/2)throw new Error('Capsule radius exceeds half its height and would be clamped.')
  if((node.kind==='torus'||node.kind==='star')&&p.radiusTop<.5)throw new Error('The secondary radius must be at least 0.5 mm to avoid kernel clamping.')
 }
 if(result.document.nodes.length>2000)throw new Error('Keep the design within 2,000 features.')
 if(result.document.engineering?.shelf){
  const ids=new Set(result.document.nodes.map(n=>n.id))
  if(result.document.engineering.shelf.nodeIds.some(id=>!ids.has(id)))throw new Error('Shelf feature references are missing. Regenerate the shelf or clear its recipe metadata.')
  validateShelfDimensions(readShelfDimensions(result.document))
 }
 return result.document
}
function validateShelfDimensions(input:RackDimensions){
 const d=rackDimensionsSchema.parse(input)
 if(d.width<d.deviceWidth+2*d.thickness||d.depth<d.deviceDepth+d.cableClearance||d.earHeight<=d.holeHeight+d.holeDiameter/2||d.holeHeight-d.holeDiameter/2<=d.thickness||d.holeSpacing+d.holeDiameter>=d.width||d.holeSpacing-d.holeDiameter<=d.deviceWidth||d.slotCount*d.slotWidth+(d.slotCount+1)*d.thickness>=d.deviceWidth||d.cornerRadius>d.thickness/2)throw new Error('Shelf measurements leave insufficient device, hole, wall, slot or rounding clearance.')
 return d
}
function shelf(doc:ModelDocument,d:RackDimensions):ModelDocument{
 validateShelfDimensions(d)
 const previous=new Set(doc.engineering?.shelf?.nodeIds??[])
 if(doc.nodes.some(n=>previous.has(n.id)&&n.locked))throw new Error('Unlock shelf features before regenerating.')
 if(!previous.size&&(doc.nodes.some(n=>n.id.startsWith('rack:'))||doc.namedParameters.some(p=>p.id.startsWith('rack:')||Object.keys(d).some(key=>p.name.toLowerCase()==='rack_'+key.toLowerCase()))))throw new Error('Reserved rack feature IDs or parameter names already exist.')
 const namedParameters=[...doc.namedParameters.filter(p=>!p.id.startsWith('rack:')), ...Object.entries(d).map(([key,value])=>({id:'rack:'+key,name:'rack_'+key,expression:String(value),unit:'mm' as const,value}))]
 const nodes:ModelNode[]=[]
 function box(id:string,name:string,width:string,depth:string,height:string,x:string,y:string,z:string,cut=false){
  const n=createNode('box',cut?'cut':'add');n.id=id;n.name=name;n.combined=true;n.groupId='rack:assembly';n.color='#48b5a2'
  n.parameterBindings={width,depth,height,positionX:x,positionY:y,positionZ:z};nodes.push(n);return n
 }
 const base=box('rack:base','Shelf plate','rack_width','rack_depth','rack_thickness','0','0','rack_thickness / 2')
 if(d.cornerRadius){base.kind='roundedBox';base.parameterBindings!.fillet='rack_cornerRadius'}
 for(const sign of [-1,1]){
  const ear=box('rack:ear:'+sign,'Rack mounting ear','(rack_width - rack_deviceWidth) / 2','rack_thickness','rack_earHeight',sign+' * (rack_width + rack_deviceWidth) / 4','-rack_depth / 2 + rack_thickness / 2','rack_earHeight / 2')
  // Ears join the plate; holes run through Y with linked placement.
  const hole=createNode('cylinder','cut');hole.id='rack:hole:'+sign;hole.name='Rack mounting hole';hole.combined=true;hole.groupId=ear.groupId;hole.transform.rotation.x=90
  hole.parameterBindings={radius:'rack_holeDiameter / 2',height:'rack_thickness + 2',positionX:sign+' * rack_holeSpacing / 2',positionY:'-rack_depth / 2 + rack_thickness / 2',positionZ:'rack_holeHeight'};nodes.push(hole)
 }
 for(let i=0;i<d.slotCount;i++)box('rack:slot:'+i,'Ventilation slot '+(i+1),'rack_slotWidth','rack_deviceDepth * 0.75','rack_thickness + 2','-rack_deviceWidth / 2 + rack_deviceWidth * '+(i+1)+' / '+(d.slotCount+1),'0','rack_thickness / 2',true)
 const engineering={version:1 as const,...doc.engineering,shelf:{nodeIds:nodes.map(n=>n.id),dimensions:d},history:doc.engineering?.history??[]}
 return resolveEngineeringDocument({...doc,nodes:[...doc.nodes.filter(n=>!previous.has(n.id)),...nodes],namedParameters,engineering})
}
export function readShelfDimensions(doc:ModelDocument):RackDimensions{
 if(!doc.engineering?.shelf)throw new Error('Create a measured rack shelf first.')
 const values=evaluateParameters(doc.namedParameters)
 return Object.fromEntries(Object.keys(doc.engineering.shelf.dimensions).map(key=>[key,values.get('rack_'+key)?.canonicalValue??doc.engineering!.shelf!.dimensions[key as keyof RackDimensions]])) as unknown as RackDimensions
}
/** Replace only recipe slots, preserving existing solids, parameter expressions and their world placement. */
function refineShelfSlots(doc:ModelDocument,count:number,replaceCount=true):ModelDocument{
 const d=validateShelfDimensions({...readShelfDimensions(doc),slotCount:count}),recipe=doc.engineering!.shelf!
 const base=doc.nodes.find(n=>n.id==='rack:base'&&recipe.nodeIds.includes(n.id))
 if(!base)throw new Error('The shelf base reference is missing.')
 if(Object.keys(base.parameterBindings??{}).some(k=>k.startsWith('rotation')))throw new Error('Resolve the shelf base rotation binding before changing its slot pattern.')
 const oldSlots=new Set(recipe.nodeIds.filter(id=>id.startsWith('rack:slot:')))
 if(base.locked||doc.nodes.some(n=>oldSlots.has(n.id)&&n.locked))throw new Error('Unlock the shelf base and slots before refining them.')
 const namedParameters=replaceCount?doc.namedParameters.map(p=>p.name.toLowerCase()==='rack_slotcount'?{...p,expression:String(count),value:count,unit:'mm' as const}:p):doc.namedParameters
 const matrix=modelTransformMatrix(base.transform),axis=new Vector3().setFromMatrixColumn(matrix,0)
 const slots:ModelNode[]=[]
 for(let i=0;i<count;i++){
  const slot=createNode('box','cut'),previous=doc.nodes.find(n=>n.id==='rack:slot:'+i)
  slot.id='rack:slot:'+i;slot.name='Ventilation slot '+(i+1);slot.combined=base.combined;slot.groupId=base.groupId;slot.assemblyPath=base.assemblyPath;slot.color=base.color
  if(previous)slot.createdAt=previous.createdAt
  slot.transform={position:{...base.transform.position},rotation:{...base.transform.rotation},scale:{...base.transform.scale}}
  const localX='(-rack_deviceWidth / 2 + rack_deviceWidth * '+(i+1)+' / '+(count+1)+')'
  slot.parameterBindings={width:'rack_slotWidth',depth:'rack_deviceDepth * 0.75',height:'rack_thickness + 2'}
  for(const a of ['x','y','z'] as const){const key='position'+a.toUpperCase() as ParameterBindingTarget;slot.parameterBindings[key]='('+ (base.parameterBindings?.[key]??base.transform.position[a]) +') + '+localX+' * '+axis[a]}
  slots.push(slot)
 }
 const nodes=[...doc.nodes.filter(n=>!oldSlots.has(n.id)),...slots]
 return {...doc,nodes,namedParameters,engineering:{...doc.engineering!,shelf:{nodeIds:[...recipe.nodeIds.filter(id=>!oldSlots.has(id)),...slots.map(n=>n.id)],dimensions:d}}}
}
export async function applyEngineeringOperation(source:ModelDocument,input:EngineeringOperation,signal?:AbortSignal):Promise<ModelDocument>{
 const op=engineeringOperationSchema.parse(input);let doc=resolveEngineeringDocument(structuredClone(source),false)
 const baseline=doc
 const finish=(next:ModelDocument)=>{
  const resolved=resolveEngineeringDocument(next)
  for(const locked of baseline.nodes.filter(n=>n.locked))if(JSON.stringify(resolved.nodes.find(n=>n.id===locked.id))!==JSON.stringify(locked))throw new Error('Unlock every affected feature before changing its geometry or linked parameters.')
  return resolved
 }
 const selected=(id:string)=>{const n=doc.nodes.find(n=>n.id===id);if(!n)throw new Error('Feature not found: '+id);if(n.locked)throw new Error('Unlock the feature before editing.');return n}
 if(op.type==='rack-shelf')return finish(shelf(doc,op.dimensions))
 if(op.type==='shelf-slots')return finish(refineShelfSlots(doc,op.count))
 if(op.type==='set-parameter'){
  const existing=doc.namedParameters.find(p=>p.name.trim().toLowerCase()===op.name.trim().toLowerCase())
  doc.namedParameters=[...doc.namedParameters.filter(p=>p.id!==existing?.id),{id:existing?.id??crypto.randomUUID(),name:existing?.name??op.name.trim(),expression:op.expression,unit:op.unit,value:existing?.value??0}]
 }else if(op.type==='create-feature'){
  validateRequestedFields(op.kind,op.parameters,op.bindings)
  if(doc.nodes.some(n=>n.id===op.id))throw new Error('Feature ID already exists.')
  const n=createNode(op.kind,op.boolean,op.position);n.id=op.id;n.name=op.name;n.parameters={...n.parameters,...op.parameters};if(op.rotation)n.transform.rotation=op.rotation;n.parameterBindings=op.bindings
  if(op.groupId){n.groupId=op.groupId;n.combined=true}
  doc.nodes.push(n)
 }else if(op.type==='edit-feature'){
  const n=selected(op.nodeId)
  validateRequestedFields(n.kind,op.parameters,op.bindings)
  if(n.faceAttachment&&(op.position||op.rotation||op.parameters?.height!==undefined||Object.keys(op.bindings??{}).some(k=>k==='height'||k.startsWith('position')||k.startsWith('rotation'))))throw new Error('Attached-hole position, rotation and depth are controlled by the face attachment; edit its target or recreate the hole.')
  n.parameters={...n.parameters,...op.parameters}
  for(const key of Object.keys(op.parameters??{}))delete n.parameterBindings?.[key as ParameterBindingTarget]
  if(op.position){n.transform.position=op.position;for(const a of ['X','Y','Z'])delete n.parameterBindings?.['position'+a as ParameterBindingTarget]}
  if(op.rotation){n.transform.rotation=op.rotation;for(const a of ['X','Y','Z'])delete n.parameterBindings?.['rotation'+a as ParameterBindingTarget]}
  n.parameterBindings={...n.parameterBindings,...op.bindings}
 }else if(op.type==='hole'){
  if(doc.nodes.some(n=>n.id===op.id))throw new Error('Feature ID already exists.')
  const n=createAttachedHole(selected(op.targetNodeId),op.face,op.diameter,op.u,op.v,op.depthMode,op.depth);n.id=op.id;doc.nodes.push(n)
 }else if(op.type==='pattern'){
  op.nodeIds.forEach(selected);doc=patternAssembly(doc,op.nodeIds,op)
 }else if(op.type==='round'){
  const n=selected(op.nodeId)
  if(!['box','roundedBox'].includes(n.kind)||n.edgeTreatment||n.faceAttachment||doc.nodes.some(h=>h.faceAttachment?.targetNodeId===n.id))throw new Error('Rounding supports standalone box features without attached holes or edge treatments. Arbitrary mesh edges are unsupported.')
  if(op.radius>Math.min(n.parameters.width,n.parameters.depth,n.parameters.height)/2)throw new Error('Radius exceeds half the smallest dimension.')
  n.kind='roundedBox';n.parameters.fillet=op.radius;delete n.parameterBindings?.fillet
 }else if(op.type==='split'){
  const split=await splitDocumentSafely(()=>doc,op,()=>{}, {signal})
  return finish({...split,template:undefined,engineering:split.engineering?{...split.engineering,shelf:undefined}:undefined})
 }else if(op.type==='orient'){
  if(doc.sculptStrokes.length||doc.nodes.some(n=>n.locked||n.faceAttachment||Object.keys(n.parameterBindings??{}).some(k=>k.startsWith('rotation'))))throw new Error('Orientation needs unlocked features without sculpt strokes, attached holes or rotation bindings.')
  const q=new Quaternion().setFromEuler(new Euler(...[op.rotation.x,op.rotation.y,op.rotation.z].map(MathUtils.degToRad) as [number,number,number]))
  const axes=['x','y','z'] as const
  doc.nodes=doc.nodes.map(n=>{
   const next=rotateTransform(n,q,new Vector3()),bindings={...n.parameterBindings}
   const expressions=axes.map(a=>bindings['position'+a.toUpperCase() as ParameterBindingTarget]??String(n.transform.position[a]))
   for(const a of axes){const row=axes.map((b,i)=>{const v=new Vector3(b==='x'?1:0,b==='y'?1:0,b==='z'?1:0).applyQuaternion(q);return '('+expressions[i]+') * '+v[a]});bindings['position'+a.toUpperCase() as ParameterBindingTarget]=row.join(' + ')}
   return {...next,parameterBindings:bindings}
  })
 }
 doc=resolveEngineeringDocument(doc)
 if(op.type==='set-parameter'&&doc.engineering?.shelf){
  const count=readShelfDimensions(doc).slotCount
  if(doc.nodes.filter(n=>doc.engineering!.shelf!.nodeIds.includes(n.id)&&n.id.startsWith('rack:slot:')).length!==count)doc=refineShelfSlots(doc,count,false)
 }
 if(op.type==='place-on-bed'||op.type==='orient'){
  const mesh=await evaluateSnapshot(doc,signal),target=getPlatePlacementTarget(doc,[],'document')
  // Placement translates bound positions as expressions, retaining editable relationships.
  const placementDoc={...doc,template:{id:doc.template?.id??'engineering-placement',version:1 as const,nodeIds:doc.nodes.map(n=>n.id)}}
  doc=placeDocumentFromMesh(placementDoc,target,mesh,'center-and-drop')??doc
  doc={...doc,template:source.template}
 }
 return finish(doc)
}
