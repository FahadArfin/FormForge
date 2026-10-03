import 'fake-indexeddb/auto'
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {createDocument} from '@formforge/model'
import {db,saveProject,saveVersion,deleteProject,listProjects,listTrashedProjects,restoreProject,listVersions,loadMostRecentProject} from './db'
beforeEach(async()=>{await db.projects.clear();await db.versions.clear()})
it('retains checkpoints in Trash, blocks late saves, and restores intact',async()=>{const doc=createDocument();await saveProject(doc);await saveVersion(doc,'Before changes');await deleteProject(doc.id);expect(await listProjects()).toHaveLength(0);expect(await listTrashedProjects()).toHaveLength(1);expect(await loadMostRecentProject()).toBeUndefined();await expect(saveProject({...doc,name:'late save'})).rejects.toThrow(/Trash/);expect(await listVersions(doc.id)).toHaveLength(1);await restoreProject(doc.id);expect((await listProjects())[0]!.name).toBe(doc.name);expect(await listVersions(doc.id)).toHaveLength(1)})

afterEach(()=>vi.unstubAllGlobals())
it('resumes an older opened project and falls back when it is trashed or missing',async()=>{const old={...createDocument(),updatedAt:'2020-01-01'},recent={...createDocument(),updatedAt:'2026-01-01'};await saveProject(old);await saveProject(recent);vi.stubGlobal('localStorage',{getItem:()=>old.id});expect((await loadMostRecentProject())?.id).toBe(old.id);await deleteProject(old.id);expect((await loadMostRecentProject())?.id).toBe(recent.id);vi.stubGlobal('localStorage',{getItem:()=>'missing'});expect((await loadMostRecentProject())?.id).toBe(recent.id)})
