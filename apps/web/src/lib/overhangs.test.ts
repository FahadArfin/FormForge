import {expect,it} from 'vitest'
import {analyzeOverhangs} from './overhangs'
const triangle=(z:number,up=false)=>({positions:new Float32Array([0,0,z,0,10,z,10,0,z]),indices:new Uint32Array(up?[0,2,1]:[0,1,2])})
it('flags raised undersides, excludes actual bed contact, and ignores upward faces',()=>{
 expect(analyzeOverhangs(triangle(5),45).faceCount).toBe(1)
 expect(analyzeOverhangs(triangle(0),45).faceCount).toBe(0)
 expect(analyzeOverhangs(triangle(-5),45).faceCount).toBe(1)
 expect(analyzeOverhangs(triangle(5,true),45).faceCount).toBe(0)
 expect(analyzeOverhangs(triangle(5),45).area).toBe(50)
})
it('uses degrees from the bed and does not modify source geometry',()=>{
 const slope={positions:new Float32Array([0,0,5,0,10,15,10,0,5]),indices:new Uint32Array([0,1,2])}
 const before=Array.from(slope.positions)
 expect(analyzeOverhangs(slope,44).faceCount).toBe(0)
 expect(analyzeOverhangs(slope,46).faceCount).toBe(1)
 expect(Array.from(slope.positions)).toEqual(before)
})
it('reports invalid and excessive geometry instead of a false pass',()=>{
 expect(()=>analyzeOverhangs({positions:new Float32Array([NaN,0,0]),indices:new Uint32Array([0,0,0])},45)).toThrow()
 expect(()=>analyzeOverhangs({...triangle(5),indices:new Uint32Array([0,1,30])},45)).toThrow()
 expect(()=>analyzeOverhangs({...triangle(5),indices:new Uint32Array(1500003)},45)).toThrow(/500,000/)
 expect(()=>analyzeOverhangs(triangle(5),91)).toThrow()
})
