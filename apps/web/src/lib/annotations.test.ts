import {expect,it} from 'vitest'
import {createDocument,vec3} from '@formforge/model'
import {angleDegrees,annotationValue,geometryKey,pinAnnotation} from './annotations'
it('measures vertex angles and rejects coincident arms',()=>{expect(angleDegrees([vec3(1,0,0),vec3(),vec3(0,1,0)])).toBeCloseTo(90);expect(()=>angleDegrees([vec3(),vec3(),vec3(1,1,0)])).toThrow()})
it('keeps metadata changes current and marks changed geometry stale',()=>{const d=createDocument();const next=pinAnnotation(d,'distance',[vec3(),vec3(10,0,0)],'Width');expect(next.annotations![0]!.geometryKey).toBe(geometryKey(next));expect(geometryKey({...next,name:'Rename'})).toBe(geometryKey(d));next.nodes[0]!.parameters.width++;expect(geometryKey(next)).not.toBe(next.annotations![0]!.geometryKey)})
it('pins diameter instead of a chord and snapshots its three picks',()=>{
 const doc=createDocument(),points=[vec3(5,0,0),vec3(0,5,0),vec3(-5,0,0)]
 const next=pinAnnotation(doc,'diameter',points,' Bore '),annotation=next.annotations![0]!
 expect(annotation.kind).toBe('diameter');expect(annotation.label).toBe('Bore');expect(annotationValue(annotation)).toBeCloseTo(10)
 expect(annotation.geometryKey).toBe(geometryKey(next));expect(next.revision).toBe(doc.revision+1)
 points[0]!.x=20;expect(annotation.points[0]!.x).toBe(5)
 next.nodes[0]!.transform.position.x=2;expect(annotation.geometryKey).not.toBe(geometryKey(next))
})
it('does not pin ambiguous circle geometry',()=>{
 expect(()=>pinAnnotation(createDocument(),'diameter',[vec3(),vec3(1,0,0),vec3(2,0,0)],'Bore')).toThrow(/line/)
})
