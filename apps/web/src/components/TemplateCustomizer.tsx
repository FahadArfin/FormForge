import {useEffect,useMemo,useState} from 'react'
import type {MeshPayload,ModelDocument} from '@formforge/model'
import {applyTemplateDimensions,templateDefaults,templateFields,templateLinkIssue,templateValues} from '@/lib/templateRecipes'
import type {StarterId} from '@/lib/templateCatalog'
import {evaluateSnapshot} from '@/geometry/evaluateSnapshot'
import {MeshPreview} from './MeshPreview'

export function TemplateCustomizer({document,onApply}:{document:ModelDocument;onApply:(doc:ModelDocument)=>void}){
 const id=document.template?.id as StarterId,fields=templateFields[id]
 const initial=useMemo(()=>{try{return templateValues(document)}catch{return {}}},[document])
 const [draft,setDraft]=useState<Record<string,string>>(()=>Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,String(v)])))
 const [preview,setPreview]=useState<MeshPayload|null>(null),[previewError,setPreviewError]=useState('')
 useEffect(()=>{setDraft(Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,String(v)])));setPreview(null)},[initial])
 const values=Object.fromEntries(Object.entries(draft).map(([k,v])=>[k,v.trim()===''?NaN:Number(v)]))
 const dirty=fields?.some(f=>values[f.key]!==initial[f.key])??false
 const proposal=useMemo(()=>{if(!dirty)return {document,error:''};try{return {document:applyTemplateDimensions(document,values),error:''}}catch(e){return {document:null,error:(e as Error).message}}},[document,JSON.stringify(draft),dirty])
 const issue=useMemo(()=>templateLinkIssue(document),[document])
 useEffect(()=>{
  setPreview(null);setPreviewError('');if(!dirty||!proposal.document)return
  const abort=new AbortController(),timer=setTimeout(()=>{void evaluateSnapshot(proposal.document!,abort.signal).then(mesh=>{if(!abort.signal.aborted)setPreview(mesh)}).catch(e=>{if(!abort.signal.aborted)setPreviewError((e as Error).message)})},350)
  return()=>{clearTimeout(timer);abort.abort()}
 },[proposal.document,dirty])
 if(!fields)return null
 return <section className="template-customizer workflow-card" aria-label="Template dimensions">
  <div className="workflow-card-heading"><h3>Make it fit</h3><span className="recipe-badge">Linked dimensions · mm</span></div>
  <p>Holes, walls and clearances update together. Apply changes as one undoable edit.</p>
  {issue&&<p role="status" className="workflow-warning">{issue}</p>}
  <form onSubmit={e=>{e.preventDefault();if(proposal.document&&!issue&&!previewError&&preview){onApply(proposal.document);window.dispatchEvent(new CustomEvent('formforge:workflow',{detail:{action:'customized',documentId:document.id}}))}}}>
   <fieldset disabled={!!issue}><div className="template-dimension-grid">{fields.map(f=><label key={f.key}>{f.label}<input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} required value={draft[f.key]??''} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}/></label>)}</div>
   <div className="workflow-actions"><button type="button" className="workflow-text-action" onClick={()=>setDraft(Object.fromEntries(Object.entries(templateDefaults(id)).map(([k,v])=>[k,String(v)])))}>Default size</button><button type="button" className="workflow-text-action" onClick={()=>setDraft(Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,String(v)])))}>Reset draft</button></div></fieldset>
   {(proposal.error||previewError)&&<p role="alert" className="workflow-error">{proposal.error||previewError}</p>}
   {dirty&&!proposal.error&&!issue&&<div className="template-draft-preview">{preview?<MeshPreview mesh={preview} label="Preview of new template dimensions"/>:<p role="status">Building dimension preview…</p>}</div>}
   <button className="workflow-action primary" type="submit" disabled={!dirty||!!issue||!!proposal.error||!!previewError||!preview}>Apply dimensions</button>
  </form>
 </section>
}
