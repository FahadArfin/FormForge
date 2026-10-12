import {describe,it,expect} from 'vitest'
import {designPlanSchema} from './engineering.js'
describe('engineering plan boundary',()=>{
 const base={version:1,title:'Shelf',requirements:[],questions:[],assumptions:[],expectedChecks:[],operations:[]}
 it('accepts a clarification-only plan',()=>expect(designPlanSchema.parse(base).version).toBe(1))
 it('rejects arbitrary code and excess operations',()=>{
 expect(()=>designPlanSchema.parse({...base,operations:[{type:'execute',code:'alert(1)'}]})).toThrow()
 expect(()=>designPlanSchema.parse({...base,operations:Array(65).fill({type:'place-on-bed'})})).toThrow()
 })
 it('requires real rack measurements',()=>expect(()=>designPlanSchema.parse({...base,operations:[{type:'rack-shelf',dimensions:{width:254}}]})).toThrow())
})
