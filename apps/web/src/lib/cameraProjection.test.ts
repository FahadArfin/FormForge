import {expect,it} from 'vitest'
import {OrthographicCamera,PerspectiveCamera,Vector3} from 'three'
import {changeProjection,resizeCamera,frameCamera,zoomCamera} from './cameraProjection'
it('switches projection without changing target or apparent center-plane scale, and resizes / zooms / frames',()=>{
 const target=new Vector3(0,0,0),perspective=new PerspectiveCamera(38,2,.1,4000);perspective.position.set(0,-100,30);perspective.up.set(0,0,1)
 const ortho=changeProjection(perspective,target,'orthographic',2)
 expect(ortho).toBeInstanceOf(OrthographicCamera)
 const span=(ortho as OrthographicCamera).top*2
 expect(span).toBeCloseTo(2*perspective.position.length()*Math.tan(38*Math.PI/360))
 zoomCamera(ortho,target,.8);expect(ortho.zoom).toBeCloseTo(1.25)
 resizeCamera(ortho,target,1);expect((ortho as OrthographicCamera).right).toBeCloseTo((ortho as OrthographicCamera).top)
 frameCamera(ortho,target,new Vector3(10,20,30),new Vector3(50,40,30),1)
 expect(target.toArray()).toEqual([10,20,30]);expect(ortho.zoom).toBe(1)
 const back=changeProjection(ortho,target,'perspective',1);expect(back).toBeInstanceOf(PerspectiveCamera)
 expect(back.position.distanceTo(target)).toBeGreaterThan(30)
})
