import {expect,it} from 'vitest'
import {createTextNode} from './textGeometry'
import {analyzeMesh} from './meshTools'
it('builds closed glyphs with counters and stores editable source',()=>{const n=createTextNode({content:'B8O',size:10,depth:2,font:'helvetiker'});expect(n.text?.content).toBe('B8O');expect(analyzeMesh(n.mesh!).watertight).toBe(true);expect(n.mesh!.positions.every(Number.isFinite)).toBe(true)})
it('rejects unsupported glyphs and unbounded labels',()=>{expect(()=>createTextNode({content:'🙂',size:10,depth:2,font:'helvetiker'})).toThrow('font');expect(()=>createTextNode({content:'X'.repeat(81),size:10,depth:2,font:'helvetiker'})).toThrow('80')})

it('keeps the original contact plane when text depth or operation changes',async()=>{
 const {updatedTextTransform}=await import('./textGeometry')
 const node=createTextNode({content:'A',size:8,depth:2,font:'helvetiker'});node.transform.position={x:0,y:0,z:1}
 expect(updatedTextTransform(node,0.1,'add').position.z).toBeCloseTo(0.05)
 expect(updatedTextTransform(node,3,'cut').position.z).toBeCloseTo(-1.5)
 node.transform.rotation={x:90,y:0,z:0};node.transform.position={x:0,y:-1,z:0}
 expect(updatedTextTransform(node,4,'add').position.y).toBeCloseTo(-2)
})
