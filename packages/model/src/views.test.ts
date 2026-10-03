import {expect,it} from 'vitest'
import {createDocument} from './defaults.js'
import {parseModelDocument} from './schema.js'
const view={id:'v',name:'Front detail',position:{x:0,y:-50,z:20},target:{x:0,y:0,z:0},up:{x:0,y:0,z:1},zoom:1}
it('keeps optional saved views in editable backups and rejects invalid camera poses',()=>{expect(parseModelDocument({...createDocument(),savedViews:[view]}).savedViews).toEqual([view]);for(const bad of [{...view,target:view.position},{...view,up:{x:0,y:0,z:0}},{...view,zoom:NaN},{...view,name:'x'.repeat(61)}])expect(()=>parseModelDocument({...createDocument(),savedViews:[bad]})).toThrow();expect(()=>parseModelDocument({...createDocument(),savedViews:Array(13).fill(view)})).toThrow();expect(parseModelDocument(createDocument()).savedViews).toBeUndefined()})
