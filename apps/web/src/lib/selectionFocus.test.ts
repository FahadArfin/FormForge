import { expect,it } from 'vitest'
import { createNode } from '@formforge/model'
import { focusSelection, overlapChoices } from './selectionFocus'
it('focuses complete groups and excludes suppressed shapes',()=>{const a={...createNode('box'),combined:true,groupId:'g'},b={...createNode('cylinder','cut'),combined:true,groupId:'g'},c={...createNode('box'),suppressed:true};expect(focusSelection([a,b,c],[a.id,c.id])).toEqual([a.id,b.id])})
it('deduplicates ray hits and excludes hidden, locked or suppressed sources',()=>{const a=createNode('box'),b={...createNode('box'),locked:true};expect(overlapChoices([a,b],[a.id,a.id,b.id,'missing'])).toEqual([a.id])})
