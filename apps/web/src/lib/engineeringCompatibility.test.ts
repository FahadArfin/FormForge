import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import {expect,it} from 'vitest'
import {createDocument,parseModelDocument,type ModelDocument} from '@formforge/model'
import {db} from './db'
import {encodeSnapshot,decodeSnapshot} from '../../../cloud/src/snapshotCodec'
it('upgrades legacy FormForge projects, checkpoints and recovery without changing identity',async()=>{
 db.close();await Dexie.delete('formforge')
 const legacy=new Dexie('formforge');legacy.version(4).stores({projects:'id, name, collectionId, updatedAt, deletedAt',versions:'id, projectId, createdAt',collections:'id, name, createdAt',recovery:'id, projectId, createdAt'})
 const doc=createDocument(),version={id:'checkpoint',projectId:doc.id,document:doc,label:'Legacy',createdAt:doc.createdAt}
 await legacy.table('projects').put({id:doc.id,name:doc.name,document:doc,updatedAt:doc.updatedAt})
 await legacy.table('versions').put(version);await legacy.table('recovery').put({...version,id:'recovery'})
 legacy.close();await db.open()
 expect((await db.projects.get(doc.id))?.document).toEqual(doc)
 expect((await db.versions.get('checkpoint'))?.document).toEqual(doc)
 expect((await db.recovery.get('recovery'))?.document).toEqual(doc)
 expect(await db.engineeringPlans.count()).toBe(0)
 db.close()
})
it('round-trips legacy and additive engineering metadata through existing cloud envelope and editable JSON',()=>{
 const legacy=createDocument()
 const extended:ModelDocument={...legacy,engineering:{version:1,history:[{title:'Measured edit',appliedAt:new Date().toISOString(),operations:[{type:'set-parameter',name:'width',expression:'40',unit:'mm'}],assumptions:[]}]},slicerResult:{version:1,association:'user-confirmed',fileName:'test.gcode',importedAt:new Date().toISOString(),slicer:'PrusaSlicer',filamentGrams:12,jobFingerprint:'snapshot'},printer:{...legacy.printer,usableBedExclusions:[{x:0,y:0,width:18,depth:28,reason:'Cutter'}]}}
 for(const doc of [legacy,extended])expect(parseModelDocument(decodeSnapshot(encodeSnapshot(JSON.stringify(doc))))).toEqual(parseModelDocument(JSON.parse(JSON.stringify(doc))))
})
