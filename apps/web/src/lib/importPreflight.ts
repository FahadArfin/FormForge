export function checkStlData(data:ArrayBuffer):ArrayBuffer{
 const view=new DataView(data),prefix=new TextDecoder().decode(data.slice(0,80)).trimStart()
 if(data.byteLength>=84){const faces=view.getUint32(80,true);if(84+faces*50===data.byteLength){if(faces>500_000)throw new Error('STL exceeds 500,000 triangles.');return data}}
 if(!prefix.startsWith('solid'))throw new Error('Invalid or truncated binary STL triangle data.')
 const text=new TextDecoder().decode(data);let count=0;for(const _ of text.matchAll(/\bfacet\s+normal\b/g)){if(++count>500_000)throw new Error('STL exceeds 500,000 triangles.')}
 if(!count)throw new Error('The STL has no triangles.')
 const normalized=new TextEncoder().encode(text.trimStart()).buffer
 if(normalized.byteLength<84)throw new Error('Truncated ASCII STL.')
 return normalized
}
/** Check declarations before a loader allocates arrays; import geometry only. */
export function prepareGltfData(data:ArrayBuffer):ArrayBuffer|string{
 const view=new DataView(data),binary=data.byteLength>=12&&view.getUint32(0,true)===0x46546c67
 let jsonLength=0
 if(binary){
  if(data.byteLength<20||view.getUint32(4,true)!==2||view.getUint32(8,true)!==data.byteLength||view.getUint32(16,true)!==0x4e4f534a)throw new Error('Invalid GLB header.')
  jsonLength=view.getUint32(12,true);if(jsonLength%4||jsonLength+20>data.byteLength)throw new Error('Truncated GLB JSON.')
  let offset=20+jsonLength,bins=0
  while(offset<data.byteLength){if(offset+8>data.byteLength)throw new Error('Truncated GLB chunk.');const length=view.getUint32(offset,true),kind=view.getUint32(offset+4,true);if(length%4||offset+8+length>data.byteLength||kind!==0x004e4942||++bins>1)throw new Error('GLB must contain one JSON chunk and at most one binary chunk.');offset+=8+length}
 }
 const json=JSON.parse(new TextDecoder().decode(binary?data.slice(20,20+jsonLength):data).replace(/\0+$/,''))
 if(json.extensionsRequired?.length)throw new Error('This GLTF requires unsupported extensions. Export a standard geometry GLB.')
 const buffers=json.buffers??[],accessors=json.accessors??[],nodes=json.nodes??[],meshes=json.meshes??[]
 if(![buffers,accessors,nodes,meshes].every(Array.isArray)||nodes.length>2048||meshes.length>2048||accessors.length>8192)throw new Error('GLTF exceeds the scene complexity budget.')
 let bytes=0
 for(const b of buffers){if(b.uri&&!/^data:/i.test(b.uri))throw new Error('External resources are not fetched. Use a self-contained GLB.');if(!Number.isInteger(b.byteLength)||b.byteLength<0||(bytes+=b.byteLength)>25*1024*1024)throw new Error('GLTF buffer budget exceeds 25 MB.')}
 let allocation=0
 for(const a of accessors){const components:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};const size=components[a.type];if(!size||!Number.isInteger(a.count)||a.count<0||a.count>1_500_000||(allocation+=a.count*size*4)>128*1024*1024)throw new Error('GLTF accessor allocation exceeds the import budget.')}
 const visit=(id:number,path:Set<number>,depth:number)=>{if(!Number.isInteger(id)||!nodes[id])throw new Error('Invalid GLTF node reference.');if(path.has(id)||depth>64)throw new Error('GLTF node cycle or nesting limit exceeded.');if(visited.has(id))return;visited.add(id);const children=nodes[id].children??[];if(!Array.isArray(children))throw new Error('Invalid GLTF children.');for(const child of children){if(parents.has(child))throw new Error('GLTF nodes must form a tree.');parents.add(child);visit(child,new Set([...path,id]),depth+1)}}
 const visited=new Set<number>(),parents=new Set<number>();for(let id=0;id<nodes.length;id++)visit(id,new Set(),0)
 let vertices=0,indices=0
 for(const node of nodes){if(node.mesh===undefined)continue;const mesh=meshes[node.mesh];if(!mesh||!Array.isArray(mesh.primitives))throw new Error('Invalid GLTF mesh.');for(const primitive of mesh.primitives){const position=accessors[primitive.attributes?.POSITION];const count=primitive.indices===undefined?position?.count:accessors[primitive.indices]?.count;if(!position||!Number.isInteger(count))throw new Error('Invalid GLTF primitive accessor.');vertices+=position.count;indices+=count;if(vertices>1_500_000||indices>1_500_000)throw new Error('Instanced GLTF geometry exceeds 500,000 triangles or 1.5 million vertices.')}}
 // Avoid decoding texture images: only triangle geometry is imported.
 delete json.images;delete json.textures;delete json.materials;delete json.samplers
 for(const mesh of meshes)for(const primitive of mesh.primitives??[])delete primitive.material
 const text=JSON.stringify(json)
 if(!binary)return text
 const encoded=new TextEncoder().encode(text),padded=Math.ceil(encoded.length/4)*4,tail=new Uint8Array(data,20+jsonLength),result=new Uint8Array(20+padded+tail.length),header=new DataView(result.buffer)
 header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,result.length,true);header.setUint32(12,padded,true);header.setUint32(16,0x4e4f534a,true);result.fill(32,20,20+padded);result.set(encoded,20);result.set(tail,20+padded);return result.buffer
}
