import {expect,it} from 'vitest'
import {encodeSnapshot,decodeSnapshot} from '../../../cloud/src/snapshotCodec'
it('reads legacy JSON and compresses repetitive mesh payloads losslessly',()=>{
 const doc={name:'測定 · test',mesh:Array.from({length:3000},(_,i)=>i%36)},json=JSON.stringify(doc),encoded=encodeSnapshot(json)
 expect(new TextEncoder().encode(encoded).length).toBeLessThan(json.length/2)
 expect(decodeSnapshot(encoded)).toEqual(doc);expect(decodeSnapshot(json)).toEqual(doc)
})
it('rejects oversized decoded claims and truncated envelopes',()=>{
 expect(()=>decodeSnapshot(JSON.stringify({formforgeStorage:'gzip-v1',rawBytes:4_000_001,data:''}))).toThrow()
 const envelope=JSON.parse(encodeSnapshot(JSON.stringify({a:'x'.repeat(1000)})));envelope.rawBytes=1;expect(()=>decodeSnapshot(JSON.stringify(envelope))).toThrow()
})
