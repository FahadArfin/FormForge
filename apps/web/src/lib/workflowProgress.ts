import type {ModelDocument} from '@formforge/model'
import {geometryKey} from './annotations'
export const checksKey=(doc:ModelDocument)=>`${geometryKey(doc)}:${JSON.stringify(doc.printer)}`
export type WorkflowProgress={customized:boolean;checkedKey?:string;exportedKey?:string;hidden:boolean}
const empty:WorkflowProgress={customized:false,hidden:false}
const key='formforge.guided-workflow.v1'
export function readProgress(id:string):WorkflowProgress{try{const p=JSON.parse(localStorage.getItem(key)??'{}')[id];return {...empty,...(p&&typeof p==='object'?p:{})}}catch{return {...empty}}}
export function saveProgress(id:string,progress:WorkflowProgress){try{const all=JSON.parse(localStorage.getItem(key)??'{}');delete all[id];all[id]=progress;localStorage.setItem(key,JSON.stringify(Object.fromEntries(Object.entries(all).slice(-100))))}catch{/* Guidance never blocks editing when storage is unavailable. */}}
