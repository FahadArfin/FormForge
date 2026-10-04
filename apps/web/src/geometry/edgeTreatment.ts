import type {Manifold,ManifoldToplevel,Vec3} from 'manifold-3d'
import type {ModelNode} from '@formforge/model'
/** A single straight box edge. Corner blends and arbitrary mesh edges are excluded. */
export function validateEdgeTreatment(node:ModelNode){
 const e=node.edgeTreatment;if(!e)return
 if(node.kind!=='box'||Object.values(node.transform.scale).some(v=>Math.abs(v-1)>1e-6)||node.deformation?.kind&&node.deformation.kind!=='none'||Object.values(node.surface??{}).some(v=>v>0))throw new Error('Edge prototype needs an unscaled box without deformation or surface modifiers.')
 const sizes={x:node.parameters.width,y:node.parameters.depth,z:node.parameters.height},adjacent=(['x','y','z'] as const).filter(a=>a!==e.axis)
 if(!['x','y','z'].includes(e.axis)||![1,-1].includes(e.sideU)||![1,-1].includes(e.sideV)||!['chamfer','fillet'].includes(e.mode)||!Number.isFinite(e.amount)||e.amount<.01||e.amount>1000||e.amount>=Math.min(...adjacent.map(a=>sizes[a]))/2)throw new Error('Edge radius or setback must be 0.01–1,000 mm and smaller than half either adjacent face.')
}
/** Consumes shape, including on failure, and returns the sole retained result. */
export function treatBoxEdge(api:ManifoldToplevel,shape:Manifold,node:ModelNode):Manifold{
 const e=node.edgeTreatment;if(!e)return shape
 const owned:Manifold[]=[shape],keep=(s:Manifold)=>{owned.push(s);return s};let result:Manifold|undefined
 try{
  validateEdgeTreatment(node)
  const axis=['x','y','z'].indexOf(e.axis),cross=[0,1,2].filter(a=>a!==axis),a=cross[0]!,b=cross[1]!,size=[node.parameters.width,node.parameters.depth,node.parameters.height],r=e.amount
  if(e.mode==='chamfer'){
   const normal:Vec3=[0,0,0];normal[a]=-e.sideU*Math.SQRT1_2;normal[b]=-e.sideV*Math.SQRT1_2
   return result=shape.trimByPlane(normal,-(size[a]!/2+size[b]!/2-r)*Math.SQRT1_2)
  }
  const dimensions:Vec3=[0,0,0],center:Vec3=[0,0,0],cylinderCenter:Vec3=[0,0,0]
  dimensions[axis]=size[axis]!+.2;dimensions[a]=r;dimensions[b]=r
  center[a]=e.sideU*(size[a]!/2-r/2);center[b]=e.sideV*(size[b]!/2-r/2)
  cylinderCenter[a]=e.sideU*(size[a]!/2-r);cylinderCenter[b]=e.sideV*(size[b]!/2-r)
  const prism=keep(keep(api.Manifold.cube(dimensions,true)).translate(center))
  const baseCylinder=keep(api.Manifold.cylinder(size[axis]!+.4,r,r,96,true)),rotated=axis===0?keep(baseCylinder.rotate([0,90,0])):axis===1?keep(baseCylinder.rotate([90,0,0])):baseCylinder,cylinder=keep(rotated.translate(cylinderCenter))
  const cutter=keep(prism.subtract(cylinder));return result=shape.subtract(cutter)
 }finally{owned.forEach(s=>{if(s!==result)s.delete()})}
}
