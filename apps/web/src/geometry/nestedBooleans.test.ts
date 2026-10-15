import {expect,it} from 'vitest'
import {createDocument,createNode,parseModelDocument,vec3,type ModelDocument} from '@formforge/model'
import {evaluate} from './geometry.worker'
import {nestCombination,separateOuter} from '@/lib/nestedBooleans'
import {entityNodes} from '@/lib/shapeEntities'
import {patternAssembly} from '@/lib/assemblyTools'
import {insertProject} from '@/lib/insertProject'
import {geometryKey} from '@/lib/annotations'
function cutBox(group:string,x=0){
 const a=createNode('box','add',vec3(x,0,0)),b=createNode('box','cut',vec3(x,0,0))
 for(const [i,n] of [a,b].entries()){n.parameters={...n.parameters,width:i?4:10,depth:i?4:10,height:i?4:10};n.combined=true;n.groupId=group}
 return [a,b]
}
function nested(mode:'union'|'subtract'|'intersect'){
 const [a,b]=cutBox('left'),[c,d]=cutBox('right',5),nodes=[a!,b!,c!,d!]
 return {...createDocument(),nodes:nestCombination(nodes,[a!.id,b!.id,c!.id,d!.id],mode,'outer')}
}
it.each([['union',1436],['subtract',500],['intersect',436]] as const)('preserves cuts in both operands of nested %s',async(mode,volume)=>{
 const doc=nested(mode),roundtrip=parseModelDocument(JSON.parse(JSON.stringify(doc)))
 expect((await evaluate(roundtrip)).volume).toBeCloseTo(volume)
 expect(entityNodes(roundtrip.nodes,roundtrip.nodes[3]!.id)).toHaveLength(4)
 expect(roundtrip.nodes.map(n=>n.boolean)).toEqual(['add','cut','add','cut'])
 const separated=separateOuter(roundtrip.nodes,[roundtrip.nodes[0]!.id])
 expect(separated.every(n=>!n.booleanPath)).toBe(true)
 expect(separated.map(n=>n.groupId)).toEqual(['left','left','right','right'])
})
it('supports repeated joins, excludes and intersects and peels only the outer layer',async()=>{
 let doc=nested('union');const first=doc.nodes
 const tool=createNode('box','cut');tool.parameters={...tool.parameters,width:2,depth:20,height:20};tool.transform.position.x=-4
 doc={...doc,nodes:nestCombination([...doc.nodes,tool],[doc.nodes[0]!.id,tool.id],'subtract','second')}
 expect((await evaluate(doc)).volume).toBeCloseTo(1236)
 const mask=createNode('box');mask.parameters={...mask.parameters,width:100,depth:100,height:100}
 const second=doc.nodes
 doc={...doc,nodes:nestCombination([...doc.nodes,mask],[doc.nodes[0]!.id,mask.id],'intersect','third')}
 expect((await evaluate(doc)).volume).toBeCloseTo(1236)
 const peeled=separateOuter(doc.nodes,[mask.id]);expect(peeled.slice(0,-1)).toEqual(second)
 expect(separateOuter(peeled,[tool.id]).slice(0,4)).toEqual(first)
 expect(geometryKey(doc)).not.toBe(geometryKey({...doc,nodes:peeled}))
})
it('duplicates and inserts nested groups with independent identities',async()=>{
 const doc=nested('subtract'),options={mode:'linear' as const,axis:'x' as const,count:2,spacing:30,degrees:360,origin:vec3()}
 const copy=patternAssembly(doc,[doc.nodes[0]!.id],options)
 expect(copy.nodes).toHaveLength(8)
 expect(copy.nodes[4]!.booleanPath![0]!.id).not.toBe(doc.nodes[0]!.booleanPath![0]!.id)
 expect((await evaluate(parseModelDocument(copy))).volume).toBeCloseTo(1000)
 const inserted=insertProject({...createDocument(),nodes:[]},doc)
 expect(inserted.nodes[0]!.booleanPath![0]!.id).not.toBe(doc.nodes[0]!.booleanPath![0]!.id)
 expect((await evaluate(inserted)).volume).toBeCloseTo(500)
})
it('rejects malformed nested metadata and excessive nesting without mutating source nodes',()=>{
 const doc=nested('union'),bad=structuredClone(doc)
 bad.nodes[1]!.booleanPath![0]!.operation='hull';expect(()=>parseModelDocument(bad)).toThrow(/Boolean/)
 const cyclic=structuredClone(doc);cyclic.nodes[0]!.booleanPath!.push({...cyclic.nodes[0]!.booleanPath![0]!});expect(()=>parseModelDocument(cyclic)).toThrow(/Boolean/)
 const deep=structuredClone(doc);deep.nodes.forEach(n=>n.booleanPath=Array.from({length:32},(_,i)=>({id:'level'+i,operandId:'operand'+i,mode:'add',operation:'boolean'})))
 const source=JSON.stringify(deep),extra=createNode('box')
 expect(()=>nestCombination([...deep.nodes,extra],[deep.nodes[0]!.id,extra.id],'union','overflow')).toThrow(/32-level/)
 expect(JSON.stringify(deep)).toBe(source)
})
it('keeps an empty Boolean operand empty during intersection',async()=>{
 const [a,b]=cutBox('empty');b!.parameters={...a!.parameters};const c=createNode('box')
 const doc:ModelDocument={...createDocument(),nodes:nestCombination([a!,b!,c],[a!.id,c.id],'intersect','empty-intersection')}
 expect((await evaluate(doc)).volume).toBe(0)
})

