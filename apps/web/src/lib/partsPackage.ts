import {analyzeForPrint,type MeshPayload,type ModelDocument} from '@formforge/model'
import {evaluateSnapshot} from '@/geometry/evaluateSnapshot'
import {checkCancelled,csv,textFile,zipPackage} from './exportPackage'
import {meshBounds} from './importReview'
import {export3mf,exportStl} from './exporters'
import {printReport} from './printReport'
export function separateInWorker(mesh:MeshPayload,signal?:AbortSignal):Promise<MeshPayload[]>{
 checkCancelled(signal)
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../geometry/parts.worker.ts',import.meta.url),{type:'module'})
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker.terminate()}
  const cancel=()=>{cleanup();reject(new DOMException('Parts preparation cancelled.','AbortError'))}
  const timer=setTimeout(()=>{cleanup();reject(new Error('Parts preparation timed out. Simplify the model or export it whole.'))},60000)
  signal?.addEventListener('abort',cancel,{once:true})
  worker.onmessage=(event:MessageEvent<{ok:boolean;parts?:MeshPayload[];error?:string}>)=>{cleanup();event.data.ok?resolve(event.data.parts!):reject(new Error(event.data.error))}
  worker.onerror=event=>{event.preventDefault();cleanup();reject(new Error(event.message||'Parts worker failed. Retry or export the whole model.'))}
  worker.onmessageerror=()=>{cleanup();reject(new Error('Parts worker returned unreadable data.'))}
  try{worker.postMessage({mesh})}catch(error){cleanup();reject(error)}
 })
}
export async function evaluateParts(doc:ModelDocument,signal?:AbortSignal){const mesh=await evaluateSnapshot(doc,signal);checkCancelled(signal);return separateInWorker(mesh,signal)}
export function partsManifest(parts:MeshPayload[],scope:string){return csv([['Part','Scope','Quantity','Width (mm)','Depth (mm)','Height (mm)','Geometric volume (mm3)','Triangles'],...parts.map((p,i)=>{const b=meshBounds(p);return[`Part ${i+1}`,scope,1,b.size.x.toFixed(3),b.size.y.toFixed(3),b.size.z.toFixed(3),p.volume.toFixed(3),p.triangleCount]})])}
export async function createPartsPackage(doc:ModelDocument,parts:MeshPayload[],format:'3mf'|'stl',scope:string,signal?:AbortSignal){
 checkCancelled(signal);if(!parts.length||parts.length>64||parts.some(p=>p.volume<=0))throw new Error('Prepare valid separated solids first.')
 const files:Record<string,Uint8Array>={'parts.csv':textFile(partsManifest(parts,scope))}
 for(const [i,mesh] of parts.entries()){
  checkCancelled(signal);const name=`part-${String(i+1).padStart(2,'0')}`,blob=format==='stl'?exportStl(mesh):export3mf(mesh,`${doc.name} · ${name}`)
  files[`${name}.${format}`]=new Uint8Array(await blob.arrayBuffer())
  files[`${name}-print-report.txt`]=textFile(printReport(doc,analyzeForPrint(doc,mesh,meshBounds(mesh).size),`${scope} · ${name}`))
 }
 files['README.txt']=textFile(`FormForge evaluated parts package\nProject: ${doc.name}\nScope: ${scope}\nEach file is a disconnected solid from the final evaluated geometry. Original millimeter coordinates and orientation are preserved.\nPart numbers describe this snapshot only, not source shapes, assemblies, material slots or a manufacturing bill of materials. Quantity is one per exported solid.\nGeometric volume is not filament usage. No slicer settings or print certification are included. Review placement, walls, supports and layers in your slicer.`)
 return zipPackage(files,signal)
}
