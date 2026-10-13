import {expect,it} from 'vitest'
import {createNode} from '@formforge/model'
import {shapeDimensions,resizeNodeDimension} from './selectionDimensions'
it('reads transient mirrored scale without changing saved dimensions',()=>{
 const node=createNode('box');node.parameters={...node.parameters,width:80,depth:12,height:40}
 expect(shapeDimensions(node,{x:-1.5,y:2,z:.5})).toEqual({x:120,y:24,z:20})
 expect(shapeDimensions(node)).toEqual({x:80,y:12,z:40})
 expect(node.transform.scale).toEqual({x:1,y:1,z:1})
})
it('resizes along shape axes preserving mirrored signs, rotation and proportions',()=>{
 const node=createNode('box');node.transform.rotation.z=45;node.transform.scale={x:-2,y:3,z:1}
 const before=shapeDimensions(node),next=resizeNodeDimension(node,'x',before.x*2,true)
 expect(next.scale).toEqual({x:-4,y:6,z:2});expect(next.rotation.z).toBe(45)
 expect(()=>resizeNodeDimension(node,'x',NaN,false)).toThrow()
 expect(node.transform.scale.x).toBe(-2)
})
