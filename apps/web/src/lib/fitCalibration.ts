export interface FitCalibration {
 id:string;name:string;printerName:string;materialName:string;nozzleDiameter:number;layerHeight:number;nominalDiameter:number
 orientation:'vertical-hole';fit:'snug'|'sliding'|'loose';diametralClearance:number;recordedAt:string;notes:string
}
const key='formforge.fit-calibrations.v1'
export function parseCalibration(value:unknown):FitCalibration {
 if(!value||typeof value!=='object')throw new Error('Calibration record is invalid.')
 const v=value as Record<string,unknown>
 const text=(name:string,max:number)=>{const value=v[name];if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Check ${name}.`);return value.trim()}
 const number=(name:string,min:number,max:number)=>{const value=v[name];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`Check ${name}: use ${min} to ${max}.`);return value}
 if(v.orientation!=='vertical-hole'||typeof v.fit!=='string'||!['snug','sliding','loose'].includes(v.fit))throw new Error('Choose a vertical-hole fit result.')
 const notes=v.notes??'';if(typeof notes!=='string'||notes.length>500)throw new Error('Keep notes under 500 characters.')
 const recordedAt=text('recordedAt',40);if(!Number.isFinite(Date.parse(recordedAt)))throw new Error('Recording date is invalid.')
 return {id:text('id',80),name:text('name',80),printerName:text('printerName',100),materialName:text('materialName',80),nozzleDiameter:number('nozzleDiameter',.1,2),layerHeight:number('layerHeight',.02,1),nominalDiameter:number('nominalDiameter',1,50),orientation:'vertical-hole',fit:v.fit as FitCalibration['fit'],diametralClearance:number('diametralClearance',0,3),recordedAt,notes}
}
export function calibrationMatches(record:FitCalibration,printer:{name:string;nozzleDiameter:number},material:string){return record.printerName===printer.name&&record.nozzleDiameter===printer.nozzleDiameter&&record.materialName===material}
function validateCollection(value:unknown):FitCalibration[]{
 if(!Array.isArray(value)||value.length>24)throw new Error('Keep up to 24 valid fit results.')
 const records=value.map(parseCalibration)
 if(new Set(records.map(record=>record.id)).size!==records.length)throw new Error('Saved fit results contain duplicate identifiers.')
 return records
}
export function readCalibrations():FitCalibration[]{const raw=localStorage.getItem(key)??'[]';if(raw.length>64000)throw new Error('Saved fit results exceed the supported size.');return validateCollection(JSON.parse(raw))}
export function saveCalibrations(records:FitCalibration[]){localStorage.setItem(key,JSON.stringify(validateCollection(records)))}
