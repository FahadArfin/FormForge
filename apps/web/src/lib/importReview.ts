import { Matrix4, Vector3 } from 'three'
import { Unzip, UnzipInflate, strFromU8 } from 'fflate'
import type { ModelNode } from '@formforge/model'
export type ImportMesh = NonNullable<ModelNode['mesh']>
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024
const MAX_VERTICES = 1_500_000, MAX_TRIANGLES = 500_000
export function meshBounds(mesh: {positions: ArrayLike<number>}) {
 const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity}
 for(let i=0;i<mesh.positions.length;i+=3) for(const [offset,axis] of (['x','y','z'] as const).entries()){ const v=mesh.positions[i+offset]!;if(!Number.isFinite(v)||Math.abs(v)>1e7)throw new Error('Mesh coordinates must be finite and within 10 km.');min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v) }
 if(!mesh.positions.length||mesh.positions.length%3)throw new Error('The mesh has no valid vertices.')
 return {min,max,size:{x:max.x-min.x,y:max.y-min.y,z:max.z-min.z}}
}
export function validateImportMesh(mesh: ImportMesh) {
 if(mesh.positions.length/3>MAX_VERTICES||mesh.indices.length/3>MAX_TRIANGLES)throw new Error('Import up to 500,000 triangles and 1.5 million vertices. Simplify this mesh first.')
 meshBounds(mesh)
 if(!mesh.indices.length||mesh.indices.length%3||mesh.indices.some(i=>!Number.isInteger(i)||i<0||i>=mesh.positions.length/3))throw new Error('The mesh contains invalid triangle indices.')
 return mesh
}
export function prepareImport(mesh: ImportMesh, scale: number, up: 'y'|'z'): ImportMesh {
 if(!Number.isFinite(scale)||scale<=0||scale>1e6)throw new Error('Choose a positive scale up to 1,000,000.')
 const positions:number[]=[]
 for(let i=0;i<mesh.positions.length;i+=3){const [x,y,z]=[mesh.positions[i]!*scale,mesh.positions[i+1]!*scale,mesh.positions[i+2]!*scale];positions.push(x,up==='y'?-z:y,up==='y'?y:z)}
 const bounds=meshBounds({positions});const center={x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2}
 for(let i=0;i<positions.length;i+=3){positions[i]=positions[i]!-center.x;positions[i+1]=positions[i+1]!-center.y;positions[i+2]=positions[i+2]!-bounds.min.z}
 return validateImportMesh({positions,indices:[...mesh.indices]})
}
/** Geometry-only, single-model core 3MF. Extensions are never guessed or fetched. */
export function parse3mf(data: Uint8Array): ImportMesh {
 if(data.byteLength>MAX_IMPORT_BYTES)throw new Error('Choose a file smaller than 25 MB.')
 let total=0,count=0,modelCount=0
 const files:Record<string,Uint8Array>={}
 const unzip=new Unzip(file=>{
  if(++count>512)throw new Error('Too many entries in this 3MF.')
  if(!/\.model$/i.test(file.name))return
  if(++modelCount>1)throw new Error('Import a core 3MF containing one model. Export complex projects as standard geometry first.')
  if((file.originalSize??0)>32*1024*1024)throw new Error('This 3MF expands beyond the 32 MB import limit.')
  const chunks:Uint8Array[]=[];let size=0
  file.ondata=(error,chunk,final)=>{
   if(error)throw error
   total+=chunk.length;size+=chunk.length
   if(total>32*1024*1024||(file.originalSize!==undefined&&size>file.originalSize)){file.terminate();throw new Error('3MF expanded size exceeds its declared size or the 32 MB limit.')}
   chunks.push(chunk)
   if(final){if(file.originalSize!==undefined&&size!==file.originalSize)throw new Error('3MF expanded size does not match its declared size.');const content=new Uint8Array(size);let offset=0;for(const part of chunks){content.set(part,offset);offset+=part.length}files[file.name]=content}
  }
  file.start()
 })
 unzip.register(UnzipInflate)
 // Bound each inflater push as well as actual output; ZIP metadata alone is untrusted.
 for(let offset=0;offset<data.length;offset+=4096)unzip.push(data.subarray(offset,offset+4096),offset+4096>=data.length)
 const models=Object.keys(files);if(models.length!==1)throw new Error('Import a complete core 3MF containing one model.')
 const xml=strFromU8(files[models[0]!]!);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported XML declarations in 3MF.')
 const parsed=new DOMParser().parseFromString(xml,'application/xml');const root=parsed.documentElement
 if(parsed.querySelector('parsererror')||root.localName!=='model')throw new Error('The 3MF model XML is invalid.')
 if(root.getAttribute('requiredextensions')?.trim())throw new Error('This 3MF needs unsupported extensions. Export a standard geometry-only 3MF first.')
 const units:Record<string,number>={micron:.001,millimeter:1,centimeter:10,inch:25.4,foot:304.8,meter:1000}
 const unit=units[root.getAttribute('unit')??'millimeter'];if(!unit)throw new Error('Unsupported 3MF unit.')
 const children=(el:Element,name:string)=>Array.from(el.children).filter(e=>e.localName===name)
 const one=(el:Element,name:string)=>children(el,name)[0]
 const objects=new Map<string,Element>();for(const o of children(one(root,'resources')??root,'object')){const id=o.getAttribute('id');if(!id||objects.has(id))throw new Error('3MF object IDs must be unique.');objects.set(id,o)}
 const positions:number[]=[],indices:number[]=[];let instances=0
 const transform=(el:Element)=>{const attr=el.getAttribute('transform');if(!attr)return new Matrix4();const a=attr.trim().split(/\s+/).map(Number);if(a.length!==12||a.some(v=>!Number.isFinite(v)))throw new Error('Invalid 3MF transform.');return new Matrix4().set(a[0]!,a[3]!,a[6]!,a[9]!,a[1]!,a[4]!,a[7]!,a[10]!,a[2]!,a[5]!,a[8]!,a[11]!,0,0,0,1)}
 const add=(id:string,matrix:Matrix4,ancestors:string[])=>{
  if(ancestors.includes(id))throw new Error('Cyclic 3MF component reference.')
  if(++instances>1024||ancestors.length>32)throw new Error('Too many nested 3MF components.')
  const obj=objects.get(id);if(!obj)throw new Error('Missing 3MF component.')
  const mesh=one(obj,'mesh'),components=one(obj,'components')
  if(mesh&&components)throw new Error('Invalid mixed 3MF object.')
  if(mesh){const vertices=children(one(mesh,'vertices')??mesh,'vertex'),triangles=children(one(mesh,'triangles')??mesh,'triangle');if(positions.length/3+vertices.length>MAX_VERTICES||indices.length/3+triangles.length>MAX_TRIANGLES)throw new Error('3MF exceeds 500,000 triangles or 1.5 million vertices.');const base=positions.length/3
   for(const v of vertices){const xyz=['x','y','z'].map(axis=>{const a=v.getAttribute(axis);return a===null?NaN:Number(a)});const p=new Vector3(xyz[0],xyz[1],xyz[2]).applyMatrix4(matrix).multiplyScalar(unit);positions.push(p.x,p.y,p.z)}
   for(const t of triangles){const ids=['v1','v2','v3'].map(k=>{const a=t.getAttribute(k);return a===null?NaN:Number(a)});if(ids.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length))throw new Error('Invalid 3MF triangle index.');if(matrix.determinant()<0)[ids[1],ids[2]]=[ids[2]!,ids[1]!];indices.push(...ids.map(i=>base+i))}
  }else if(components){for(const c of children(components,'component')){if(Array.from(c.attributes).some(a=>a.localName==='path'))throw new Error('External 3MF components are unsupported.');add(c.getAttribute('objectid')??'',matrix.clone().multiply(transform(c)),[...ancestors,id])}}
  else throw new Error('The 3MF object has no triangle geometry.')
 }
 for(const item of children(one(root,'build')??root,'item')){if(Array.from(item.attributes).some(a=>a.localName==='path'))throw new Error('External 3MF build items are unsupported.');if(item.getAttribute('printable')==='0'||item.getAttribute('printable')==='false')continue;add(item.getAttribute('objectid')??'',transform(item),[])}
 return validateImportMesh({positions,indices})
}
