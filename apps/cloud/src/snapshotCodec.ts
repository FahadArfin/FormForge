import {gzipSync,gunzipSync,strToU8,strFromU8} from 'fflate'
const LIMIT=4_000_000
/** Internal R2 envelope only. Public writes remain bounded, uncompressed JSON. */
export function encodeSnapshot(json:string):string{
 const raw=strToU8(json);if(raw.length>LIMIT)throw new Error('Snapshot exceeds the decoded size limit.')
 const compressed=gzipSync(raw,{level:6}),chunks:string[]=[]
 for(let i=0;i<compressed.length;i+=8192)chunks.push(String.fromCharCode(...compressed.subarray(i,i+8192)))
 const envelope=JSON.stringify({formforgeStorage:'gzip-v1',rawBytes:raw.length,data:btoa(chunks.join(''))})
 return strToU8(envelope).length<raw.length?envelope:json
}
export function decodeSnapshot(stored:string):unknown{
 if(strToU8(stored).length>LIMIT)throw new Error('Stored snapshot exceeds the size limit.')
 const envelope=JSON.parse(stored)
 if(envelope?.formforgeStorage!=='gzip-v1')return envelope
 const size=envelope.rawBytes
 if(!Number.isSafeInteger(size)||size<1||size>LIMIT||typeof envelope.data!=='string'||envelope.data.length>LIMIT)throw new Error('Invalid compressed snapshot size.')
 const bytes=Uint8Array.from(atob(envelope.data),c=>c.charCodeAt(0))
 if(bytes.length<18||new DataView(bytes.buffer).getUint32(bytes.length-4,true)!==size)throw new Error('Invalid compressed snapshot length.')
 const decoded=gunzipSync(bytes,{out:new Uint8Array(size)})
 if(decoded.length!==size)throw new Error('Incomplete compressed snapshot.')
 return JSON.parse(strFromU8(decoded))
}
