import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
export function MeshPreview({mesh,label='Geometry preview',warningIndices}:{mesh:{positions:ArrayLike<number>;indices:ArrayLike<number>};label?:string;warningIndices?:Uint32Array}) {
 const host=useRef<HTMLDivElement>(null),[error,setError]=useState('')
 const action=useRef<(command:string)=>void>(()=>undefined)
 useEffect(()=>{
  const el=host.current;if(!el)return
  let renderer:THREE.WebGLRenderer
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{setError('3D preview unavailable. Dimensions and checks are still available.');return}
  setError('');renderer.setPixelRatio(Math.min(devicePixelRatio,2));el.appendChild(renderer.domElement)
  const scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(mesh.positions),3));geometry.setIndex(Array.from(mesh.indices));geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox()
  const center=geometry.boundingSphere!.center,radius=Math.max(geometry.boundingSphere!.radius,1),camera=new THREE.PerspectiveCamera(40,1,radius/1000,radius*100);camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(1,-1.5,1).normalize().multiplyScalar(radius*3.5))
  const material=new THREE.MeshStandardMaterial({color:0x5578ee,roughness:.65,flatShading:true,side:THREE.DoubleSide});scene.add(new THREE.Mesh(geometry,material));scene.add(new THREE.HemisphereLight(0xffffff,0x737e99,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(1,-1,3);scene.add(light)
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.enablePan=false;controls.update()
  let warningGeometry:THREE.BufferGeometry|undefined,warningMaterial:THREE.MeshBasicMaterial|undefined
  if(warningIndices?.length){warningGeometry=new THREE.BufferGeometry();warningGeometry.setAttribute('position',geometry.getAttribute('position'));warningGeometry.setIndex(new THREE.BufferAttribute(warningIndices,1));warningMaterial=new THREE.MeshBasicMaterial({color:0xe77b16,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,depthWrite:false});scene.add(new THREE.Mesh(warningGeometry,warningMaterial))}
  const draw=()=>{const width=el.clientWidth,height=el.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();renderer.render(scene,camera)}
  const resize=new ResizeObserver(draw);resize.observe(el);controls.addEventListener('change',draw);draw()
  action.current=command=>{const offset=camera.position.clone().sub(center);if(command==='left'||command==='right')offset.applyAxisAngle(new THREE.Vector3(0,0,1),command==='left'?Math.PI/8:-Math.PI/8);else if(command==='in'||command==='out')offset.multiplyScalar(command==='in'?.8:1.25);else offset.copy(new THREE.Vector3(1,-1.5,1).normalize().multiplyScalar(radius*3.5));offset.clampLength(radius*.2,radius*20);camera.position.copy(center).add(offset);controls.update();draw()}
  return()=>{action.current=()=>undefined;resize.disconnect();controls.dispose();warningGeometry?.dispose();warningMaterial?.dispose();geometry.dispose();material.dispose();renderer.dispose();renderer.domElement.remove()}
 },[mesh,warningIndices])
 return <div><div className="mesh-preview" ref={host} role="img" aria-label={label}/>{error?<p role="status">{error}</p>:<><div className="preview-controls" role="group" aria-label="Preview camera">{[['left','Rotate left'],['right','Rotate right'],['in','Zoom in'],['out','Zoom out'],['reset','Reset view']].map(([key,label])=><button key={key} type="button" onClick={()=>action.current(key!)}>{label}</button>)}</div><p className="workflow-caption">Drag to orbit · scroll to zoom · or use the camera buttons</p></>}</div>
}