it('keeps surrounding assembly cutters when nesting groups inside an assembly',async()=>{
 const a=createNode('box'),b=createNode('box','add',vec3(20,0,0)),c=createNode('box','cut'),d=createNode('box','add',vec3(40,0,0))
 for(const n of [a,b,c,d]){n.assemblyPath=['assembly'];n.parameters={...n.parameters,width:n===c?4:10,depth:n===c?4:10,height:n===c?4:10}}
 a.combined=b.combined=true;a.groupId=b.groupId='existing'
 const doc={...createDocument(),nodes:[a,b,c,d]}
 expect((await evaluate(doc)).volume).toBeCloseTo(2936)
 const next={...doc,nodes:nestCombination(doc.nodes,[a.id,b.id,d.id],'union','outer')}
 expect((await evaluate(next)).volume).toBeCloseTo(2936)
 const extra=createNode('box','add',vec3(80,0,0));extra.parameters={...a.parameters}
 expect(()=>nestCombination([...next.nodes,extra],[a.id,extra.id],'union','partial')).toThrow(/complete inserted assembly/)
 const full={...doc,nodes:nestCombination([...next.nodes,extra],[...next.nodes.map(n=>n.id),extra.id],'union','cross')}
 expect((await evaluate(full)).volume).toBeCloseTo(3936)
 const another=createNode('box','add',vec3(120,0,0));another.parameters={...a.parameters}
 const again={...full,nodes:nestCombination([...full.nodes,another],[full.nodes[0]!.id,another.id],'union','cross-again')}
 expect((await evaluate(again)).volume).toBeCloseTo(4936)
 expect(entityNodes(again.nodes,another.id)).toHaveLength(6)
})

it('keeps attached holes in the nested entity selection and evaluated preview',async()=>{
 const {createAttachedHole}=await import('@/lib/attachedHoles')
 const doc=nested('union'),target=doc.nodes[0]!,hole=createAttachedHole(target,'z+',1,3,3,'through',10)
 const next={...doc,nodes:[...doc.nodes,hole]}
 expect(entityNodes(next.nodes,hole.id)).toHaveLength(5)
 expect(hole.booleanPath).toEqual(target.booleanPath)
 const preview={...next,nodes:entityNodes(next.nodes,target.id)}
 expect((await evaluate(preview)).volume).toBeCloseTo((await evaluate(next)).volume)
})

it('preserves cutters across deeper inserted-assembly boundaries',async()=>{
 const a=createNode('box'),b=createNode('box','add',vec3(20,0,0)),c=createNode('box','cut'),d=createNode('box','add',vec3(40,0,0))
 for(const n of [a,b,c,d]){n.assemblyPath=['inserted',n===d?'right':'left'];n.parameters={...n.parameters,width:n===c?4:10,depth:n===c?4:10,height:n===c?4:10}}
 a.combined=b.combined=true;a.groupId=b.groupId='existing'
 const doc={...createDocument(),nodes:[a,b,c,d]}
 expect(()=>nestCombination(doc.nodes,[a.id,b.id,d.id],'union','partial')).toThrow(/complete inserted assembly/)
 const full={...doc,nodes:nestCombination(doc.nodes,[a.id,b.id,c.id,d.id],'union','outer')}
 expect((await evaluate(full)).volume).toBeCloseTo(2936)
 const tool=createNode('box','add',vec3(80,0,0));tool.parameters={...a.parameters};tool.assemblyPath=['inserted','third']
 const again={...full,nodes:nestCombination([...full.nodes,tool],[full.nodes[0]!.id,tool.id],'union','again')}
 expect((await evaluate(again)).volume).toBeCloseTo(3936)
})
