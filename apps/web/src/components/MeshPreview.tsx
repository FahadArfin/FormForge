import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
export function MeshPreview({mesh,label='Geometry preview'}:{mesh:{positions:ArrayLike<number>;indices:ArrayLike<number>};label?:string}) {
 const host=useRef<HTMLDivElement>(null),[error,setError]=useState('')
 useEffect(()=>{
  const el=host.current;if(!el)return
  let renderer:THREE.WebGLRenderer
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{setError('3D preview unavailable. Dimensions and checks are still available.');return}
  setError('');renderer.setPixelRatio(Math.min(devicePixelRatio,2));el.appendChild(renderer.domElement)
  const scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(mesh.positions),3));geometry.setIndex(Array.from(mesh.indices));geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox()
  const center=geometry.boundingSphere!.center,radius=Math.max(geometry.boundingSphere!.radius,1),camera=new THREE.PerspectiveCamera(40,1,radius/1000,radius*100);camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(1,-1.5,1).normalize().multiplyScalar(radius*3.5))
  const material=new THREE.MeshStandardMaterial({color:0x5578ee,roughness:.55,side:THREE.DoubleSide});scene.add(new THREE.Mesh(geometry,material));scene.add(new THREE.HemisphereLight(0xffffff,0x737e99,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(1,-1,3);scene.add(light)
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.enablePan=false;controls.update()
  const draw=()=>{const width=el.clientWidth,height=el.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();renderer.render(scene,camera)}
  const resize=new ResizeObserver(draw);resize.observe(el);controls.addEventListener('change',draw);draw()
  return()=>{resize.disconnect();controls.dispose();geometry.dispose();material.dispose();renderer.dispose();renderer.domElement.remove()}
 },[mesh])
 return <div><div className="mesh-preview" ref={host} role="img" aria-label={label}/>{error?<p role="status">{error}</p>:<p className="workflow-caption">Drag to orbit · scroll to zoom</p>}</div>
}
