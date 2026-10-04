import {useEffect,useRef,useState} from 'react'
import {useEditor} from '@/store/editor'
import {geometryKey} from '@/lib/annotations'
import {checksKey,readProgress,saveProgress} from '@/lib/workflowProgress'
export function WorkflowGuide(){
 const doc=useEditor(s=>s.document),[progress,setProgress]=useState(()=>readProgress(doc.id)),previous=useRef(doc)
 const key=geometryKey(doc),reviewKey=checksKey(doc)
 useEffect(()=>{setProgress(readProgress(doc.id));previous.current=doc},[doc.id])
 useEffect(()=>{if(previous.current.id===doc.id&&previous.current.nodes!==doc.nodes&&previous.current.nodes.length){setProgress(p=>{const n={...p,customized:true};saveProgress(doc.id,n);return n})}previous.current=doc},[doc])
 useEffect(()=>{
  const event=(e:Event)=>{const d=(e as CustomEvent<{action:string;documentId:string;key?:string}>).detail;if(d.documentId!==doc.id)return
   setProgress(p=>{const n={...p,...(d.action==='customized'?{customized:true}:d.action==='checked'?{checkedKey:d.key}:d.action==='exported'?{exportedKey:d.key}:{})};saveProgress(doc.id,n);return n})}
  window.addEventListener('formforge:workflow',event);return()=>window.removeEventListener('formforge:workflow',event)
 },[doc.id])
 const hide=(hidden:boolean)=>setProgress(p=>{const n={...p,hidden};saveProgress(doc.id,n);return n})
 const open=(tab:string)=>window.dispatchEvent(new CustomEvent('formforge:open-inspector',{detail:{tab}}))
 if(progress.hidden)return <div className="workflow-guide collapsed"><button onClick={()=>hide(false)}>Show part guide</button></div>
 return <nav className="workflow-guide" aria-label="Part workflow"><div><span className="workflow-guide-label">Your next step</span><button className={progress.customized?'complete':''} onClick={()=>open('model')}><span>{progress.customized?'✓':'1'}</span> Customize</button><button className={progress.checkedKey===reviewKey?'complete':''} onClick={()=>open('print')}><span>{progress.checkedKey===reviewKey?'✓':'2'}</span> Check</button><button className={progress.exportedKey===key?'complete':''} onClick={()=>window.dispatchEvent(new Event('formforge:open-export'))}><span>{progress.exportedKey===key?'✓':'3'}</span> Export</button></div><small>{progress.exportedKey===key?'Download requested · finish in your slicer':progress.checkedKey===reviewKey?'Checks reviewed · choose a format':progress.customized?'Dimensions changed · review this version':'Start with dimensions or select a shape'}</small><button className="guide-dismiss" aria-label="Hide part guide" onClick={()=>hide(true)}>×</button></nav>
}
