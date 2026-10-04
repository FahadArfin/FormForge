import 'fake-indexeddb/auto'
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {createDocument,createNode} from '@formforge/model'
import {db,saveProject,saveVersion,deleteProject,listProjects,listTrashedProjects,restoreProject,listVersions,loadMostRecentProject,listAutomaticRecovery} from './db'
beforeEach(async()=>{await db.projects.clear();await db.versions.clear();await db.recovery.clear()})
it('retains checkpoints in Trash, blocks late saves, and restores intact',async()=>{const doc=createDocument();await saveProject(doc);await saveVersion(doc,'Before changes');await deleteProject(doc.id);expect(await listProjects()).toHaveLength(0);expect(await listTrashedProjects()).toHaveLength(1);expect(await loadMostRecentProject()).toBeUndefined();await expect(saveProject({...doc,name:'late save'})).rejects.toThrow(/Trash/);expect(await listVersions(doc.id)).toHaveLength(1);await restoreProject(doc.id);expect((await listProjects())[0]!.name).toBe(doc.name);expect(await listVersions(doc.id)).toHaveLength(1)})

afterEach(()=>vi.unstubAllGlobals())
it('preserves the previous geometry when an imported backup reuses revision metadata',async()=>{
 const doc={...createDocument(),nodes:[createNode('box')]};await saveProject(doc)
 const imported=structuredClone(doc);imported.nodes[0]!.parameters.width=35
 await saveProject(imported)
 expect((await listAutomaticRecovery(doc.id))[0]!.document.nodes[0]!.parameters.width).toBe(doc.nodes[0]!.parameters.width)
 expect((await db.projects.get(doc.id))!.document.nodes[0]!.parameters.width).toBe(35)
})
it('rolls back both the active project and recovery history when a save transaction fails',async()=>{
 const doc=createDocument();await saveProject(doc)
 const put=vi.spyOn(db.projects,'put').mockRejectedValueOnce(new Error('Storage full'))
 await expect(saveProject({...doc,revision:1,name:'Unsaved change'})).rejects.toThrow('Storage full')
 put.mockRestore()
 expect((await db.projects.get(doc.id))!.document).toEqual(doc)
 expect(await listAutomaticRecovery(doc.id)).toHaveLength(0)
})
it('keeps three prior durable revisions and retains them in Trash',async()=>{
 const doc=createDocument();await saveProject(doc)
 for(let revision=1;revision<=5;revision++)await saveProject({...doc,revision,name:`Revision ${revision}`,updatedAt:new Date(1000*revision).toISOString()})
 const copies=await listAutomaticRecovery(doc.id)
 expect(copies.map(c=>c.document.revision)).toEqual([4,3,2])
 await saveProject({...doc,revision:5,name:'Revision 5',updatedAt:new Date(5000).toISOString()})
 expect(await listAutomaticRecovery(doc.id)).toHaveLength(3)
 await deleteProject(doc.id);expect(await listAutomaticRecovery(doc.id)).toHaveLength(3)
 await restoreProject(doc.id);expect((await listProjects())[0]!.document.revision).toBe(5)
})
it('resumes an older opened project and falls back when it is trashed or missing',async()=>{const old={...createDocument(),updatedAt:'2020-01-01'},recent={...createDocument(),updatedAt:'2026-01-01'};await saveProject(old);await saveProject(recent);vi.stubGlobal('localStorage',{getItem:()=>old.id});expect((await loadMostRecentProject())?.id).toBe(old.id);await deleteProject(old.id);expect((await loadMostRecentProject())?.id).toBe(recent.id);vi.stubGlobal('localStorage',{getItem:()=>'missing'});expect((await loadMostRecentProject())?.id).toBe(recent.id)})
