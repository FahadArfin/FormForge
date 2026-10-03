import type { MeshPayload, ModelDocument, PrintAnalysis, PrintIssue, Vec3Value } from './types.js'

export function analyzeForPrint(document: ModelDocument, mesh: MeshPayload | null, dimensions: Vec3Value): PrintAnalysis {
  const issues: PrintIssue[] = []
  const { buildVolume } = document.printer
  const activeNodes = document.nodes.filter((node) => !node.suppressed)

  if (!mesh || mesh.triangleCount === 0) {
    issues.push({ id: 'empty', severity: 'error', title: 'No printable solid', description: 'Add at least one solid shape before exporting.' })
  }
  if (dimensions.x > buildVolume.x || dimensions.y > buildVolume.y || dimensions.z > buildVolume.z) {
    issues.push({ id: 'build-volume', severity: 'error', title: 'Outside build volume', description: `The model exceeds ${buildVolume.x} × ${buildVolume.y} × ${buildVolume.z} mm.` })
  }
  if(mesh?.positions.length){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
    for(let i=0;i<mesh.positions.length;i++){const axis=i%3;min[axis]=Math.min(min[axis]!,mesh.positions[i]!);max[axis]=Math.max(max[axis]!,mesh.positions[i]!)}
    const epsilon=.05
    if(min[0]! < -buildVolume.x/2-epsilon || max[0]! > buildVolume.x/2+epsilon || min[1]! < -buildVolume.y/2-epsilon || max[1]! > buildVolume.y/2+epsilon || max[2]! > buildVolume.z+epsilon) issues.push({id:'bed-position',severity:'warning',title:'Geometry extends beyond the build plate',description:'The bed is centered at X/Y = 0. Center the model, arrange its parts, or change the printer size before slicing.'})
    if(min[2]! < -epsilon)issues.push({id:'below-bed',severity:'warning',title:'Geometry below the build plate',description:'Part of the model is below Z = 0. Drop the model onto the plate before slicing.'})
    else if(min[2]! > epsilon)issues.push({id:'floating',severity:'warning',title:'Model floats above the plate',description:'The lowest point is above Z = 0. Drop the model onto the plate before slicing.'})
  }
  if (activeNodes.some((node) => node.boolean === 'cut') && activeNodes.every((node) => node.boolean === 'cut')) {
    issues.push({ id: 'cuts-only', severity: 'error', title: 'Only carve shapes', description: 'A carve needs a solid shape to remove material from.' })
  }
  if (mesh && mesh.triangleCount > 0 && Math.min(dimensions.x, dimensions.y, dimensions.z) < document.printer.minimumWall) {
    issues.push({ id: 'thin', severity: 'warning', title: 'Small overall dimension', description: `An overall model dimension is below the ${document.printer.minimumWall} mm wall target. Local wall thickness is not measured; check thin features in your slicer.` })
  }
  if (mesh && mesh.triangleCount > 500_000) {
    issues.push({ id: 'dense', severity: 'info', title: 'Dense mesh', description: 'Consider simplifying the model before sharing or slicing.' })
  }

  return {
    status: issues.some((issue) => issue.severity === 'error') ? 'blocked' : issues.some((issue) => issue.severity === 'warning') ? 'warning' : 'ready',
    dimensions,
    volume: mesh?.volume ?? 0,
    triangleCount: mesh?.triangleCount ?? 0,
    issues,
  }
}
