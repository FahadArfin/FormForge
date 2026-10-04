// @vitest-environment jsdom
import {expect,it} from 'vitest'
import {PerspectiveCamera,Vector3} from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {cameraDistanceLimits,changeProjection,cameraSpan} from './cameraProjection'
it.each([.01,100])('preserves orthographic scale through live OrbitControls at zoom %s',zoom=>{
 const target=new Vector3(),start=new PerspectiveCamera(38,1,.1,4000);start.position.set(0,-100,30)
 const ortho=changeProjection(start,target,'orthographic',1);ortho.zoom=zoom;ortho.updateProjectionMatrix()
 const span=cameraSpan(ortho,target),perspective=changeProjection(ortho,target,'perspective',1),canvas=document.createElement('canvas'),controls=new OrbitControls(perspective,canvas)
 try{controls.target.copy(target);controls.minDistance=cameraDistanceLimits.min;controls.maxDistance=cameraDistanceLimits.max;controls.update();expect(cameraSpan(perspective,target)).toBeCloseTo(span,4);expect(perspective.far).toBeGreaterThan(perspective.position.distanceTo(target))}finally{controls.dispose()}
})

it('keeps the target inside clipping planes after repeated wheel zooms',async()=>{
 const {updateCameraClipping}=await import('./cameraProjection'),camera=new PerspectiveCamera(38,1,.1,4000);camera.position.set(0,-100,30)
 const canvas=document.createElement('canvas');document.body.append(canvas);const controls=new OrbitControls(camera,canvas)
 controls.minDistance=cameraDistanceLimits.min;controls.maxDistance=cameraDistanceLimits.max;const update=()=>updateCameraClipping(camera,controls.target);controls.addEventListener('change',update)
 try{for(let i=0;i<100;i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:120,cancelable:true}));expect(camera.position.length()).toBeGreaterThan(4000);expect(camera.far).toBeGreaterThan(camera.position.length());expect(new Vector3().project(camera).z).toBeLessThan(1)}finally{controls.dispose();canvas.remove()}
})
