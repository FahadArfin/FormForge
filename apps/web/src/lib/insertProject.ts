import {parseModelDocument,parseParameterExpression,type ModelDocument,type ParameterExpressionNode} from '@formforge/model'
import {resolveDocumentParameterBindings} from './modelParameters'
const id=()=>crypto.randomUUID()
export function insertProject(destination:ModelDocument,source:ModelDocument):ModelDocument {
 const incoming=parseModelDocument(source)
 if(!incoming.nodes.length)throw new Error('This project has no shapes.')
 if(incoming.sculptStrokes.length||destination.sculptStrokes.length)throw new Error('Convert volume-sculpted models to a mesh before inserting projects.')
 if(destination.nodes.length+incoming.nodes.length>2000)throw new Error('Insertion would exceed 2,000 shapes.')
 if(incoming.nodes.some(n=>(n.assemblyPath?.length??0)>=8))throw new Error('This part already has eight nested assembly levels.')
 const used=new Set(destination.namedParameters.map(p=>p.name.trim().toLowerCase()));const names=new Map<string,string>()
 for(const p of incoming.namedParameters){let base=p.name.replace(/[^\p{L}\p{N}_]/gu,'_').slice(0,60)||'Dimension';let i=1,name=`Part_${i}_${base}`;while(used.has(name.toLowerCase()))name=`Part_${++i}_${base}`;used.add(name.toLowerCase());names.set(p.name.trim().toLowerCase(),name)}
 const expression=(s:string):string=>{
  if(!s.trim())return s
  const visit=(n:ParameterExpressionNode):string=>n.kind==='number'?String(n.value):n.kind==='reference'?`[${names.get(n.name.trim().toLowerCase())??n.name}]`:n.kind==='unary'?`(${n.operator}${visit(n.operand)})`:`(${visit(n.left)}${n.operator}${visit(n.right)})`
  return visit(parseParameterExpression(s))
 }
 const materials=new Map(incoming.materialPalette.map(m=>[m.id,id()])), groups=new Map<string,string>(),assemblyIds=new Map<string,string>(),outer=id()
 const mapped=(map:Map<string,string>,old:string)=>{if(!map.has(old))map.set(old,id());return map.get(old)!}
 const nodes=incoming.nodes.map(n=>({...structuredClone(n),id:id(),locked:false,groupId:n.groupId?mapped(groups,n.groupId):undefined,assemblyPath:[outer,...(n.assemblyPath??[]).map(a=>mapped(assemblyIds,a))],materialId:n.materialId?materials.get(n.materialId):undefined,parameterBindings:n.parameterBindings?Object.fromEntries(Object.entries(n.parameterBindings).map(([k,v])=>[k,expression(v!)])):undefined,mesh:n.mesh?{...structuredClone(n.mesh),triangleMaterials:n.mesh.triangleMaterials?.map(a=>({...a,materialId:materials.get(a.materialId)!}))}:undefined}))
 const next=parseModelDocument({...destination,nodes:[...destination.nodes,...nodes],materialPalette:[...destination.materialPalette,...incoming.materialPalette.map(m=>({...m,id:materials.get(m.id)!,printSlot:undefined}))],namedParameters:[...destination.namedParameters,...incoming.namedParameters.map(p=>({...p,id:id(),name:names.get(p.name.trim().toLowerCase())!,expression:expression(p.expression)}))],revision:destination.revision+1,updatedAt:new Date().toISOString()})
 const resolved=resolveDocumentParameterBindings(next);if(Object.keys(resolved.errors).length)throw new Error(Object.values(resolved.errors)[0]);return resolved.document
}
