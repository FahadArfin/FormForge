import {OrthographicCamera,PerspectiveCamera,Vector3,MathUtils} from 'three'
export type StudioCamera=PerspectiveCamera|OrthographicCamera
export const cameraDistanceLimits={min:.001,max:30_000_000}
export function updateCameraClipping(camera:StudioCamera,target:Vector3){
 const distance=camera.position.distanceTo(target)
 camera.near=Math.max(.00001,Math.min(.1,distance/10000));camera.far=Math.max(4000,distance*20);camera.updateProjectionMatrix()
}
export function cameraSpan(camera:StudioCamera,target:Vector3){return camera instanceof OrthographicCamera?(camera.top-camera.bottom)/camera.zoom:2*camera.position.distanceTo(target)*Math.tan(MathUtils.degToRad(camera.fov/2))/camera.zoom}
export function changeProjection(previous:StudioCamera,target:Vector3,projection:'perspective'|'orthographic',aspect:number):StudioCamera{
 const span=cameraSpan(previous,target),direction=previous.position.clone().sub(target).normalize()
 const camera=projection==='orthographic'?new OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,previous.near,previous.far):new PerspectiveCamera(38,aspect,previous.near,previous.far)
 camera.position.copy(previous.position);camera.up.copy(previous.up)
 if(camera instanceof PerspectiveCamera)camera.position.copy(target).addScaledVector(direction,span/(2*Math.tan(MathUtils.degToRad(camera.fov/2))))
 const distance=camera.position.distanceTo(target);camera.near=Math.max(.0001,distance/10000);camera.far=Math.max(4000,distance*20)
 camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();return camera
}
export function resizeCamera(camera:StudioCamera,target:Vector3,aspect:number){
 if(camera instanceof OrthographicCamera){const oldAspect=(camera.right-camera.left)/(camera.top-camera.bottom),half=(camera.top-camera.bottom)/2*Math.min(1,oldAspect)/Math.min(1,aspect);camera.top=half;camera.bottom=-half;camera.left=-half*aspect;camera.right=half*aspect}
 else {camera.position.sub(target).multiplyScalar(Math.min(1,camera.aspect)/Math.min(1,aspect)).add(target);camera.aspect=aspect}
 camera.updateProjectionMatrix()
}
export function zoomCamera(camera:StudioCamera,target:Vector3,factor:number){
 if(camera instanceof OrthographicCamera){camera.zoom=Math.min(100,Math.max(.01,camera.zoom/factor));camera.updateProjectionMatrix()}
 else {const offset=camera.position.clone().sub(target),distance=offset.length();camera.position.copy(target).add(offset.normalize().multiplyScalar(Math.min(100000,Math.max(.5,distance*factor))))}
}
export function frameCamera(camera:StudioCamera,target:Vector3,center:Vector3,size:Vector3,aspect:number){
 const direction=camera.position.clone().sub(target).normalize(),span=Math.max(.1,size.length()*1.15/Math.min(1,aspect))
 const distance=Math.max(12,span/(2*Math.tan(MathUtils.degToRad(38/2))))
 target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);camera.zoom=1
 if(camera instanceof OrthographicCamera){camera.top=span/2;camera.bottom=-span/2;camera.left=-span*aspect/2;camera.right=span*aspect/2}
 camera.near=Math.max(.001,distance/1000);camera.far=Math.max(1000,distance*20);camera.updateProjectionMatrix()
}
