import {expect,it,vi} from 'vitest'
import {createDocument,createNode} from '@formforge/model'
import {useEditor} from '@/store/editor'
import {useInspection} from '@/store/inspection'
import {captureInspection,restoreInspection} from './inspectionBookmarks'
vi.mock('@/lib/db',()=>({saveProject:vi.fn(),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
it('restores complete inspection without changing geometry or leaving an unrelated editable selection',()=>{
 const a=createNode('box'),b=createNode('sphere'),doc={...createDocument(),nodes:[a,b]}
 useEditor.setState({document:doc,selectedNodeId:b.id,selectedNodeIds:[b.id],tool:'move',selectedMeshFaces:[1],showResult:true})
 const bookmark={...captureInspection(),section:{enabled:true,axis:'z' as const,offset:5,inverted:true},displayMode:'wireframe' as const,focusIds:[a.id,'missing']}
 restoreInspection(bookmark)
 expect(useEditor.getState().document).toBe(doc);expect(useEditor.getState().selectedNodeIds).toEqual([]);expect(useEditor.getState().selectedNodeId).toBeNull();expect(useEditor.getState().selectedMeshFaces).toEqual([])
 expect(useInspection.getState().focus?.ids).toEqual([a.id]);expect(useInspection.getState().section).toEqual(bookmark.section);expect(useEditor.getState().showResult).toBe(false);expect(useEditor.getState().displayMode).toBe('wireframe');expect(useEditor.getState().notice).toMatch(/missing/)
})
