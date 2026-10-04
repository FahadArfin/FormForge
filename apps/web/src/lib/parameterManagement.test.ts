import {expect,it} from 'vitest'
import {createDocument,createNode,type ModelDocument} from '@formforge/model'
import {renameDocumentParameter,parameterUsage,removeDocumentParameter} from './parameterManagement'
import {captureParameterVariant,applyParameterVariant} from './parameterVariants'
import {createStarter} from './starters'
import {applyTemplateDimensions,templateValues,templateLinkIssue} from './templateRecipes'

it('renames linked values and variants atomically without changing partial names',()=>{
 const node=createNode('box');node.parameterBindings={width:'Width',height:'wall_width'}
 const doc:ModelDocument={...createDocument(),nodes:[node],namedParameters:[{id:'w',name:'Width',expression:'20',value:20,unit:'mm' as const},{id:'h',name:'wall_width',expression:'Width / 2',value:10,unit:'mm' as const}]}
 doc.parameterVariants=[captureParameterVariant(doc,'Small')]
 const next=renameDocumentParameter(doc,'w','Outside width')
 expect(next.namedParameters[1]!.name).toBe('wall_width')
 expect(next.namedParameters[1]!.expression).toBe('[Outside width] / 2')
 expect(next.nodes[0]!.parameterBindings).toEqual({width:'[Outside width]',height:'wall_width'})
 expect(applyParameterVariant(next,next.parameterVariants![0]!).nodes[0]!.parameters.width).toBe(20)
 expect(doc.namedParameters[0]!.name).toBe('Width')
 expect(parameterUsage(next,'w').map(u=>u.kind)).toEqual(expect.arrayContaining(['parameter','shape','variant']))
 expect(()=>renameDocumentParameter(doc,'w','WALL_WIDTH')).toThrow(/name/i)
 expect(()=>removeDocumentParameter(doc,'w')).toThrow(/used/i)
})

it('preserves linked template customization through recipe parameter rename',()=>{
 const doc=createStarter('washer'),renamed=renameDocumentParameter(doc,'recipe:outer','Outside diameter')
 expect(templateLinkIssue(renamed)).toBe(null)
 expect(templateValues(renamed).outer).toBe(30)
 const resized=applyTemplateDimensions(renamed,{...templateValues(renamed),outer:36})
 expect(resized.namedParameters.find(p=>p.id==='recipe:outer')!.name).toBe('Outside diameter')
 expect(resized.nodes[0]!.parameters.radius).toBe(18)
})

it('removes an unused parameter but protects references saved in variants',()=>{
 const doc={...createDocument(),namedParameters:[{id:'w',name:'Width',expression:'',value:20,unit:'mm' as const}]}
 expect(removeDocumentParameter(doc,'w').namedParameters).toEqual([])
 const saved={...doc,parameterVariants:[captureParameterVariant(doc,'Only size')]}
 expect(()=>removeDocumentParameter(saved,'w')).toThrow(/used/i)
})

it('handles recipe names swapped through a temporary name without cascading rewrites',()=>{
 let doc=createStarter('washer');doc=renameDocumentParameter(doc,'recipe:outer','temporary');doc=renameDocumentParameter(doc,'recipe:bore','outer');doc=renameDocumentParameter(doc,'recipe:outer','bore')
 expect(templateLinkIssue(doc)).toBeNull();const next=applyTemplateDimensions(doc,{...templateValues(doc),outer:40,bore:10})
 expect(next.nodes[0]!.parameters.radius).toBe(20);expect(next.nodes[1]!.parameters.radius).toBe(5)
})
