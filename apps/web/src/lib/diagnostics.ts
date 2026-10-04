type Diagnostic={event:'build'|'import'|'export'|'ui-error'|'first-editable'|'template-to-export';outcome:'success'|'failure';milliseconds:number;at:string}
const consentKey='formforge.diagnostics.enabled',dataKey='formforge.diagnostics.v1'
export function diagnosticsEnabled(){try{return localStorage.getItem(consentKey)==='true'}catch{return false}}
export function setDiagnosticsEnabled(enabled:boolean){try{localStorage.setItem(consentKey,String(enabled));if(!enabled){localStorage.removeItem(dataKey);journeys.clear()}}catch{}}
export function readDiagnostics():Diagnostic[]{try{const data=JSON.parse(localStorage.getItem(dataKey)??'[]');return Array.isArray(data)?data.slice(-100):[]}catch{return []}}
export function recordDiagnostic(event:Diagnostic['event'],outcome:Diagnostic['outcome'],milliseconds=0){if(!diagnosticsEnabled())return;try{const entry:Diagnostic={event,outcome,milliseconds:Math.max(0,Math.min(600000,Math.round(milliseconds))),at:new Date().toISOString()};localStorage.setItem(dataKey,JSON.stringify([...readDiagnostics(),entry].slice(-100)))}catch{}}

const journeys=new Map<string,number>()
export function beginTemplateJourney(id:string){if(!diagnosticsEnabled())return;journeys.clear();journeys.set(id,performance.now())}
export function completeTemplateJourney(id:string){const start=journeys.get(id);if(start!==undefined){recordDiagnostic('template-to-export','success',performance.now()-start);journeys.delete(id)}}
