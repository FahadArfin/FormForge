import {expect,it} from 'vitest'
import {createDocument,vec3} from '@formforge/model'
import {angleDegrees,geometryKey,pinAnnotation} from './annotations'
it('measures vertex angles and rejects coincident arms',()=>{expect(angleDegrees([vec3(1,0,0),vec3(),vec3(0,1,0)])).toBeCloseTo(90);expect(()=>angleDegrees([vec3(),vec3(),vec3(1,1,0)])).toThrow()})
it('keeps metadata changes current and marks changed geometry stale',()=>{const d=createDocument();const next=pinAnnotation(d,'distance',[vec3(),vec3(10,0,0)],'Width');expect(next.annotations![0]!.geometryKey).toBe(geometryKey(next));expect(geometryKey({...next,name:'Rename'})).toBe(geometryKey(d));next.nodes[0]!.parameters.width++;expect(geometryKey(next)).not.toBe(next.annotations![0]!.geometryKey)})
