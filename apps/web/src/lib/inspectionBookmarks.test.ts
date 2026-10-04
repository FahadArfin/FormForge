import {expect,it} from 'vitest'
import {createDocument,parseModelDocument,vec3} from '@formforge/model'
const view={id:'v',name:'Top',position:vec3(0,0,100),target:vec3(),up:vec3(0,1,0),zoom:1}
it('reopens legacy camera bookmarks and complete orthographic inspections',()=>{
 const doc=createDocument();expect(parseModelDocument({...doc,savedViews:[view]}).savedViews![0]!.projection).toBeUndefined()
 const full={...view,projection:'orthographic',span:80,inspection:{section:{enabled:true,axis:'z',offset:4,inverted:false},displayMode:'wireframe',showGrid:false,showReferencePlanes:true,xrayEnabled:false,showResult:false,focusIds:['deleted-node']}}
 expect(parseModelDocument({...doc,savedViews:[full]}).savedViews![0]).toEqual(full)
 expect(()=>parseModelDocument({...doc,savedViews:[{...full,span:-1}]})).toThrow()
 expect(()=>parseModelDocument({...doc,savedViews:[{...full,inspection:{...full.inspection,focusIds:['a','a']}}]})).toThrow()
})
