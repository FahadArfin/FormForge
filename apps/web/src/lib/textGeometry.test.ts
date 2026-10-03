import {expect,it} from 'vitest'
import {createTextNode} from './textGeometry'
import {analyzeMesh} from './meshTools'
it('builds closed glyphs with counters and stores editable source',()=>{const n=createTextNode({content:'B8O',size:10,depth:2,font:'helvetiker'});expect(n.text?.content).toBe('B8O');expect(analyzeMesh(n.mesh!).watertight).toBe(true);expect(n.mesh!.positions.every(Number.isFinite)).toBe(true)})
it('rejects unsupported glyphs and unbounded labels',()=>{expect(()=>createTextNode({content:'🙂',size:10,depth:2,font:'helvetiker'})).toThrow('font');expect(()=>createTextNode({content:'X'.repeat(81),size:10,depth:2,font:'helvetiker'})).toThrow('80')})
