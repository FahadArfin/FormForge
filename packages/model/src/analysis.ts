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
