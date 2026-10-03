import { JSDOM } from 'jsdom'
import { vi } from 'vitest'
vi.stubGlobal('DOMParser', new JSDOM().window.DOMParser)
import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parse3mf, prepareImport, meshBounds } from './importReview'
const model = (unit = 'inch', content = '<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="2" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh>') => zipSync({'3D/3dmodel.model': strToU8(`<model unit="${unit}"><resources><object id="1">${content}</object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 2 0 0"/></build></model>`)})
describe('reviewed mesh imports', () => {
 it('rejects an archive whose declared size hides larger inflated content',()=>{
  const z=zipSync({'3D/3dmodel.model':strToU8('<model/>'+' '.repeat(1024*1024))}),view=new DataView(z.buffer)
  for(let i=0;i<z.length-28;i++){const signature=view.getUint32(i,true);if(signature===0x04034b50)view.setUint32(i+22,8,true);if(signature===0x02014b50)view.setUint32(i+24,8,true)}
  expect(()=>parse3mf(z)).toThrow(/size|expanded|expands/i)
 })
 it('honors 3MF declared units and build transforms', () => { const mesh=parse3mf(model());expect(mesh.positions[0]).toBeCloseTo(50.8);expect(meshBounds(mesh).size.y).toBeCloseTo(50.8) })
 it('rejects invalid indices, cycles and required extensions', () => {
  expect(()=>parse3mf(model('mm'))).toThrow(/unit/i)
  expect(()=>parse3mf(model('millimeter','<components><component objectid="1"/></components>'))).toThrow(/cyclic/i)
  const broken=model('millimeter'); const bad=zipSync({'3D/3dmodel.model':strToU8('<model requiredextensions="p"><resources/><build/></model>')});expect(()=>parse3mf(bad)).toThrow(/extension/i);expect(broken.length).toBeGreaterThan(0)
 })
 it('converts unitless input without mutating it, then centers and drops it', () => { const mesh={positions:[0,0,0,1,0,0,0,2,1],indices:[0,1,2]};const next=prepareImport(mesh,25.4,'y');expect(meshBounds(next).size.z).toBeCloseTo(50.8);expect(meshBounds(next).min.z).toBe(0);expect(mesh.positions[3]).toBe(1);expect(()=>prepareImport(mesh,Infinity,'z')).toThrow() })
})
