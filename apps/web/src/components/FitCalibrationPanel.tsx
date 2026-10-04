import {useEffect,useState} from 'react'
import {useEditor} from '@/store/editor'
import {useInspection} from '@/store/inspection'
import {calibrationMatches,parseCalibration,readCalibrations,saveCalibrations,type FitCalibration} from '@/lib/fitCalibration'
import {NumberInput} from './NumberInput'
export function FitCalibrationPanel(){
 const printer=useEditor(s=>s.document.printer),material=useEditor(s=>s.document.printMaterial?.name??'Unspecified material')
 const [records,setRecords]=useState<FitCalibration[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [loaded,setLoaded]=useState(false)
 const [name,setName]=useState('My sliding fit'),[layer,setLayer]=useState(.2),[diameter,setDiameter]=useState(4),[clearance,setClearance]=useState(.2),[fit,setFit]=useState<FitCalibration['fit']>('sliding'),[notes,setNotes]=useState(''),[confirmed,setConfirmed]=useState(false)
 useEffect(()=>{try{setRecords(readCalibrations());setLoaded(true)}catch(e){setError(`${(e as Error).message} Existing saved data has been kept. Recording is disabled until it can be read.`)}},[])
 const persist=(next:FitCalibration[])=>{saveCalibrations(next);setRecords(next)}
 return <section className="workflow-card fit-calibration"><h3>Fit calibration</h3><p>Print a hole strip and pin with your actual settings, then record which fit worked.</p>
  <button className="workflow-action secondary" onClick={()=>window.dispatchEvent(new CustomEvent('formforge:open-inspector',{detail:{tab:'tools',toolkit:'create',tool:'coupon'}}))}>Create a fit-test coupon</button>
  <details><summary>Record a printed result</summary><form onSubmit={e=>{e.preventDefault();setError('');setNotice('');try{if(!loaded)throw new Error('Existing fit results could not be read. They have not been replaced.');if(material==='Unspecified material')throw new Error('Choose or name your material in Material estimate before recording a fit.');if(!confirmed)throw new Error('Confirm you printed and checked this fit first.');const record=parseCalibration({id:crypto.randomUUID(),name,printerName:printer.name,materialName:material,nozzleDiameter:printer.nozzleDiameter,layerHeight:layer,nominalDiameter:diameter,orientation:'vertical-hole',fit,diametralClearance:clearance,recordedAt:new Date().toISOString(),notes});persist([record,...records]);setConfirmed(false);setNotice('Your measured fit result was saved on this device.')}catch(e){setError((e as Error).message)}}}>
   <p>Setup: {printer.name} · {printer.nozzleDiameter} mm nozzle · {material}. Update printer/material settings above if these differ from your test.</p>
   <label className="cad-select-label">Result name<input value={name} maxLength={80} onChange={e=>setName(e.target.value)} required/></label>
   <NumberInput label="Layer height" suffix="mm" value={layer} min={.02} max={1} onChange={setLayer}/>
   <NumberInput label="Nominal pin diameter" suffix="mm" value={diameter} min={1} max={50} onChange={setDiameter}/>
   <NumberInput label="Successful diametral clearance" suffix="mm" value={clearance} min={0} max={3} onChange={setClearance}/>
   <p className="workflow-caption">Total diameter difference: {clearance.toFixed(2)} mm = {(clearance/2).toFixed(2)} mm per side. Test applies to upright holes of this size; other shapes and orientations can differ.</p>
   <label className="cad-select-label">Observed fit<select value={fit} onChange={e=>setFit(e.target.value as FitCalibration['fit'])}><option value="snug">Snug</option><option value="sliding">Sliding</option><option value="loose">Loose</option></select></label>
   <label className="cad-select-label">Print notes<textarea value={notes} maxLength={500} onChange={e=>setNotes(e.target.value)} placeholder="Layer settings, filament brand and observations"/></label>
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I printed and checked this result</label><button className="workflow-action" type="submit" disabled={!loaded}>Save measured result</button>
  </form></details>
  {loaded&&records.length===0&&<p>No measured results yet. Fit depends on the printer, material, size and settings.</p>}
  <ul className="calibration-list">{records.map(record=>{const matches=material!=='Unspecified material'&&calibrationMatches(record,printer,material);return <li key={record.id}><strong>{record.name} · +{record.diametralClearance} mm</strong><p>{record.printerName} · {record.materialName} · {record.layerHeight} mm layers · {record.nominalDiameter} mm pin · {record.fit}</p><small>User-reported test · {new Date(record.recordedAt).toLocaleDateString()}</small>{record.notes&&<p>{record.notes}</p>}{!matches&&<p>Different printer, nozzle or material from the current setup.</p>}<button disabled={!matches} className="workflow-action secondary" onClick={()=>{window.dispatchEvent(new CustomEvent('formforge:open-inspector',{detail:{tab:'tools',toolkit:'create',tool:'holes'}}));useInspection.setState({pendingFit:record});setNotice('Hole builder opened with your measured clearance. Review it before creating a cutout.')}}>Use in hole builder</button><button className="workflow-text-action" onClick={()=>{try{persist(records.filter(r=>r.id!==record.id));setError('')}catch(e){setError((e as Error).message)}}}>Remove {record.name}</button></li>})}</ul>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
}
