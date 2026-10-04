type IndexedMesh={positions:ArrayLike<number>;indices:ArrayLike<number>}
export type OverhangAnalysis={indices:Uint32Array;faceCount:number;area:number;threshold:number}
const cache=new WeakMap<object,Map<number,OverhangAnalysis>>()
/** Geometric downward slopes; does not model bridges, layers or support generation. */
export function analyzeOverhangs(mesh:IndexedMesh,threshold:number):OverhangAnalysis {
 if(!Number.isFinite(threshold)||threshold<0||threshold>90)throw new Error('Choose an angle from 0 to 90 degrees.')
 const cached=cache.get(mesh)?.get(threshold);if(cached)return cached
 const {positions:p,indices:i}=mesh
 if(i.length>1_500_000||p.length>4_500_000)throw new Error('Overhang preview supports up to 500,000 triangles and 1.5 million vertices.')
 if(i.length%3||p.length%3)throw new Error('Geometry has incomplete vertices or faces.')
 for(let n=0;n<p.length;n++)if(!Number.isFinite(p[n]))throw new Error('Geometry has an invalid coordinate.')
 const flagged:number[]=[];let area=0
 for(let n=0;n<i.length;n+=3){
  const a=i[n]!,b=i[n+1]!,c=i[n+2]!
  if([a,b,c].some(v=>!Number.isInteger(v)||v<0||v>=p.length/3))throw new Error('Geometry has an invalid face index.')
  const ax=p[a*3]!,ay=p[a*3+1]!,az=p[a*3+2]!,bx=p[b*3]!,by=p[b*3+1]!,bz=p[b*3+2]!,cx=p[c*3]!,cy=p[c*3+1]!,cz=p[c*3+2]!
  const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,size=Math.hypot(nx,ny,nz)
  if(size<1e-12||nz>=0||[az,bz,cz].every(z=>Math.abs(z)<=.05))continue
  const angle=Math.acos(Math.min(1,Math.max(0,-nz/size)))*180/Math.PI
  if(angle<threshold){flagged.push(a,b,c);area+=size/2}
 }
 const result={indices:new Uint32Array(flagged),faceCount:flagged.length/3,area,threshold}
 // One threshold per mesh avoids retaining an overlay for every slider position.
 cache.set(mesh,new Map([[threshold,result]]));return result
}
