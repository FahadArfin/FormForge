/** Manual benchmark: npx vitest run --config apps/web/vite.config.ts scripts/volume-sculpt-benchmark.test.ts */
import {it,expect} from 'vitest'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createDocument,createNode,vec3,type ModelDocument} from '@formforge/model'
import {evaluate,VolumeEvaluator} from '../apps/web/src/geometry/geometry.worker'

it('compares full replay with incremental volume strokes at unchanged brush fidelity',async()=>{
 const plate=createNode('box');plate.parameters={...plate.parameters,width:200,depth:120,height:4};plate.transform.position=vec3(0,0,2)
 const initial:ModelDocument={...createDocument(),nodes:[plate],sculptStrokes:[]}
 const results=[]
 for(const incremental of [false,true]){
  const evaluator=incremental?new VolumeEvaluator():null
  const run=(document:ModelDocument)=>evaluator?evaluator.evaluate(document):evaluate(document)
  let doc=initial,volume=0;const times:number[]=[]
  try{
   await run(doc)
   for(let batch=0;batch<20;batch++){
    for(let j=0;j<4;j++){const i=batch*4+j;doc={...doc,sculptStrokes:[...doc.sculptStrokes,{id:`s${i}`,nodeId:plate.id,mode:i<40?'add':'carve',center:vec3(-40+(i%40)*2,i<40?-12:12,i<40?1.3:6.7),radius:4,strength:.35,falloff:'smooth',createdAt:doc.createdAt}]}}
    const start=performance.now(),mesh=await run(doc);times.push(performance.now()-start);volume=mesh.volume;expect(volume).toBeGreaterThan(0)
   }
  }finally{evaluator?.dispose()}
  results.push({incremental,stamps:80,updates:times.length,volume,totalMs:times.reduce((a,b)=>a+b,0),medianMs:[...times].sort((a,b)=>a-b)[10],lastMs:times.at(-1),times})
 }
 expect(results[1]!.volume).toBeCloseTo(results[0]!.volume,6)
 mkdirSync('.audit/volume-sculpt',{recursive:true})
 writeFileSync('.audit/volume-sculpt/comparison.json',JSON.stringify({note:'Local CPU/WASM benchmark; excludes rendering and input overhead. No FPS guarantee.',results},null,2))
},120000)
