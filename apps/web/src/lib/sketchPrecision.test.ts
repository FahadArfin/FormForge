import {expect,it} from 'vitest'
import {snapSketchPoint,constraintReferences,resizeSketchEdge} from './sketchPrecision'
const square=[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}]
it('keeps aligned preview and clicked points on the same grid rule',()=>{
 expect(snapSketchPoint({x:9.4,y:3.4},{x:0.2,y:2.3},1,true)).toEqual({point:{x:9,y:2.3},label:'Horizontal · grid 1 mm'})
 expect(snapSketchPoint({x:9.4,y:3.4},undefined,null,false).point).toEqual({x:9.4,y:3.4})
})
it('maps closing-edge constraints separately from point constraints',()=>{
 expect(constraintReferences({type:'parallel',a:3,b:1},4)).toEqual({points:[3,0,1,2],edges:[3,1]})
 expect(constraintReferences({type:'distance',a:3,b:1},4)).toEqual({points:[3,1],edges:[]})
})
it('replaces an existing edge distance and rejects invalid lengths without mutating source',()=>{
 const constraints=[{type:'distance' as const,a:3,b:0,value:20}]
 const resized=resizeSketchEdge(square,3,30,constraints)
 expect(resized.constraints).toHaveLength(1)
 expect(Math.hypot(resized.points[3]!.x-resized.points[0]!.x,resized.points[3]!.y-resized.points[0]!.y)).toBeCloseTo(30,3)
 expect(()=>resizeSketchEdge(square,0,0,[])).toThrow()
 expect(square[3]).toEqual({x:0,y:20});expect(constraints[0]!.value).toBe(20)
})
