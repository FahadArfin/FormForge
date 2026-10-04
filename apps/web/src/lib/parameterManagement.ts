import {getParameterDependencies,evaluateParameters,renameParameterReferences,type ModelDocument} from '@formforge/model'
import {resolveDocumentParameterBindings} from './modelParameters'

export type ParameterUse={kind:'parameter'|'shape'|'variant';label:string;nodeId?:string}
const refers=(expression:string,name:string)=>!!expression.trim()&&getParameterDependencies(expression).some(n=>n.toLowerCase()===name.trim().toLowerCase())
export function parameterUsage(doc:ModelDocument,id:string):ParameterUse[]{
 const p=doc.namedParameters.find(p=>p.id===id);if(!p)return []
 const uses:ParameterUse[]=[]
 for(const other of doc.namedParameters)if(other.id!==id&&refers(other.expression,p.name))uses.push({kind:'parameter',label:`${other.name} expression`})
 for(const node of doc.nodes)for(const [field,expression] of Object.entries(node.parameterBindings??{}))if(expression&&refers(expression,p.name))uses.push({kind:'shape',label:`${node.name} · ${field}`,nodeId:node.id})
 for(const variant of doc.parameterVariants??[])if(variant.parameters.some(v=>v.id===id||refers(v.expression,p.name)))uses.push({kind:'variant',label:`Saved variant: ${variant.name}`})
 return uses
}
export function renameDocumentParameter(doc:ModelDocument,id:string,rawName:string):ModelDocument{
 const previous=doc.namedParameters.find(p=>p.id===id),name=rawName.trim()
 if(!previous)throw new Error('This parameter no longer exists.')
 if(!name||name.length>128||/[\[\]\r\n]/u.test(name))throw new Error('Use a name of 1–128 characters without brackets or line breaks.')
 if(doc.namedParameters.some(p=>p.id!==id&&p.name.trim().toLowerCase()===name.toLowerCase()))throw new Error('That parameter name is already used.')
 const rewrite=(expression:string)=>renameParameterReferences(expression,previous.name,name)
 const namedParameters=doc.namedParameters.map(p=>({...p,name:p.id===id?name:p.name,expression:rewrite(p.expression)}))
 const nodes=doc.nodes.map(n=>n.parameterBindings?{...n,parameterBindings:Object.fromEntries(Object.entries(n.parameterBindings).map(([key,value])=>[key,rewrite(value!)]))}:n)
 const parameterVariants=doc.parameterVariants?.map(variant=>{
  const saved=variant.parameters.find(p=>p.id===id);if(!saved)return variant
  if(variant.parameters.some(p=>p.id!==id&&p.name.trim().toLowerCase()===name.toLowerCase()))throw new Error(`That name is already used in ${variant.name}.`)
  const parameters=variant.parameters.map(p=>({...p,name:p.id===id?name:p.name,expression:renameParameterReferences(p.expression,saved.name,name)}))
  evaluateParameters(parameters)
  return {...variant,parameters}
 })
 const resolved=resolveDocumentParameterBindings({...doc,namedParameters,nodes,parameterVariants})
 if(Object.keys(resolved.errors).length)throw new Error(Object.values(resolved.errors)[0])
 return {...resolved.document,revision:doc.revision+1,updatedAt:new Date().toISOString()}
}
export function removeDocumentParameter(doc:ModelDocument,id:string):ModelDocument{
 const uses=parameterUsage(doc,id)
 if(uses.length)throw new Error(`This parameter is used by ${uses.length} item${uses.length===1?'':'s'}. Remove its bindings, dependent expressions and saved variants first.`)
 return {...doc,namedParameters:doc.namedParameters.filter(p=>p.id!==id),revision:doc.revision+1,updatedAt:new Date().toISOString()}
}
