import { describe, expect, it } from 'vitest'
import { createDocument, createNode } from '@formforge/model'
import { engineeringFindings } from './engineeringFindings'
import { createAttachedHole } from './attachedHoles'
import { evaluate } from '../geometry/geometry.worker'

describe('engineering findings', () => {
  it('measures resolved cutter spacing against a configurable tolerance', () => {
    const document = createDocument(), a = createNode('cylinder', 'cut'), b = createNode('cylinder', 'cut')
    document.namedParameters = [{id:'spacing', name:'Spacing', value:25, expression:'', unit:'mm'}]
    a.transform.position = {x:0,y:0,z:0}; b.transform.position = {x:2,y:0,z:0}
    b.parameterBindings = {positionX:'Spacing'}; document.nodes = [a,b]
    const options = {holeIds:[a.id,b.id] as [string,string], targetSpacingMm:25.1, toleranceMm:.2}
    const result = engineeringFindings(document,null,options)
    expect(result.find(f=>f.id==='hole-spacing')).toMatchObject({value:25,status:'pass',evidence:'deterministic'})
    expect(engineeringFindings(document,null,{...options,toleranceMm:.01}).find(f=>f.id==='hole-spacing')?.status).toBe('warning')
    expect(b.transform.position.x).toBe(2)
  })
  it('resolves attached holes and distinguishes parallel axes from coaxial alignment', () => {
    const target=createNode('box');target.parameters.width=50;target.parameters.depth=40;target.transform.rotation.y=90
    const a=createAttachedHole(target,'z+',4,-10,0,'through',5), b=createAttachedHole(target,'z+',4,10,0,'through',5)
    const result=engineeringFindings({...createDocument(),nodes:[target,a,b]},null,{holeIds:[a.id,b.id]})
    expect(result.find(f=>f.id==='hole-spacing')?.value).toBeCloseTo(20)
    expect(result.find(f=>f.id==='hole-parallelism')).toMatchObject({value:0,status:'pass'})
    expect(result.find(f=>f.id==='hole-coaxiality')).toMatchObject({value:20,status:'warning'})
  })
  it('never infers hole features from imported meshes or unresolved bindings', () => {
    const mesh=createNode('mesh'), a=createNode('cylinder','cut'), b=createNode('cylinder','cut')
    expect(engineeringFindings({...createDocument(),nodes:[mesh]},null).find(f=>f.id==='hole-spacing')?.status).toBe('unknown')
    a.parameterBindings={positionX:'Missing'}
    expect(engineeringFindings({...createDocument(),nodes:[a,b]},null,{holeIds:[a.id,b.id]}).find(f=>f.id==='hole-spacing')?.status).toBe('unknown')
  })
  it('compares axis angle to the configured angular tolerance', () => {
    const a=createNode('cylinder','cut'),b=createNode('cylinder','cut');b.transform.rotation.y=5
    const doc={...createDocument(),nodes:[a,b]}
    expect(engineeringFindings(doc,null,{alignmentToleranceDegrees:1}).find(f=>f.id==='hole-parallelism')?.status).toBe('warning')
    expect(engineeringFindings(doc,null,{alignmentToleranceDegrees:6}).find(f=>f.id==='hole-parallelism')?.status).toBe('pass')
  })
  it('reports current evaluated dimensions and unknown physical validation', async () => {
    const box=createNode('box');box.parameters={...box.parameters,width:300,depth:20,height:10}
    const doc={...createDocument(),nodes:[box]}, mesh=await evaluate(doc), findings=engineeringFindings(doc,mesh)
    expect(findings.find(f=>f.id==='build-volume')?.status).toBe('warning')
    expect(findings.find(f=>f.id==='physical-fit')).toMatchObject({status:'unknown',evidence:'unverified-ai'})
    expect(engineeringFindings(doc,null).find(f=>f.id==='build-volume')?.status).toBe('unknown')
  })
})
