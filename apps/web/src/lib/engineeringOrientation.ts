import type { MeshPayload, PrinterProfile, Vec3Value } from '@formforge/model'
import { Euler, MathUtils, Matrix4, Vector3 } from 'three'
import { validateInspectionMesh } from './meshInspection'
import { analyzeOverhangs } from './overhangs'

export interface EngineeringOrientation {
  id: string
  label: string
  /** Additional world-origin XYZ rotation in degrees. Center and drop after rotation. */
  rotation: Vec3Value
  dimensions: Vec3Value
  fitsBuildVolume: boolean
  bedContactArea: number
  overhangArea: number
}
const candidates = [
  {id:'z-up',label:'Current Z up',rotation:{x:0,y:0,z:0}},
  {id:'z-down',label:'Flip Z',rotation:{x:180,y:0,z:0}},
  {id:'y-up',label:'Y up',rotation:{x:90,y:0,z:0}},
  {id:'y-down',label:'Y down',rotation:{x:-90,y:0,z:0}},
  {id:'x-up',label:'X up',rotation:{x:0,y:-90,z:0}},
  {id:'x-down',label:'X down',rotation:{x:0,y:90,z:0}},
]
/** Six evaluated-mesh candidates, capped at 100k triangles; geometric ranking is a print heuristic. */
export function rankEngineeringOrientations(mesh: MeshPayload, printer: PrinterProfile): EngineeringOrientation[] {
  validateInspectionMesh(mesh)
  if (!Object.values(printer.buildVolume).every(v=>Number.isFinite(v)&&v>0)) throw new Error('Choose a finite positive build volume.')
  const point=new Vector3(), a=new Vector3(), b=new Vector3(), c=new Vector3()
  return candidates.map(candidate=>{
    const {rotation}=candidate
    const matrix=new Matrix4().makeRotationFromEuler(new Euler(MathUtils.degToRad(rotation.x),MathUtils.degToRad(rotation.y),MathUtils.degToRad(rotation.z),'XYZ'))
    const positions=new Float64Array(mesh.positions.length), min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity]
    for(let i=0;i<positions.length;i+=3){point.fromArray(mesh.positions,i).applyMatrix4(matrix);point.toArray(positions,i)}
    for(const id of mesh.indices) for(let axis=0;axis<3;axis++){const value=positions[id*3+axis]!;min[axis]=Math.min(min[axis]!,value);max[axis]=Math.max(max[axis]!,value)}
    for(let i=0;i<positions.length;i+=3){positions[i]=positions[i]!-(min[0]!+max[0]!)/2;positions[i+1]=positions[i+1]!-(min[1]!+max[1]!)/2;positions[i+2]=positions[i+2]!-min[2]!}
    const dimensions={x:max[0]!-min[0]!,y:max[1]!-min[1]!,z:max[2]!-min[2]!}
    let bedContactArea=0
    for(let i=0;i<mesh.indices.length;i+=3){
      a.fromArray(positions,mesh.indices[i]!*3);b.fromArray(positions,mesh.indices[i+1]!*3);c.fromArray(positions,mesh.indices[i+2]!*3)
      // Geometric area within 0.05 mm of the bed. First-layer deposition is not simulated.
      if(Math.max(Math.abs(a.z),Math.abs(b.z),Math.abs(c.z))<=.05){const normal=b.sub(a).cross(c.sub(a));if(normal.z<0)bedContactArea+=normal.length()/2}
    }
    return {...candidate,dimensions,bedContactArea,overhangArea:analyzeOverhangs({positions,indices:mesh.indices},printer.overhangAngle).area,
      fitsBuildVolume:(['x','y','z'] as const).every(axis=>dimensions[axis]<=printer.buildVolume[axis]+1e-6)}
  }).sort((a,b)=>Number(b.fitsBuildVolume)-Number(a.fitsBuildVolume)||b.bedContactArea-a.bedContactArea||a.overhangArea-b.overhangArea||a.dimensions.z-b.dimensions.z)
}

