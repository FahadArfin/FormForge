import {expect,it} from 'vitest'
import {createDocument,createNode} from '@formforge/model'
import {entityNodes,preferSolidPreview} from './shapeEntities'
it('keeps overlapping shapes independent until they are explicitly grouped',()=>{
 const a=createNode('box'),b=createNode('sphere')
 expect(entityNodes([a,b],a.id)).toEqual([a])
 expect(preferSolidPreview({...createDocument(),nodes:[a,b]})).toBe(false)
 a.combined=b.combined=true;a.groupId=b.groupId='joined'
 expect(entityNodes([a,b],b.id)).toEqual([a,b])
})
it('preserves legacy global cuts and sculpt result previews',()=>{
 expect(preferSolidPreview({...createDocument(),nodes:[createNode('box'),createNode('cylinder','cut')]})).toBe(true)
})
