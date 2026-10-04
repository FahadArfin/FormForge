import {expect,it,vi,afterEach} from 'vitest'
import {parseCalibration,calibrationMatches,readCalibrations,saveCalibrations} from './fitCalibration'
afterEach(()=>vi.unstubAllGlobals())
const record={id:'a',name:'Sliding pin',printerName:'My printer',materialName:'PLA',nozzleDiameter:0.4,layerHeight:0.2,nominalDiameter:4,orientation:'vertical-hole',fit:'sliding',diametralClearance:0.3,recordedAt:'2026-10-03T00:00:00Z',notes:'Printed upright'}
it('records a tested diametral clearance and rejects unbounded or invalid input',()=>{
 expect(parseCalibration(record).diametralClearance).toBe(.3)
 for(const change of [{diametralClearance:NaN},{layerHeight:0},{nozzleDiameter:10},{nominalDiameter:0},{notes:'x'.repeat(501)},{orientation:'unknown'},{fit:['sliding']}])expect(()=>parseCalibration({...record,...change})).toThrow()
})
it('rejects duplicate or malformed stored records without overwriting existing data',()=>{
 const storage={getItem:vi.fn(()=>JSON.stringify([record,{...record,id:'broken',fit:null},{...record,id:'b'}])),setItem:vi.fn()};vi.stubGlobal('localStorage',storage)
 expect(()=>readCalibrations()).toThrow();expect(storage.setItem).not.toHaveBeenCalled()
 expect(()=>saveCalibrations([parseCalibration(record),parseCalibration(record)])).toThrow(/duplicate/)
 expect(storage.setItem).not.toHaveBeenCalled()
})
it('requires matching printer, material and nozzle before offering to use a result',()=>{
 const c=parseCalibration(record)
 expect(calibrationMatches(c,{name:'My printer',nozzleDiameter:.4},'PLA')).toBe(true)
 expect(calibrationMatches(c,{name:'My printer',nozzleDiameter:.6},'PLA')).toBe(false)
 expect(calibrationMatches(c,{name:'My printer',nozzleDiameter:.4},'PETG')).toBe(false)
})
