import type { Vec3Value } from '@formforge/model'
import { analyzeMesh, type MeshData, type MeshDiagnostics } from './meshTools'

export const INSPECTION_TRIANGLE_LIMIT = 100_000
export const INSPECTION_TIMEOUT_MS = 20_000
export type InspectionMesh = { positions: ArrayLike<number>; indices: ArrayLike<number> }
export interface MeshProperties {
  dimensions: Vec3Value
  bounds: { min: Vec3Value; max: Vec3Value }
  surfaceArea: number
  volume: number | null
  centroid: Vec3Value | null
  diagnostics: MeshDiagnostics
  volumeReason: string | null
}

/** Bounds are checked before cloning a mesh into the worker. Doctor accepts damaged faces to report/clean them. */
export function validateInspectionMesh(mesh: InspectionMesh, allowDamaged = false) {
  if (mesh.indices.length > INSPECTION_TRIANGLE_LIMIT * 3 || mesh.positions.length > INSPECTION_TRIANGLE_LIMIT * 9) throw new Error('Inspect at most 100,000 triangles and 300,000 vertices at a time. Select a smaller part.')
  if (!mesh.indices.length || !mesh.positions.length) throw new Error('The evaluated mesh is empty. Add or enable a solid first.')
  if (!allowDamaged && (mesh.positions.length % 3 || mesh.indices.length % 3 || Array.from(mesh.positions).some(v => !Number.isFinite(v)) || Array.from(mesh.indices).some(v => !Number.isInteger(v) || v < 0 || v >= mesh.positions.length / 3))) throw new Error('The mesh has invalid coordinates or indices. Inspect its source with Mesh Doctor first.')
}

class Sum {
  value = 0
  private correction = 0
  add(value: number) { const adjusted = value - this.correction, next = this.value + adjusted; this.correction = (next - this.value) - adjusted; this.value = next }
}
type Point = [number, number, number]
const vector = (p: Point): Vec3Value => ({ x: p[0], y: p[1], z: p[2] })
const subtract = (a: Point, b: Point): Point => [a[0]-b[0],a[1]-b[1],a[2]-b[2]]
const cross = (a: Point, b: Point): Point => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const dot = (a: Point, b: Point) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]

/** Signed integration preserves inward cavity shells. Shift first to avoid cancellation far from the origin. */
export function inspectMeshProperties(input: InspectionMesh): MeshProperties {
  validateInspectionMesh(input)
  const mesh: MeshData = { positions: Array.from(input.positions), indices: Array.from(input.indices) }
  const diagnostics = analyzeMesh(mesh, 0)
  const point = (id: number): Point => [mesh.positions[id*3]!,mesh.positions[id*3+1]!,mesh.positions[id*3+2]!]
  const min: Point = [Infinity,Infinity,Infinity], max: Point = [-Infinity,-Infinity,-Infinity]
  for (const id of mesh.indices) { const p=point(id); for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis]!,p[axis]!);max[axis]=Math.max(max[axis]!,p[axis]!)} }
  const origin = min.map((v,i)=>v+(max[i]!-v)/2) as Point
  const area = new Sum(), volume = new Sum(), moment = [new Sum(),new Sum(),new Sum()]
  const faceVolumes: number[] = []
  for (let i=0;i<mesh.indices.length;i+=3) {
    const a=subtract(point(mesh.indices[i]!),origin), b=subtract(point(mesh.indices[i+1]!),origin), c=subtract(point(mesh.indices[i+2]!),origin)
    area.add(Math.hypot(...cross(subtract(b,a),subtract(c,a)))/2)
    const signed=dot(a,cross(b,c))/6
    faceVolumes.push(signed); volume.add(signed)
    for(let axis=0;axis<3;axis++)moment[axis]!.add(signed*(a[axis]!+b[axis]!+c[axis]!)/4)
  }
  let volumeReason: string | null = diagnostics.watertight ? null : 'Volume and centroid need a closed surface without invalid, duplicate, degenerate or inconsistently wound faces.'
  if (!volumeReason) volumeReason = shellOrientationIssue(mesh, faceVolumes, point)
  if (!volumeReason && (!Number.isFinite(volume.value) || volume.value === 0)) volumeReason = 'The signed solid volume is zero or could not be represented accurately.'
  const centroid = !volumeReason ? vector(origin.map((v,i)=>v+moment[i]!.value/volume.value) as Point) : null
  if (!Number.isFinite(area.value) || !max.every((v,i)=>Number.isFinite(v-min[i]!)) || (centroid && !Object.values(centroid).every(Number.isFinite))) throw new Error('The coordinates exceed the numerical range supported by mesh inspection.')
  return { dimensions: vector(max.map((v,i)=>v-min[i]!) as Point), bounds: {min:vector(min),max:vector(max)}, surfaceArea: area.value, volume: volumeReason ? null : Math.abs(volume.value), centroid, diagnostics, volumeReason }
}

