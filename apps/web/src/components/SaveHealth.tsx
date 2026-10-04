import {useMemo} from 'react'
import {useEditor} from '@/store/editor'
import {documentFingerprint,type SavedCloudLink} from '@/lib/saveHealth'
export function SaveHealth({link}:{link:SavedCloudLink|null}){
 const doc=useEditor(s=>s.document),status=useEditor(s=>s.saveStatus)
 const current=useMemo(()=>link?.localId===doc.id&&link.documentKey===documentFingerprint(doc),[doc,link])
 const text=status==='error'?'Device save needs attention':status!=='saved'?'Saving on this device…':current?`Saved here · cloud v${link!.revision} matches`:link?.localId===doc.id?`Saved here · cloud v${link.revision} needs update`:'Saved on this device · no linked cloud backup'
 return <button className="save-health" title="Open saving and backup options" onClick={()=>window.dispatchEvent(new Event(status==='error'?'formforge:recovery':'formforge:open-cloud'))}>{text}</button>
}
