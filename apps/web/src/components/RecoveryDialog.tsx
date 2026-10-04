import {useEffect,useState} from 'react'
import {parseModelDocument,type ModelDocument} from '@formforge/model'
import {listAutomaticRecovery,type ProjectVersion} from '@/lib/db'
import {WorkspaceDialog} from './WorkspaceDialog'
import {downloadBlob,safeFilename} from '@/lib/download'

export function RecoveryDialog({onClose,onOpen}:{onClose:()=>void;onOpen:(document:ModelDocument)=>Promise<void>}) {
 const [copies,setCopies]=useState<ProjectVersion[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let current=true;void listAutomaticRecovery().then(v=>{if(current)setCopies(v)}).catch(()=>{if(current)setError('Could not read recovery copies. Your browser storage may be unavailable.')});return()=>{current=false}},[])
 return <WorkspaceDialog title="Automatic recovery copies" description="The previous three saved revisions of each project stay on this device. Open a separate copy to inspect or recover your work." onClose={onClose}>
  <p>Copies are created after a successful save. Changes that were never saved cannot be recovered here. Keep downloaded backups for protection outside this browser.</p>
  {error&&<p role="alert">{error}</p>}{copies===null&&!error&&<p role="status">Loading recovery copies…</p>}
  {copies?.length===0&&<p>No earlier revisions yet. Recovery copies appear after you edit and save a project.</p>}
  <ul className="recovery-list">{copies?.map(copy=><li key={copy.id}><strong>{copy.document.name}</strong><span>Revision {copy.document.revision} · {new Date(copy.createdAt).toLocaleString()}</span><div>
    <button className="studio-secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const document=parseModelDocument(structuredClone(copy.document)),now=new Date().toISOString();await onOpen({...document,id:crypto.randomUUID(),name:`${document.name} · Recovered`,revision:0,createdAt:now,updatedAt:now})}catch(e){setError(e instanceof Error?e.message:'Could not open this recovery copy.')}finally{setBusy(false)}}}>Open separate copy</button>
    <button className="studio-secondary" onClick={()=>downloadBlob(new Blob([JSON.stringify(copy.document)],{type:'application/json'}),`${safeFilename(copy.document.name)}-recovery.forge.json`)}>Download backup</button>
  </div></li>)}</ul>
 </WorkspaceDialog>
}