/** Check relative shell orientation without flipping or repairing the source. Not a self-intersection test. */
function shellOrientationIssue(mesh: MeshData, volumes: number[], point: (id: number)=>Point): string | null {
  const parents = Int32Array.from({length:volumes.length},(_,i)=>i), firstAtEdge = new Map<string,number>()
  const root = (i:number):number => { while(parents[i]!==i){parents[i]=parents[parents[i]!]!;i=parents[i]!}return i }
  // A shared point does not connect surface shells: separate vertex fans must keep
  // their own orientation, including an external shell touching a solid at a corner.
  for(let face=0;face<volumes.length;face++)for(let corner=0;corner<3;corner++) {
    const a=point(mesh.indices[face*3+corner]!).join(','), b=point(mesh.indices[face*3+(corner+1)%3]!).join(',')
    const key=a<b?`${a}|${b}`:`${b}|${a}`, previous=firstAtEdge.get(key)
    if(previous===undefined) firstAtEdge.set(key,face); else parents[root(face)]=root(previous)
  }
  const components = new Map<number,number[]>()
  for(let face=0;face<volumes.length;face++){const id=root(face), faces=components.get(id)??[];faces.push(face);components.set(id,faces)}
  if(components.size>128) return 'Shell orientation is bounded to 128 connected shells. Inspect smaller groups for volume and centroid.'
  const shells=[...components.values()].map(faces=>{
    const min:Point=[Infinity,Infinity,Infinity],max:Point=[-Infinity,-Infinity,-Infinity],sum=new Sum()
    for(const face of faces){sum.add(volumes[face]!);for(let corner=0;corner<3;corner++){const p=point(mesh.indices[face*3+corner]!);for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis]!,p[axis]!);max[axis]=Math.max(max[axis]!,p[axis]!)}}}
    return {faces,min,max,volume:sum.value,sample:point(mesh.indices[faces[0]!*3]!)}
  })
  const orientation = Math.sign(shells.reduce((largest,shell)=>Math.abs(shell.volume)>Math.abs(largest)?shell.volume:largest,0))
  if(!orientation) return 'A closed shell has zero signed volume.'
  for(const shell of shells){
    let depth=0
    for(const outer of shells){
      if(shell===outer || !shell.sample.every((v,i)=>v>outer.min[i]!&&v<outer.max[i]!))continue
      const angles=new Sum()
      for(const face of outer.faces){
        const a=subtract(point(mesh.indices[face*3]!),shell.sample),b=subtract(point(mesh.indices[face*3+1]!),shell.sample),c=subtract(point(mesh.indices[face*3+2]!),shell.sample)
        const la=Math.hypot(...a),lb=Math.hypot(...b),lc=Math.hypot(...c)
        angles.add(2*Math.atan2(dot(a,cross(b,c)),la*lb*lc+dot(a,b)*lc+dot(b,c)*la+dot(c,a)*lb))
      }
      if(Math.abs(angles.value)>2*Math.PI)depth++
    }
    if(Math.sign(shell.volume)!==orientation*(depth%2 ? -1:1))return 'Disconnected or nested shells have inconsistent orientation. Cavity direction is not inferred or repaired.'
  }
  return null
}
