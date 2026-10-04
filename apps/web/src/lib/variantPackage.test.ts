import {expect,it} from 'vitest'
import {createDocument,createNode,evaluateParameters} from '@formforge/model'
import {unzipSync,strFromU8} from 'fflate'
import {captureParameterVariant,editParameterVariant} from './parameterVariants'
import {variantTable,variantCsv,createVariantPackage} from './variantPackage'
import {evaluate} from '@/geometry/geometry.worker'
import {csv} from './exportPackage'
function fixture(){const node=createNode('box');node.parameterBindings={width:'Width'};const doc={...createDocument(),nodes:[node],namedParameters:[{id:'w',name:'Width',value:20,expression:'',unit:'mm' as const}]};return {...doc,parameterVariants:[captureParameterVariant(doc,'Small'),captureParameterVariant({...doc,namedParameters:doc.namedParameters.map(p=>({...p,value:40}))},'Large')]}}
it('compares resolved values, updates snapshots without mutating the active parameters and enforces names',()=>{
 const doc=fixture();expect(variantTable(doc).rows[0]!.values).toEqual(['20 mm','20 mm','40 mm'])
 const renamed=editParameterVariant(doc,doc.parameterVariants[0]!.id,'Compact');expect(renamed.parameterVariants![0]!.name).toBe('Compact')
 const updated=editParameterVariant(doc,doc.parameterVariants[1]!.id,'Large',true);expect(evaluateParameters(updated.parameterVariants![1]!.parameters).get('Width')!.value).toBe(20)
 expect(doc.parameterVariants[1]!.parameters[0]!.value).toBe(40);expect(()=>editParameterVariant(doc,doc.parameterVariants[0]!.id,'large')).toThrow(/different/)
 expect(variantCsv(doc)).toContain('40 mm');expect(csv([['=HYPERLINK("x")']])).toContain("'=HYPERLINK")
})
it('builds separate real geometry and per-variant reports without changing the editor snapshot',async()=>{
 const doc=fixture(),before=JSON.stringify(doc),ids=doc.parameterVariants.map(v=>v.id)
 const result=await createVariantPackage(doc,ids,'stl',undefined,()=>{},evaluate),files=unzipSync(new Uint8Array(await result.arrayBuffer()))
 expect(Object.keys(files).filter(f=>f.endsWith('.stl'))).toHaveLength(2)
 expect(strFromU8(files['01-small/print-report.txt']!)).toContain('Size: 20.00')
 expect(strFromU8(files['02-large/print-report.txt']!)).toContain('Size: 40.00')
 expect(JSON.stringify(doc)).toBe(before)
})
it('rejects invalid selections and cancels without returning partial results',async()=>{
 const doc=fixture();await expect(createVariantPackage(doc,[],'3mf')).rejects.toThrow(/Select/)
 const controller=new AbortController();controller.abort();await expect(createVariantPackage(doc,[doc.parameterVariants[0]!.id],'stl',controller.signal)).rejects.toThrow(/cancelled/)
 const failed=async()=>{throw new Error('Evaluation failed')};await expect(createVariantPackage(doc,doc.parameterVariants.map(v=>v.id),'stl',undefined,()=>{},failed)).rejects.toThrow(/Evaluation failed/)
})
