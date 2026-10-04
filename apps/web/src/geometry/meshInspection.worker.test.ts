import { describe, expect, it } from 'vitest'
import { runMeshInspection } from './meshInspection.worker'

describe('mesh inspection worker boundary',()=>{
 it('cleans damaged source faces while preserving masks without modifying input',()=>{
  const mesh={positions:[0,0,0,1,0,0,0,1,0,0,0,0],indices:[3,1,2,-1,1,2],mask:[.2,0,0,1]}
  const result=runMeshInspection({kind:'doctor',mesh})
  expect(result).toMatchObject({before:{invalidTriangles:1},mesh:{indices:[0,1,2],mask:[1,0,0]}})
  expect(mesh.indices).toEqual([3,1,2,-1,1,2])
 })
 it('rejects an oversized posted job even when a caller bypasses the client',()=>{
  expect(()=>runMeshInspection({kind:'doctor',mesh:{positions:[0,0,0],indices:new Array(300003).fill(0)}})).toThrow(/100,000/)
 })
 it('computes properties from typed evaluated coordinates without trusting the engine volume',()=>{
  const mesh={positions:new Float32Array([0,0,0,1,0,0,0,1,0,0,0,1]),indices:new Uint32Array([0,2,1,0,1,3,0,3,2,1,2,3]),volume:999}
  const result=runMeshInspection({kind:'properties',mesh})
  expect(result).toMatchObject({volume:1/6,centroid:{x:.25,y:.25,z:.25}})
 })
})
