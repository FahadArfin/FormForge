import { analyzeForPrint,evaluateParameters,type ModelDocument,type MeshPayload } from '@formforge/model'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'
import { applyParameterVariant } from './parameterVariants'
import { meshBounds } from './importReview'
import { export3mf,exportStl } from './exporters'
import { safeFilename } from './download'
import { printReport } from './printReport'
import { checkCancelled,csv,PACKAGE_LIMIT,textFile,zipPackage } from './exportPackage'
export function variantTable(document:ModelDocument){
 const variants=document.parameterVariants??[]
 const parameters=[...new Map([...document.namedParameters,...variants.flatMap(v=>v.parameters)].map(p=>[p.id,p])).values()]
 const columns=[{name:'Current',parameters:document.namedParameters},...variants]
 const values=columns.map(column=>{try{return evaluateParameters(column.parameters)}catch{return null}})
 return {columns:columns.map(c=>c.name),rows:parameters.map(p=>({id:p.id,name:p.name,values:columns.map((c,i)=>{const saved=c.parameters.find(s=>s.id===p.id),resolved=saved&&values[i]?.get(saved.name);return !saved?'—':!resolved?'Invalid':`${Number(resolved.value.toFixed(4))} ${resolved.unit}`})}))}
}
export function variantCsv(document:ModelDocument){const table=variantTable(document);return csv([['Parameter',...table.columns],...table.rows.map(r=>[r.name,...r.values])])}
export async function createVariantPackage(document:ModelDocument,ids:string[],format:'3mf'|'stl',signal?:AbortSignal,progress:(message:string)=>void=()=>{},compute:(doc:ModelDocument,signal?:AbortSignal)=>Promise<MeshPayload>=evaluateSnapshot){
 checkCancelled(signal)
 if(!ids.length||ids.length>8||new Set(ids).size!==ids.length)throw new Error('Select between 1 and 8 different variants.')
 const variants=ids.map(id=>{const v=document.parameterVariants?.find(v=>v.id===id);if(!v)throw new Error('A selected variant no longer exists.');return v})
 // Validate every configuration before starting expensive geometry work.
 const snapshots=variants.map(v=>applyParameterVariant(document,v))
 const files:Record<string,Uint8Array>={'comparison.csv':textFile(variantCsv(document))}
 let bytes=files['comparison.csv']!.byteLength
 for(const [i,variant] of variants.entries()){
  checkCancelled(signal);progress(`Building ${i+1} of ${variants.length}: ${variant.name}`)
  const snapshot=snapshots[i]!,mesh=await compute(snapshot,signal);checkCancelled(signal)
  if(!mesh.triangleCount||!(mesh.volume>0))throw new Error(`${variant.name} has no exportable solid. No package was created.`)
  const folder=`${String(i+1).padStart(2,'0')}-${safeFilename(variant.name)}`,analysis=analyzeForPrint(snapshot,mesh,meshBounds(mesh).size)
  const blob=format==='stl'?exportStl(mesh):export3mf(mesh,`${document.name} · ${variant.name}`)
  const resolved=evaluateParameters(snapshot.namedParameters).parameters.map(p=>({name:p.name,expression:p.expression,value:p.value,unit:p.unit,canonicalValue:p.canonicalValue,canonicalUnit:p.canonicalUnit}))
  files[`${folder}/model.${format}`]=new Uint8Array(await blob.arrayBuffer())
  files[`${folder}/parameters.json`]=textFile(JSON.stringify(resolved,null,2))
  files[`${folder}/print-report.txt`]=textFile(printReport(snapshot,analysis,`Complete model · ${variant.name}`))
  bytes+=files[`${folder}/model.${format}`]!.byteLength+files[`${folder}/parameters.json`]!.byteLength+files[`${folder}/print-report.txt`]!.byteLength
  if(bytes>PACKAGE_LIMIT)throw new Error('The variants exceed the 64 MiB package limit. Select fewer variants.')
 }
 checkCancelled(signal);progress('Packing models and reports…')
 files['README.txt']=textFile('FormForge parameter variants\nUnits: millimeters. Each folder is a separately evaluated complete model.\nOpen each 3MF/STL in your slicer to review supports, walls, orientation and tolerances.\nNo slicer settings, G-code, filament estimates or physical print certification are included.')
 return zipPackage(files,signal)
}
